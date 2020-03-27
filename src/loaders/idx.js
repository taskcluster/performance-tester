const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig, getTaskId} = require('./common');

exports.index_loader = async ({name, stopper, logger, tcapi, settings, monitor}) => {
  const index = new taskcluster.Index(clientConfig);
  const rate = settings.rate;

  monitor.output_fn(5, () => {
    return ` ▶ ${chalk.bold.cyan(name)}: ${chalk.yellow('target rate')}: ${rate} rq/s\n`;
  });

  await atRate({stopper, logger, name, rate}, async () => {
    // the task definition has routes index.garbage.{100-199}
    const path = `garbage.${_.random(100, 199)}`;
    await tcapi.call("index.findTask", async () => {
      try {
        await index.findTask(path);
      } catch (err) {
        if (err.statusCode !== 404) {
          throw err;
        }
      }
    });
  });
};

