const chalk = require('chalk');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const https = require('https');

/**
 * Manage calls to the TC API
 */
class TCAPI {
  constructor(monitor, logger) {
    this.monitor = monitor;
    this.logger = logger;

    this.clientConfig = process.env.TASKCLUSTER_PROXY_URL ?
      {rootUrl: process.env.TASKCLUSTER_PROXY_URL} :
      taskcluster.fromEnvVars();
    this.clientConfig.agent = new https.Agent({
      keepAlive: true,
      maxSockets: Infinity,
      maxFreeSockets: 256,
    });

    this.running = {};
    this.counts = {};
    this.hist = [];

    monitor.output_fn(30, () => this.output());
  }

  output() {
    const WINDOW_WIDTH = 10000;
    const now = +new Date();
    while (this.hist.length && this.hist[0][0] < now - WINDOW_WIDTH) {
      this.hist.splice(0, 1);
    }
    this.hist.push([now, _.clone(this.counts)]);

    if (this.hist.length < 2) {
      return '';
    }
    const [startTime, startCount] = this.hist[0];
    const [endTime, endCount] = this.hist[this.hist.length - 1];
    const durSecs = (endTime - startTime) / 1000;

    const props = Object.keys(endCount).sort();
    const apiMethods = [];
    for (let prop of props) {
      const start = startCount[prop] || 0;
      const end = endCount[prop];
      const rate = (end - start) / durSecs;
      if (rate > 10) {
        apiMethods.push(` ▶ ${chalk.yellow(prop)}: ${Math.round(rate)} per second`);
      } else {
        apiMethods.push(` ▶ ${chalk.yellow(prop)}: ${Math.round(rate * 100) / 100} per second`);
      }
    }
    const apiMethodStr = `${chalk.bold('API Method Rates')}:\n${apiMethods.join('\n')}`;

    const runningCalls = Object.keys(this.running).sort();
    const runningStr = `${chalk.bold('Running API Calls:')} ${runningCalls.map(m => chalk.yellow(m) + '=' + this.running[m]).join(' ')}`;

    return `${runningStr}\n${apiMethodStr}`;
  }

  _count(name) {
    this.counts[name] = (this.counts[name] || 0) + 1;
  }

  _running(name, inc) {
    this.running[name] = (this.running[name] || 0) + inc;
  }

  async call(name, cb) {
    let res;
    try {
      this._running(name, 1);
      try {
        res = await cb();
      } finally {
        this._running(name, -1);
        this._count(name);
      }
      return res;
    } catch (err) {
      if (err.statusCode === 500) {
        this.logger.log(`500 error from ${name}`);
        return;
      }
      if (err.statusCode === 502) {
        this.logger.log(`502 error from ${name}`);
        return;
      }
      if (err.code === 'ECONNABORTED') {
        this.logger.log(`timeout from ${name}`);
        return;
      }
      throw err;
    }
  }
}

module.exports = TCAPI;
