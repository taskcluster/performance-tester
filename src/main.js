const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const logUpdate = require('log-update');
const chalk = require('chalk');
const LOADERS = require('./loaders');
const spinners = require('cli-spinners');
const {loopUntilStop} = require('./util');

const monitor = (state, counts, logs, running) => {
  const WINDOW_WIDTH = 10000;
  const LOG_LENGTH = 40;
  const SPINNER = spinners.arrow3;
  const window = [];
  const runStart = +new Date();

  setInterval(() => {
    const now = +new Date();
    while (window.length && window[0][0] < now - WINDOW_WIDTH) {
      window.splice(0, 1);
    }
    window.push([now, _.clone(counts)]);

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
      const rate = (end - start) / durSecs;
      if (rate > 10) {
        statuses.push(`${chalk.yellow(prop)}: ${Math.round(rate)} per second`);
      } else {
        statuses.push(`${chalk.yellow(prop)}: ${Math.round(rate * 100) / 100} per second`);
      }
    }

    if (logs.length > LOG_LENGTH) {
      logs.splice(0, logs.length - LOG_LENGTH);
    }
    const logLines = logs.map(([when, msg]) => `${chalk.magenta(when)} - ${msg}`);

    const apiMethods = Object.keys(running).sort();
    const runningStr = `${chalk.bold('Running API Calls:')} ${apiMethods.map(m => chalk.yellow(m) + '=' + running[m]).join(' ')}`;
    
    const stateStr = `${chalk.bold('State')}: ${state.stop ? (chalk.red('stopping') + ' (Q to force)') : (chalk.green('running') + ' (any key to stop)')}`;
    const spinner = SPINNER.frames[Math.round((+new Date - runStart) / SPINNER.interval) % SPINNER.frames.length];
    logUpdate(`\n${logLines.join('\n')}\n${stateStr} ${spinner}\n${runningStr}\n${statuses.join('\n')}`);
  }, SPINNER.interval);
};

const main = () => {
  const loaders = process.env.LOADERS.split(' ');
  const state = {stop: false};

  const counts = {};
  const running = {};
  const logs = [];
  state.count = (name, inc) => {
    counts[name] = (counts[name] || 0) + inc;
  };
  state.log = (msg) => {
    const now = new Date();
    msg.split('\n').forEach(l => logs.push([now, l]));
  };
  state.running = (method, inc) => {
    running[method] = (running[method] || 0) + inc;
  }

  const loaderPromises = Promise.all(loaders.map(l => {
    const loader = LOADERS[l + '_loader'];
    if (!loader) {
      throw new Error('no such loader ' + match[1]);
    }
    return loader(state);
  }));

  monitor(state, counts, logs, running);
  process.stdin.setRawMode(true).resume();
  process.stdin.on('data', k => {
    if (state.stop && k == 'Q') {
      process.exit(1);
    }
    state.stop = true;
  });

  return loaderPromises.catch(err => {
    state.stop = true;
    throw err;
  });
};

main().then(
  () => {},
  err => console.log(err),
).then(() => {
  process.stdin.setRawMode(false);
  process.exit(0);
});
