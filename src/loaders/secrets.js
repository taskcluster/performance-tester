const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig, getTaskId} = require('./common');

exports.secrets_loader = async ({name, stopper, logger, tcapi, settings, monitor}) => {
  const secrets = new taskcluster.Secrets(clientConfig);
  const rate = settings.rate;
  const secret = settings.secret;

  monitor.output_fn(5, () => {
    return ` ▶ ${chalk.bold.cyan(name)}: ${chalk.yellow('target rate')}: ${rate} rq/s\n`;
  });

  await secrets.set(secret, {
    secret: {'passphrase': 'correct horse battery staple'},
    expires: taskcluster.fromNow('1 day'),
  });

  await atRate({stopper, logger, name, rate}, async () => {
    await tcapi.call("secrets.get", cb => secrets.get(secret));
  });
};
