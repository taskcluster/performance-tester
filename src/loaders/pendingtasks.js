const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig} = require('./common');

// pendingtasks: call queue.pendingTasks for task queues in settings.task-queue-ids
exports.pendingtasks_loader = async ({name, stopper, tcapi, settings, monitor}) => {
  const queue = new taskcluster.Queue(clientConfig);
  const taskQueueIds = settings['task-queue-ids'];
  const rate = settings.rate;

  monitor.output_fn(5, () => ` ▶ ${chalk.bold.cyan(name)}: ` +
    `${chalk.yellow('target rate')}: ${rate} rq/s\n`);

  await atRate(stopper, async () => {
    const taskQueueId = taskQueueIds[_.random(0, taskQueueIds.length-1)];
    const [tqi1, tqi2] = taskQueueId.split('/');
    await tcapi.call("queue.pendingTasks", cb => queue.pendingTasks(tqi1, tqi2));
  }, rate);
};
