const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig, getTaskId} = require('./common');

exports.github_loader = async ({name, stopper, logger, tcapi, settings, monitor}) => {
  const github = new taskcluster.Github(clientConfig);
  const rate = settings.rate;

  monitor.output_fn(5, () => {
    return ` ▶ ${chalk.bold.cyan(name)}: ${chalk.yellow('target rate')}: ${rate} rq/s\n`;
  });

  await atRate({stopper, logger, name, rate}, async () => {
    await tcapi.call("github.repository", () => github.repository('djmitche', 'performance-tester'));
  });
};
