const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const chalk = require('chalk');
const {clientConfig, getTaskId} = require('./common');

exports.hooks_loader = async ({name, stopper, logger, tcapi, settings, monitor}) => {
  const hooks = new taskcluster.Hooks(clientConfig);
  const auth = new taskcluster.Auth(clientConfig);
  const rate = settings.rate;
  const {hookId, hookGroupId} = settings;

  monitor.output_fn(5, () => {
    return ` ▶ ${chalk.bold.cyan(name)}: ${chalk.yellow('hook')}: ${hookGroupId}/${hookId}; ${chalk.yellow('target rate')}: ${rate} rq/s\n`;
  });

  const hookDef = {
    metadata: {
      description: "a hook",
      emailOnError: false,
      name: 'a-hook',
      owner: 'nobody@mozilla.org',
    },
    task: {
      created: {$fromNow: '0 seconds'},
      deadline: {$fromNow: '10 minutes'},
      expires: {$fromNow: '10 minutes'},
      payload: {},
      provisionerId: 'built-in',
      workerType: 'succeed',
      metadata: {
        name: 'Test Task',
        description: 'A task!',
        owner: 'nobody@mozilla.com',
        source: 'https://github.com/taskcluster/performance-tester',
      },
    },
  };

  const roleId = `hook-id:${hookGroupId}/${hookId}`;
  const role = {
    description: 'perf-test',
    scopes: [
      'queue:scheduler-id:-',
      'queue:create-task:highest:built-in/succeed',
    ],
  };
  try {
    await auth.createRole(roleId, role);
  } catch (err) {
    if (err.statusCode != 409) {
      throw err;
    }
    await auth.updateRole(roleId, role);
  }

  try {
    await hooks.createHook(hookGroupId, hookId, hookDef);
  } catch (err) {
    if (err.statusCode != 409) {
      throw err;
    }
    await hooks.updateHook(hookGroupId, hookId, hookDef);
  }

  await atRate({stopper, logger, name, rate}, async () => {
    await tcapi.call("hooks.triggerHook", () => hooks.triggerHook(hookGroupId, hookId, {}));
  });
};

