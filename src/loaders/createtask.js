const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate, sleep} = require('../util');
const jsone = require('json-e');
const chalk = require('chalk');
const {clientConfig, TASK_TEMPLATE, addTaskId} = require('./common');

// createtask: create, claim and resolve tasks from a queue
exports.createtask_loader = async ({name, stopper, logger, settings, monitor, tcapi}) => {
  const queue = new taskcluster.Queue(clientConfig);
  const taskQueueId = settings['task-queue-id'];
  const [tqi1, tqi2] = taskQueueId.split('/');
  const rate = settings['rate'];

  let numPending = 0;
  let throttling = false;

  monitor.output_fn(5, () => ` ▶ ${chalk.bold.cyan(name)}: ` +
    `${chalk.yellow('taskQueueId')}: ${taskQueueId}; ` +
    (throttling ? `${chalk.bgRed('throttling')}; ` : '') +
    `${chalk.yellow('target rate')}: ${rate} rq/s; ` +
    `${chalk.yellow('Pending tasks')}: ${numPending}\n`);

  const creator = atRate({stopper, logger, name, rate}, async () => {
    if (throttling) {
      return;
    }

    const task = jsone(TASK_TEMPLATE, {});
    task.provisionerId = tqi1;
    task.workerType = tqi2;
    const taskId = taskcluster.slugid();
    await tcapi.call('queue.createTask', () => queue.createTask(taskId, task));
    addTaskId(taskId);
  });

  const pendingMonitor = new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (stopper.stop) {
        clearInterval(timer);
        resolve();
      }
      tcapi.call('queue.pendingTasks', () => queue.pendingTasks(tqi1, tqi2)).then(res => {
        numPending = res.pendingTasks;

        // pendingTasks can be up to 20s out of date, so we need at most 20
        // seconds worth of tasks.  Note that due to Azure being Azure,
        // pendingTasks can actually be a lot more out-of-date than that!  So
        // we add a 5x margin.  We just want to stop pumping tasks into a
        // queue that's not being consumed here.

        if (throttling) {
          if (numPending < rate * 20 * 2) {
            logger.log(`${name}: un-throttling`);
            throttling = false;
          }
        } else {
          if (numPending > rate * 20 * 5) {
            logger.log(`${name}: throttling due to high pending`);
            throttling = true;
          }
        }
      }, reject);
    }, 1000);
  });
  await Promise.all([creator, Promise.race([stopper.promise, pendingMonitor])]);
};
