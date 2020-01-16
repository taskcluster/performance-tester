const fs = require('fs');
const assert = require('assert');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const logUpdate = require('log-update');
const chalk = require('chalk');
const {apiCall, atRate, loopUntilStop} = require('./util');
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

      const numNeeded = targetCount - pendingTasks;
      if (numNeeded > 0) {
        state.log(`priming task queue - ${pendingTasks} pending`);
        await Promise.all(_.range(Math.min(10, numNeeded)).map(makeTask));
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  })();

  const claimLoop = Promise.all(_.range(parallelism).map(async (wi) => {
    while (!state.stop) {
      const res = await Promise.race([
        apiCall(state, 'queue.claimWork', () => queue.claimWork(tqi1, tqi2, {
          tasks: 4,
          workerGroup: 'load-test',
          workerId: `load-test-${wi}`,
        })),
        stopPromise,
      ]);

      if (state.stop) {
        return;
      }

      if (!res) {
        continue;
      }

      await Promise.all(res.tasks.map(async claim => {
        const taskId = claim.status.taskId;
        const runId = claim.runId;

        await apiCall(state, "queue.reportCompleted", () => queue.reportCompleted(taskId, runId));

        await makeTask();
      }));

      // note that when there are no tasks this will immediately re-call claimWork
    }
  }));

  await Promise.all([primeLoop, claimLoop]);
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
    await auth.expandScopes({scopes: toExpand});
    state.count('expandscopes', 1);
  }, rate);
};


