const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig} = require('./common');

exports.purgecache_loader = async ({name, stopper, logger, tcapi, settings, monitor}) => {
  const purgeCache = new taskcluster.PurgeCache(clientConfig);
  const rate = settings.rate;
  const workerPools = settings.workerPools;

  monitor.output_fn(5, () => {
    return ` ▶ ${chalk.bold.cyan(name)}: ${chalk.yellow('target rate')}: ${rate} rq/s\n`;
  });

  await atRate({stopper, logger, name, rate}, async () => {
    const [provisionerId, workerType] = _.sample(workerPools).split('/');
    await tcapi.call("purgeCache.purgeRequests", cb => purgeCache.purgeRequests(provisionerId, workerType));
  });
};
