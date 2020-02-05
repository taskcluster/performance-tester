const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {sleep} = require('../util');
const {clientConfig, TASK_TEMPLATE} = require('./common');
const chalk = require('chalk');

// builtin: create tasks that the built-in-workers service resolves
exports.builtin_loader = async ({name, stopper, logger, settings, monitor, tcapi}) => {
  const queue = new taskcluster.Queue(clientConfig);
  const [tqi1, tqi2] = "built-in/success".split('/');
  const targetCount = settings['pending-count'];

  let status = {
    numPending: 0,
  };

  monitor.output_fn(5, () => ` ▶ ${chalk.bold.cyan(name)}: ` +
    `${chalk.yellow('Pending tasks')}: ${status.numPending}\n`);

  const makeTask = async () => {
    const task = jsone(TASK_TEMPLATE, {});
    task.provisionerId = tqi1;
    task.workerType = tqi2;
    const taskId = taskcluster.slugid();
    await tcapi.call('queue.createTask', () => queue.createTask(taskId, task));
    status.numPending++;
  };

  // ensure that there are at least targetCount tasks in the queue.
  let nextPoll = 0;
  while (!stopper.stop) {
    const now = +new Date();
    if (now < nextPoll) {
      await sleep(nextPoll - now);
    }

    const res = await tcapi.call('queue.pendingTasks', () => queue.pendingTasks(tqi1, tqi2));
    // the pendingTasks result is cached for 20s, so don't try to call it until that time
    nextPoll = now + 20000;

    if (!res) {
      continue;
    }

    const {pendingTasks} = res;
    status.numPending = pendingTasks;

    const numNeeded = targetCount - pendingTasks;
    if (numNeeded > 0) {
      // make up to 100 tasks at a time
      await Promise.all(_.range(Math.min(100, numNeeded)).map(makeTask));
    }
  }
};

