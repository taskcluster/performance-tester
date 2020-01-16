const chalk = require('chalk');
const spinners = require('cli-spinners');
const SPINNER = spinners.arrow3;

class Stopper {
  constructor(monitor, logger) {
    // a boolean and a promise that will become true and resolve, respectively,
    // when the process should stop
    this.stop = false;
    this.promise = new Promise(resolve => this._resolve = resolve);

    // stop on a keypress
    process.stdin.setRawMode(true).resume();
    process.stdin.on('data', k => {
      logger.log('stopping');
      if (this.stop && k == 'Q') {
        process.exit(1);
      }
      this.forceStop();
    });

    this.runStart = +new Date();

    // show the current state
    monitor.output_fn(5, () => `${this.output_state()} ${this.output_spinner()}\n`);
  }

  forceStop(err) {
    if (err) {
      this.error = err;
    }

    if (!this.stop) {
      this.stop = true;
      this._resolve();
    }
  }

  output_state() {
    const pfx = `${chalk.bold('State')}:`;
    if (this.stop) {
      if (this.error) {
        return `${pfx} ${chalk.bold.red('error')} ${this.error.toString().split('\n')[0]}`;
      } else {
        return `${pfx} ${chalk.red('stopping')} (Q to force)`;
      }
    } else {
      return `${pfx} ${chalk.green('running')} (any key to stop)`;
    }
  }

  output_spinner() {
    return SPINNER.frames[Math.round((+new Date - this.runStart) / SPINNER.interval) % SPINNER.frames.length];
  }
}

module.exports = Stopper;
