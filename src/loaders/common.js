const taskcluster = require('taskcluster-client');
const https = require('https');
const _ = require('lodash');
const {sleep} = require('../util');

exports.clientConfig = process.env.TASKCLUSTER_PROXY_URL ?
  {rootUrl: process.env.TASKCLUSTER_PROXY_URL} :
  taskcluster.fromEnvVars();
exports.clientConfig.agent = new https.Agent({
  keepAlive: true,
  maxSockets: Infinity,
  maxFreeSockets: 256,
});

exports.TASK_TEMPLATE =  {
  created: {$fromNow: '0 seconds'},
  deadline: {$fromNow: '10 minutes'},
  expires: {$fromNow: '10 minutes'},
  payload: {},
  routes: [
    'index.garbage.${idx}',
  ],
  metadata: {
    name: 'Test Task',
    description: 'A task!',
    owner: 'nobody@mozilla.com',
    source: 'https://github.com/taskcluster/performance-tester',
  },
};

const taskIds = [];

// Record the existence of a taskId
exports.addTaskId = taskId => {
  taskIds.push(taskId);
};

// get a taskId from the list of tasks that have been delcared
exports.getTaskId = async () => {
  // poor man's spinlock
  while (taskIds.length == 0) {
    await sleep(1000);
  }

  // drop all but about 1000 tasks
  if (taskIds.length > 1000) {
    taskIds.splice(0, taskIds.length - 1000);
  }

  return taskIds[_.random(0, taskIds.length-1)];
};
