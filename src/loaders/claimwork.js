const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {sleep} = require('../util');
const jsone = require('json-e');
const chalk = require('chalk');
const {clientConfig, TASK_TEMPLATE, addTaskId} = require('./common');

// claimwork: claim and resolve tasks from a queue
exports.claimwork_loader = async ({name, stopper, logger, settings, monitor, tcapi}) => {
  const queue = new taskcluster.Queue(clientConfig);
  const taskQueueId = settings['task-queue-id'];
  const [tqi1, tqi2] = taskQueueId.split('/');
  const parallelism = settings['parallelism'];
  const capacity = settings['capacity'] || 1;

  let status = {
    numRunning: 0,
  };

  monitor.output_fn(5, () => ` ▶ ${chalk.bold.cyan(name)}: ` +
    `${chalk.yellow('taskQueueId')}: ${taskQueueId}; ` +
    `${chalk.yellow('Idle capacity')}: ${capacity * parallelism - status.numRunning}; ` +
    `${chalk.yellow('Running tasks')}: ${status.numRunning}\n`);

  await Promise.all(_.range(parallelism).map(wi => {
    return new Promise((resolve, reject) => {
      const running = {};

      let stopLoopPromise, startLoopPromise = Promise.resolve();

      const runTask = async (taskId, runId) => {
        // sleep for about a minute, to simulate the task running for that
        // time.  The queue is designed with this in mind, and we get better
        // load results with a lot of one-minute tasks than fewer
        // immediately-resolved tasks.
        await Promise.race([stopper.promise, sleep(1000 * _.random(30, 90))]);
        if (_.random(0, 1)) {
          await tcapi.call("queue.reclaimTask", () => queue.reclaimTask(taskId, runId));
        }

        // upload some artifacts. This skips the actual artifact upload, as that is not part of
        // the services.  In production we see about 2.4 artifacts per task, so this creates
        // three..
        await Promise.all(_.range(3).map(
          n => tcapi.call("queue.createArtifact",
            () => queue.createArtifact(taskId, runId, `public/artifact-${n}`, {
              storageType: 's3',
              contentType: 'text/plain',
              expires: taskcluster.fromNow('1 minute'),
            }))
          ));

        await tcapi.call("queue.reportCompleted", () => queue.reportCompleted(taskId, runId));
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

        const spareCapacity = capacity - Object.keys(running).length;
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
};
