const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig, getTaskId} = require('./common');
const request = require('superagent');

exports.getartifacts_loader = async ({name, stopper, logger, settings, monitor, tcapi}) => {
  const queue = new taskcluster.Queue(clientConfig);
  const rate = {
    list: settings.listrate,
    listlatest: settings.listlatestrate,
    get: settings.getrate,
    getlatest: settings.getlatestrate,
  };
  const totalrate = rate.list + rate.listlatest + rate.get + rate.getlatest;
  let waiting = true;

  monitor.output_fn(5, () => {
    if (waiting) {
      return` ▶ ${chalk.bold.cyan(name)}: ${chalk.bgRed('waiting for tasks')}\n`;
    } else {
      return ` ▶ ${chalk.bold.cyan(name)}: ${chalk.yellow('target rate')}: ` +
        `listArtifacts: ${rate.list} rq/s; ` +
        `listLatestArtifacts: ${rate.listlatest} rq/s; ` +
        `getArtifacts: ${rate.get} rq/s; ` +
        `getLatestArtifacts: ${rate.getlatest} rq/s\n`;
    }
  });

  // wait for a taskId..
  await getTaskId();
  waiting = false;
  logger.log(`${name}: have some taskIds and starting to call artifact methods`);

  const artifacts = new Array(100);
  let i = 0;

  const getArtifactByUrl = async url => {
    await request.get(url)
      .redirects(0)
      .ok(res => true);
  };

  await Promise.all([
    atRate({stopper, logger, name, rate: rate.list}, async () => {
      const taskId = await getTaskId();
      const res = await tcapi.call("queue.listArtifacts", cb => queue.listArtifacts(taskId, 0));
      for (const {name} of res.artifacts) {
        artifacts[i++] = {taskId, name, runId: 0};
        i = i % 100;
      }
    }),
    atRate({stopper, logger, name, rate: rate.listlatest}, async () => {
      const taskId = await getTaskId();
      await tcapi.call("queue.listLatestArtifacts", cb => queue.listLatestArtifacts(taskId));
    }),
    atRate({stopper, logger, name, rate: rate.get}, async () => {
      const artifact = _.sample(artifacts);
      if (artifact) {
        const {taskId, name, runId}  = artifact;
        await tcapi.call("queue.getArtifact", cb =>
          getArtifactByUrl(queue.buildUrl(queue.getArtifact, taskId, runId, name)));
      }
    }),
    atRate({stopper, logger, name, rate: rate.getlatest}, async () => {
      // for getLatestArtifact, we really don't know if the artifact exists at that runId,
      // but give it a shot..
      const artifact = _.sample(artifacts);
      if (artifact) {
        const {taskId, name}  = artifact;
          await tcapi.call("queue.getLatestArtifact", cb =>
            getArtifactByUrl(queue.buildUrl(queue.getLatestArtifact, taskId, name)));
      }
    }),
  ]);
};
