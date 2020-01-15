const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const logUpdate = require('log-update');
const chalk = require('chalk');

const clientConfig = process.env.TASKCLUSTER_PROXY_URL ?
  {rootUrl: process.env.TASKCLUSTER_ROOT_URL} :
  taskcluster.fromEnvVars();

// expandscopes: call auth.expandScopes with items randomly selected from
// $EXPANDSCOPES
const expandscopes_loader = async (state, count, rate) => {
  const auth = new taskcluster.Auth(clientConfig);
  const scopes = process.env.EXPANDSCOPES.split(' ');

  await at_rate(state, async () => {
    const size = _.random(1, scopes.length);
    const toExpand = _.sampleSize(scopes, size);
    await auth.expandScopes({scopes: toExpand});
    count('expandscopes', 1);
  }, rate);
};

const LOADERS = {expandscopes_loader};

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

const monitor = (state, events) => {
  const WINDOW_WIDTH = 5000;
  return new Promise((resolve, reject) => {
    const window = [];
    const timer = setInterval(() => {
      try {
        const now = +new Date();
        while (window.length && window[0][0] < now - WINDOW_WIDTH) {
          window.splice(0, 1);
        }
        window.push([now, _.clone(events)]);

        if (window.length < 2) {
          return;
        }
        const [startTime, startCount] = window[0];
        const [endTime, endCount] = window[window.length - 1];
        const durSecs = (endTime - startTime) / 1000;

        const props = Object.keys(endCount).sort();
        const statuses = [];
        for (let prop of props) {
          start = startCount[prop] || 0;
          end = endCount[prop];
          statuses.push(`${chalk.yellow(prop)}: ${Math.round(100 * (end - start) / durSecs) / 100} per second`);
        }
        logUpdate(`\n${chalk.bold('State')}: ${state.stop ? chalk.red('stopping') : (chalk.green('running') + ' (enter to stop)')}\n` + statuses.join('\n'));
      } catch (err) {
        clearInterval(timer);
        reject(err);
      }
      if (state.stop) {
        clearInterval(timer);
        resolve();
      }
    }, 500);
  });
};

const main = () => {
  const loaders = process.env.LOADERS.split(' ');
  const state = {stop: false};

  const events = {};
  const count = (name, inc) => {
    events[name] = (events[name] || 0) + inc;
  };

  const loaderPromises = Promise.all(loaders.map(l => {
    const match = /([a-z_]*)(@([0-9]+))?/.exec(l);

    const rate = match[3] ? parseInt(match[3]) : 1;
    const loader = LOADERS[match[1] + '_loader'];
    if (!loader) {
      throw new Error('no such loader ' + match[1]);
    }
    return loader(state, count, rate);
  }));

  const monitorPromise = monitor(state, events);

  process.stdin.setRawMode(true).resume();
  process.stdin.once('data', () => {
    state.stop = true;
    process.stdin.pause();
  });

  return Promise.all([
    monitorPromise,
    loaderPromises,
  ]).catch(err => {
    state.stop = true;
    throw err;
  });
};

main().then(
  () => {},
  err => console.log(err),
);
