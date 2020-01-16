const _ = require('lodash');
const logUpdate = require('log-update');

const INTERVAL = 100;

/**
 * A monitor displays the current status of the load generation, updating an onscreen result.
 */
class Monitor {
  constructor() {
    this.output_fns = [];

    this.timer = setInterval(() => this.update(), INTERVAL);
  }

  output_fn(order, fn) {
    this.output_fns.push([order, fn]);
    this.output_fns.sort((a, b) => {
      if (a[0] < b[0]) {
        return -1;
      } else if (a[0] > b[0]) {
        return 1;
      } else {
        return 0;
      }
    });
  }

  update() {
    logUpdate(`\n` + this.output_fns.map(([i, fn]) => fn()).join(''));
  }
}

module.exports = Monitor;
