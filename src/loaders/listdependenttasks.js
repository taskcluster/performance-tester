const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig, getTaskId} = require('./common');

// listdependenttasks: call queue.listDependentTasks(taskId) for taskIds created by other loaders
exports.listdependenttasks_loader = async ({name, stopper, logger, tcapi, settings, monitor}) => {
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
  logger.log(`${name}: have some taskIds and starting to call queue.listDependentTasks`);

  await atRate({stopper, logger, name, rate}, async () => {
    const taskId = await getTaskId();
    await tcapi.call("queue.listDependentTasks", cb => queue.listDependentTasks(taskId));
  });
};
