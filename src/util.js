const assert = require('assert');
const chalk = require('chalk');

exports.sleep = duration => new Promise(resolve => setTimeout(resolve, duration));

exports.loopUntilStop = (state, interval, cb) => {
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      Promise.resolve(cb()).catch(err => {
        clearInterval(timer);
        reject(err);
      });

      if (state.stop) {
        clearInterval(timer);
        resolve();
      }
    }, interval);
  });
};

exports.atRate = ({stopper, logger, name, rate}, cb) => {
  assert(rate, "rate omitted");
  let started = 0;
  let completed = 0;
  let skipped = 0;
  let outstanding = {};
  let start = +new Date();

  // we want to have at most 30 seconds worth of API calls running at
  // any given time; more than that and we'll start skipping.
  let maxRunning = 30 * rate;

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const shouldveStarted = rate * (+new Date() - start) / 1000;
      while (started + skipped < shouldveStarted) {
        if (completed > started - maxRunning) {
          const i = started;
          cb().then(() => {
            completed++;
            delete outstanding[i];
          }, reject);
          started++;
        } else {
          if (!skipped) {
            logger.log(`${chalk.bgRed('WARNING:')} ${name} unable to keep up with rate ${rate}; skipping some calls`);
          }
          skipped++;
        }
      }
      if (stopper.stop) {
        clearInterval(timer);
        Promise.all(Object.values(outstanding)).then(resolve);
      }
    }, rate < 3 ? 100 : 10);
  });
};
