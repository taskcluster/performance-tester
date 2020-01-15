const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const logUpdate = require('log-update');
const chalk = require('chalk');
const LOADERS = require('./loaders');
const spinners = require('cli-spinners');

const monitor = (state, events) => {
  const WINDOW_WIDTH = 10000;
  const SPINNER = spinners.arrow3;

  return new Promise((resolve, reject) => {
    const window = [];
    const runStart = +new Date();

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
          const rate = (end - start) / durSecs;
          if (rate > 10) {
            statuses.push(`${chalk.yellow(prop)}: ${Math.round(rate)} per second`);
          } else {
            statuses.push(`${chalk.yellow(prop)}: ${Math.round(rate * 100) / 100} per second`);
          }
        }
        
        const stateStr = `${chalk.bold('State')}: ${state.stop ? chalk.red('stopping') : (chalk.green('running') + ' (enter to stop)')}`;
        const spinner = SPINNER.frames[Math.round((+new Date - runStart) / SPINNER.interval) % SPINNER.frames.length];
        logUpdate(`\n${stateStr} ${spinner}\n` + statuses.join('\n'));
      } catch (err) {
        clearInterval(timer);
        reject(err);
      }
      if (state.stop) {
        clearInterval(timer);
        resolve();
      }
    }, SPINNER.interval);
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
