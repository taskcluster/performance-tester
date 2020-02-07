const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig, getTaskId} = require('./common');

// taskstatus: call queue.status(taskId) for taskIds created by other loaders
exports.taskstatus_loader = async ({name, stopper, logger, tcapi, settings, monitor}) => {
  const queue = new taskcluster.Queue(clientConfig);
  const rate = settings.rate;
  let waiting = true;

  monitor.output_fn(5, () => {
    if (waiting) {
      return` ▶ ${chalk.bold.cyan(name)}: ${chalk.bgRed('waiting for tasks')}\n`;
    } else {
      return ` ▶ ${chalk.bold.cyan(name)}: ${chalk.yellow('target rate')}: ${rate} rq/s\n`;
    }
  });

  // wait for a taskId..
  await getTaskId();
  waiting = false;
  logger.log(`${name}: have some taskIds and starting to call queue.status`);

  await atRate(stopper, async () => {
    const taskId = await getTaskId();
    await tcapi.call("queue.status", cb => queue.status(taskId));
  }, rate);
};
