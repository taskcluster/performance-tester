const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const logUpdate = require('log-update');
const chalk = require('chalk');

const clientConfig = process.env.TASKCLUSTER_PROXY_URL ?
  {rootUrl: process.env.TASKCLUSTER_ROOT_URL} :
  taskcluster.fromEnvVars();

// expandscopes: call auth.expandScopes with items randomly selected from
// $EXPANDSCOPES
exports.expandscopes_loader = async (state, count, rate) => {
  const auth = new taskcluster.Auth(clientConfig);
  const scopes = process.env.EXPANDSCOPES.split(' ');

  await at_rate(state, async () => {
    const size = _.random(1, scopes.length);
    const toExpand = _.sampleSize(scopes, size);
    await auth.expandScopes({scopes: toExpand});
    count('expandscopes', 1);
  }, rate);
};

const at_rate = (state, cb, rate) => {
  let started = 0;
  let completed = 0;
  let outstanding = {};
  let start = +new Date();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const shouldveStarted = rate * (+new Date() - start) / 1000;
      while (started < shouldveStarted) {
        const i = started;
        cb().then(() => {
          completed++;
          delete outstanding[i];
        }, reject);
        started++;
      }
      if (state.stop) {
        clearInterval(timer);
        Promise.all(Object.values(outstanding)).then(resolve);
      }
      if (started > rate * 60 && completed < 0.8 * started) {
        reject(new Error(`not completing ${cb} fast enough`));
      }
    }, rate < 3 ? 100 : 10);
  });
};

