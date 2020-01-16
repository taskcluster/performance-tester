const chalk = require('chalk');

const LOG_LENGTH = 40;

/**
 * Responsible for logging messages from other components
 */
class Logger {
  constructor(monitor) {
    monitor.output_fn(0, () => this.output());
    this.logs = [];
  }

  log(message) {
    this.logs.push([new Date(), message]);
  }

  output() {
    if (this.logs.length > LOG_LENGTH) {
      this.logs.splice(0, this.logs.length - LOG_LENGTH);
    }

    return this.logs.map(([when, msg]) => `${chalk.magenta(when)} - ${msg}`).join('\n') + '\n';
  }
}

module.exports = Logger;
