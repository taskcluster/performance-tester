const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig, getTaskId} = require('./common');

exports.workermanager_loader = async ({name, stopper, logger, tcapi, settings, monitor}) => {
  const workerManager = new taskcluster.WorkerManager(clientConfig);
  const rate = settings.rate;
  const secret = settings.secret;

  monitor.output_fn(5, () => {
    return ` ▶ ${chalk.bold.cyan(name)}: ${chalk.yellow('target rate')}: ${rate} rq/s\n`;
  });

  const wp = {
    providerId: 'static',
    config: {},
    description: 'for performance-tester',
    emailOnError: false,
    owner: 'nobody@mozilla.org',
  };
  try {
    await workerManager.createWorkerPool(settings.workerPoolId, wp);
  } catch (err) {
    if (err.statusCode != 409) {
      throw err;
    }
    await workerManager.updateWorkerPool(settings.workerPoolId, wp);
  }

  const workers = [];
  const workerGroup = taskcluster.slugid();
  await atRate({stopper, logger, name, rate}, async () => {
    const r = _.random(0, 50);
    if (r < 11) {
    // case 1: create a new static worker (slightly more likely than removing)
      if (workers.length > 100) {
        return;
      }
      await tcapi.call("workerManager.createWorker", async () => {
        const workerId = `wkr-${taskcluster.slugid()}`;
        const staticSecret = taskcluster.slugid() + taskcluster.slugid();
        await workerManager.createWorker(settings.workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('6 hours'),
          providerInfo: {staticSecret},
        });
        workers.push({workerId, staticSecret});
      });
    // case 2: remove an existing static worker
    } else if (r < 21) {
      if (workers.length === 0) {
        return;
      }
      const {workerId} = workers.shift();
      await tcapi.call("workerManager.removeWorker", async () => {
        await workerManager.removeWorker(settings.workerPoolId, workerGroup, workerId);
      });
    // case 3: register an existing static worker (more likely than other cases)
    } else {
      if (workers.length === 0) {
        return;
      }
      const {workerId, staticSecret} = workers.shift();
      await tcapi.call("workerManager.registerWorker", async () => {
        await workerManager.registerWorker({
          providerId: wp.providerId,
          workerPoolId: settings.workerPoolId,
          workerGroup,
          workerId,
          workerIdentityProof: {
            staticSecret,
          },
        });
      });
      workers.push({workerId, staticSecret});
    }
  });
};

