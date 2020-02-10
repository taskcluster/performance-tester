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

  update_counts() {
    const now = +new Date();
    const WINDOW_WIDTH = 10 * 60 * 1000 + 1000; // must be > max `since` in TIMES
    const TIMES = [
      {name: 'latest', since: now},
      {name: '10m', since: now - 10 * 60 * 1000},
      {name: '1m', since: now - 1 * 60 * 1000},
      {name: '5s', since: now - 1000},
    ];

    // drop items that are outside of the window
    while (this.hist.length && this.hist[0][0] < now - WINDOW_WIDTH) {
      this.hist.splice(0, 1);
    }

    // now find counts that are at least as old as each of the times
    const res = TIMES.map(({name, since}) => ({name, since, time: undefined, counts: undefined}));
    for (let [time, counts] of this.hist) {
      for (let r of res) {
        if (time <= r.since) {
          r.time = time;
          r.counts = counts;
        }
      }
    }

    return res.map(({name, time, counts}) => ({name, time, counts}));
  }

  output() {
    const now = +new Date();
    if (!this.hist.length > 0 || this.hist[this.hist.length - 1][0] < now - 500) {
      this.hist.push([now, _.clone(this.counts)]);
    }
    const hist = this.update_counts();
    const [latest] = hist.splice(0, 1);

    const apiMethods = [];
    for (let meth of Object.keys(this.counts).sort()) {
      const line = [];
      for (let then of hist) {
        if (latest.counts && then.counts && then.counts[meth] && latest.counts[meth]) {
          const dur = latest.time - then.time;
          const diff = latest.counts[meth] - then.counts[meth];
          const rate = diff * 1000 / dur;
          if (rate > 10) {
            line.push(chalk`{bold ${Math.round(rate)}/s} (${then.name})`);
          } else {
            line.push(chalk`{bold ${Math.round(rate * 100)/100}/s} (${then.name})`);
          }
        }
      }
      if (line.length > 0) {
        apiMethods.push(` ▶ ${chalk.yellow(meth)}: ${line.join(' / ')}`);
      }
    }
    const apiMethodStr = apiMethods.length > 0 ? `${chalk.bold('API Method Rates')}:\n${apiMethods.join('\n')}` : '';

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
      if (err.code === 'ECONNRESET') {
        this.logger.log(`connection reset from ${name}`);
        return;
      }
      throw err;
    }
  }
}

module.exports = TCAPI;
