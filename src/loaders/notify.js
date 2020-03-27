const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig, getTaskId} = require('./common');

exports.notify_loader = async ({name, stopper, logger, tcapi, settings, monitor}) => {
  const notify = new taskcluster.Notify(clientConfig);
  const rate = settings.rate;

  monitor.output_fn(5, () => {
    return ` ▶ ${chalk.bold.cyan(name)}: ${chalk.yellow('target rate')}: ${rate} rq/s\n`;
  });

  await atRate({stopper, logger, name, rate}, async () => {
    await tcapi.call("notify.pulse", () => notify.pulse({message: {}, routingKey: 'test.perf'}));
  });
};
