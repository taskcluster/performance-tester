const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig, getTaskId} = require('./common');

// expandscopes: call queue.task(taskId) for taskIds created by other loaders
exports.gettask_loader = async ({name, stopper, tcapi, settings, monitor}) => {
  const queue = new taskcluster.Queue(clientConfig);
  const rate = settings.rate;
  let waiting = true;

  monitor.output_fn(5, () => {
    if (waiting) {
      return` ▶ ${chalk.bold.cyan(name)}: ${chalk.red('waiting for tasks')}\n`;
    } else {
      return ` ▶ ${chalk.bold.cyan(name)}: ${chalk.yellow('target rate')}: ${rate} rq/s\n`;
    }
  });

  // wait for a taskId..
  await getTaskId();
  waiting = false;

  await atRate(stopper, async () => {
    const taskId = await getTaskId();
    await tcapi.call("queue.task", cb => queue.task(taskId));
  }, rate);
};


