const fs = require('fs');
const assert = require('assert');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const logUpdate = require('log-update');
const chalk = require('chalk');
const {atRate, loopUntilStop} = require('./util');
const yaml = require('js-yaml');
const jsone = require('json-e');

const clientConfig = process.env.TASKCLUSTER_PROXY_URL ?
  {rootUrl: process.env.TASKCLUSTER_PROXY_URL} :
  taskcluster.fromEnvVars();

// createtasks: keep the queue CREATETASKS_TASKQUEUEID full of tasks as defined by
// a JSON-e rendering of the YAML file named by CREATETASKS_TASK_FILE.  It keeps at
// least CREATETASKS_COUNT tasks in the queue, as determined by pendingTasks().
exports.createtasks_loader = async (state, count, rate) => {
  const queue = new taskcluster.Queue(clientConfig);
  const taskQueueId = process.env.CREATETASKS_TASKQUEUEID;
  const [tqi1, tqi2] = taskQueueId.split('/');
  const targetCount = process.env.CREATETASKS_COUNT;

  const taskTemplateYml = fs.readFileSync(process.env.CREATETASKS_TASK_FILE);
  const taskTemplate = yaml.safeLoad(taskTemplateYml);

  await loopUntilStop(state, 2000, async () => {
    const {pendingTasks} = await queue.pendingTasks(tqi1, tqi2);
    count('createtasks-pendingTasks', 1);

    const numNeeded = targetCount - pendingTasks;
    if (numNeeded > 0) {
      for (let i = 0; i < numNeeded; i++) {
        const task = jsone(taskTemplate, {});
        assert.equal(task.provisionerId, tqi1);
        assert.equal(task.workerType, tqi2);
        const taskId = taskcluster.slugid();
        try {
          await queue.createTask(taskId, task)
        } catch (err) {
          if (err.statusCode !== 500) {
            throw err;
          }
          count('createtasks-500', 1);
          continue;
        }
        count('createtasks', 1);
      }
    }
  });
};

// expandscopes: call auth.expandScopes with items randomly selected from
// $EXPANDSCOPES
exports.expandscopes_loader = async (state, count) => {
  const auth = new taskcluster.Auth(clientConfig);
  const scopes = process.env.EXPANDSCOPES.split(' ');

  const rate = parseInt(process.env.EXPANDSCOPES_RATE);

  await atRate(state, async () => {
    const size = _.random(1, scopes.length);
    const toExpand = _.sampleSize(scopes, size);
    await auth.expandScopes({scopes: toExpand});
    count('expandscopes', 1);
  }, rate);
};


