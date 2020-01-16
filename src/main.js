const fs = require('fs');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const logUpdate = require('log-update');
const chalk = require('chalk');
const LOADERS = require('./loaders');
const spinners = require('cli-spinners');
const yaml = require('js-yaml');
const {loopUntilStop} = require('./util');
const Monitor = require('./monitor');
const Logger = require('./logger');
const TCAPI = require('./api');
const Stopper = require('./stopper');

const monitor = (state, counts, logs, running, statusFns) => {
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
    const apiMethods = [];
    for (let prop of props) {
      start = startCount[prop] || 0;
      end = endCount[prop];
      const rate = (end - start) / durSecs;
      if (rate > 10) {
        apiMethods.push(`${chalk.yellow(prop)}: ${Math.round(rate)} per second`);
      } else {
        apiMethods.push(`${chalk.yellow(prop)}: ${Math.round(rate * 100) / 100} per second`);
      }
    }
    const apiMethodsStr = `${chalk.bold('API Method Rates')}:\n${apiMethods.join('\n')}`;

    if (logs.length > LOG_LENGTH) {
      logs.splice(0, logs.length - LOG_LENGTH);
    }
    const logLinesStr = logs.map(([when, msg]) => `${chalk.magenta(when)} - ${msg}`).join('\n');


    const statusStr = `${chalk.bold('Loader Status')}:\n${Object.entries(statusFns).map(([name, cb]) => `${chalk.cyan(name)} - ${cb()}`).join('\n')}`;

    const stateStr = `${chalk.bold('State')}: ${state.stop ? (chalk.red('stopping') + ' (Q to force)') : (chalk.green('running') + ' (any key to stop)')}`;
    const spinner = SPINNER.frames[Math.round((+new Date - runStart) / SPINNER.interval) % SPINNER.frames.length];

    const runningCalls = Object.keys(running).sort();
    const runningStr = `${chalk.bold('Running API Calls:')} ${runningCalls.map(m => chalk.yellow(m) + '=' + running[m]).join(' ')}`;
    
    logUpdate(`\n${logLinesStr}\n${statusStr}\n${stateStr} ${spinner}\n${runningStr}\n${apiMethodsStr}`);
  }, SPINNER.interval);
};

const main = () => {
  console.log(`reading ${process.argv[2]}`);
  const config = yaml.safeLoad(fs.readFileSync(process.argv[2]));

  const monitor = new Monitor();
  const logger = new Logger(monitor);
  const stopper = new Stopper(monitor, logger);
  const tcapi = new TCAPI(monitor, logger);

  const loaderPromises = Promise.all(Object.entries(config.loaders).map(([name, settings]) => {
    const loader = LOADERS[settings.use + '_loader'];
    if (!loader) {
      throw new Error('no such loader ' + match[1]);
    }
    logger.log(`starting loader ${name}`);
    return loader({name, monitor, logger, stopper, tcapi, config, settings});
  }));

  return loaderPromises.catch(err => {
    stopper.forceStop(err);
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
