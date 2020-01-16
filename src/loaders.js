const fs = require('fs');
const assert = require('assert');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const logUpdate = require('log-update');
const chalk = require('chalk');
const {sleep, apiCall, atRate, loopUntilStop} = require('./util');
const yaml = require('js-yaml');
const jsone = require('json-e');

const clientConfig = process.env.TASKCLUSTER_PROXY_URL ?
  {rootUrl: process.env.TASKCLUSTER_PROXY_URL} :
  taskcluster.fromEnvVars();

// claimwork: create, claim and resolve tasks from a queue
exports.claimwork_loader = async (state) => {
  const queue = new taskcluster.Queue(clientConfig);
  const taskQueueId = process.env.CLAIMWORK_TASKQUEUEID;
  const [tqi1, tqi2] = taskQueueId.split('/');
  const parallelism = parseInt(process.env.CLAIMWORK_PARALLELISM);
  const targetCount = process.env.CLAIMWORK_PENDING_COUNT;

  let status = {
    numRunning: 0,
    numPending: 0,
  };
  state.statusFn(`claimwork for ${taskQueueId}`, () => `${chalk.yellow('Running tasks')}: ${status.numRunning}; ${chalk.yellow('Pending tasks')}: ${status.numPending}`);

  const taskTemplateYml = fs.readFileSync(process.env.CLAIMWORK_TASK_FILE);
  const taskTemplate = yaml.safeLoad(taskTemplateYml);
  const makeTask = async () => {
    const task = jsone(taskTemplate, {});
    assert.equal(task.provisionerId, tqi1);
    assert.equal(task.workerType, tqi2);
    const taskId = taskcluster.slugid();
    await apiCall(state, 'queue.createTask', () => queue.createTask(taskId, task));
  };

  // a promise that resolves when stop is true; used to bail out of the long
  // queue.claimWork calls
  stopPromise = new Promise(resolve => setInterval(() => {
    if (state.stop) {
      resolve();
    }
  }, 500));

  // one loop to "prime" things by ensuring there are at least targetCount
  // tasks in the queue, and one loop to claim those tasks and create new
  // tasks to replace them.
  const primeLoop = (async () => {
    while (!state.stop) {
      const res = await apiCall(state, 'queue.pendingTasks', () => queue.pendingTasks(tqi1, tqi2));
      if (!res) {
        continue;
      }

      const {pendingTasks} = res;
      status.numPending = pendingTasks;

      const numNeeded = targetCount - pendingTasks;
      if (numNeeded > 0) {
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
        await Promise.race([stopPromise, sleep(1000 * _.random(30, 90))]);

        // resolve the task and at the same time make a new task to replace it
        await Promise.all([
          apiCall(state, "queue.reportCompleted", () => queue.reportCompleted(taskId, runId)),
          makeTask(),
        ]);
      };

      const startLoop = () => {
        startLoopPromise = startLoopPromise.then(_startLoop).catch(reject);
      };

      const _startLoop = async () => {
        if (state.stop) {
          if (!stopLoopPromise) {
            stopLoopPromise = stopLoop().then(resolve, reject);
          }
          return;
        }

        const spareCapacity = CAPACITY - Object.keys(running).length;
        if (spareCapacity > 0) {
          const res = await Promise.race([
            apiCall(state, 'queue.claimWork', () => queue.claimWork(tqi1, tqi2, {
              tasks: spareCapacity,
              workerGroup: 'load-test',
              workerId: `load-test-${wi}`,
            })),
            stopPromise,
          ]);

          if (state.stop) {
            startLoop(); // will immediately call stopLoop
            return;
          }

          if (!res) {
            // if we got no tasks and have no running tasks, check back shortly..
            if (Object.keys(running).length == 0) {
              setTimeout(startLoop, 1000);
            }
            return;
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

// expandscopes: call auth.expandScopes with items randomly selected from
// $EXPANDSCOPES
exports.expandscopes_loader = async (state) => {
  const auth = new taskcluster.Auth(clientConfig);
  const scopes = process.env.EXPANDSCOPES.split(' ');

  const rate = parseInt(process.env.EXPANDSCOPES_RATE);

  await atRate(state, async () => {
    const size = _.random(1, scopes.length);
    const toExpand = _.sampleSize(scopes, size);
    await apiCall(state, "auth.expandScopes", cb => auth.expandScopes({scopes: toExpand}));
  }, rate);
};


