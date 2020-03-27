const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig, getTaskId} = require('./common');

exports.workermeta_loader = async ({name, stopper, logger, tcapi, settings, monitor}) => {
  const queue = new taskcluster.Queue(clientConfig);
  const workerPools = settings.workerPools;
  const workers = new Set();

  monitor.output_fn(5, () => {
    return ` ▶ ${chalk.bold.cyan(name)}: ${chalk.yellow('target rate')}: listWorkers: ${settings.listworkersrate} rq/s, getWorker: ${settings.getworkerrate} rq/s\n`;
  });

  await Promise.all([
    atRate({stopper, logger, name, rate: settings.listworkersrate}, async () => {
      const [provisionerId, workerType] = _.sample(workerPools).split('/');
      await tcapi.call("queue.listWorkers", async () => {
        const res = await queue.listWorkers(provisionerId, workerType);
        if (!res) {
          return;
        }

        for (const {workerGroup, workerId} of res.workers) {
          workers.add(`${provisionerId}/${workerType}/${workerGroup}/${workerId}`);
        }
      });
    }),
    atRate({stopper, logger, name, rate: settings.getworkerrate}, async () => {
      if (workers.size == 0) {
        return;
      }
      const [provisionerId, workerType, workerGroup, workerId] = _.sample([...workers]).split('/');
      await tcapi.call("queue.getWorker", async () => {
        await queue.getWorker(provisionerId, workerType, workerGroup, workerId);
      });
    }),
  ]);
};

