const taskcluster = require('taskcluster-client');
const https = require('https');

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
  metadata: {
    name: 'Test Task',
    description: 'A task!',
    owner: 'nobody@mozilla.com',
    source: 'https://github.com/taskcluster/performance-tester',
  },
};

