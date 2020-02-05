const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {sleep} = require('../util');
const jsone = require('json-e');
const chalk = require('chalk');
const {clientConfig, TASK_TEMPLATE, addTaskId} = require('./common');

// claimwork: create, claim and resolve tasks from a queue
exports.claimwork_loader = async ({name, stopper, logger, settings, monitor, tcapi}) => {
  const queue = new taskcluster.Queue(clientConfig);
  const taskQueueId = settings['task-queue-id'];
  const [tqi1, tqi2] = taskQueueId.split('/');
  const parallelism = settings['parallelism'];
  const targetCount = settings['pending-count'];

  let status = {
    numRunning: 0,
    numPending: 0,
  };

  monitor.output_fn(5, () => ` ▶ ${chalk.bold.cyan(name)}: ` +
    `${chalk.yellow('taskQueueId')}: ${taskQueueId}; ` +
    `${chalk.yellow('Running tasks')}: ${status.numRunning}; ` +
    `${chalk.yellow('Pending tasks')}: ${status.numPending}\n`);

  const makeTask = async () => {
    const task = jsone(TASK_TEMPLATE, {});
    task.provisionerId = tqi1;
    task.workerType = tqi2;
    const taskId = taskcluster.slugid();
    await tcapi.call('queue.createTask', () => queue.createTask(taskId, task));
    addTaskId(taskId);
  };

  // one loop to "prime" things by ensuring there are at least targetCount
  // tasks in the queue, and one loop to claim those tasks and create new
  // tasks to replace them.
  const primeLoop = (async () => {
    while (!stopper.stop) {
      const res = await tcapi.call('queue.pendingTasks', () => queue.pendingTasks(tqi1, tqi2));
      if (!res) {
        continue;
      }

      const {pendingTasks} = res;
      status.numPending = pendingTasks;

      const numNeeded = targetCount - pendingTasks;
      if (numNeeded > 0) {
        // make up to 10 tasks at a time
        await Promise.all(_.range(Math.min(10, numNeeded)).map(makeTask));
      } else {
        await sleep(1000);
      }
    }
  })();

  const claimLoop = Promise.all(_.range(parallelism).map(wi => {
    return new Promise((resolve, reject) => {
      const CAPACITY = 4;
      const running = {};

      let stopLoopPromise, startLoopPromise = Promise.resolve();

      const runTask = async (taskId, runId) => {
        // sleep for about a minute, to simulate the task running for that
        // time.  The queue is designed with this in mind, and we get better
        // load results with a lot of one-minute tasks than fewer
        // immediately-resolved tasks.
        await Promise.race([stopper.promise, sleep(1000 * _.random(30, 90))]);

        // resolve the task and at the same time make a new task to replace it
        await Promise.all([
          tcapi.call("queue.reportCompleted", () => queue.reportCompleted(taskId, runId)),
          makeTask(),
        ]);
      };

      const startLoop = () => {
        startLoopPromise = startLoopPromise.then(_startLoop).catch(reject);
      };

      const _startLoop = async () => {
        if (stopper.stop) {
          if (!stopLoopPromise) {
            stopLoopPromise = stopLoop().then(resolve, reject);
          }
          return;
        }

        const spareCapacity = CAPACITY - Object.keys(running).length;
        if (spareCapacity > 0) {
          const res = await Promise.race([
            tcapi.call('queue.claimWork', () => queue.claimWork(tqi1, tqi2, {
              tasks: spareCapacity,
              workerGroup: 'load-test',
              workerId: `load-test-${wi}`,
            })),
            stopper.promise,
          ]);

          if (stopper.stop) {
            startLoop(); // will immediately call stopLoop
            return;
          }

          if (!res) {
            return;
          }

          // if we got no tasks and have no running tasks, check back shortly..
          if (res.tasks.length < 1) {
            if (Object.keys(running).length == 0) {
              setTimeout(startLoop, 1000);
            }
          }

          res.tasks.forEach(claim => {
            const taskId = claim.status.taskId;
            const runId = claim.runId;
            const key = `${taskId}/${runId}`;

            // run the task and remove it from running when done, and call `startLoop` again
            // when that happens.
            running[key] = runTask(taskId, runId).catch(reject).then(() => {
              status.numRunning--;
              delete running[key];
              startLoop();
            });
            status.numRunning++;
          });
        }
      };

      const stopLoop = async () =>  {
        await Promise.all(Object.values(running));
      };

      startLoop();
    });
  }));

  await Promise.all([claimLoop, primeLoop]);
};
