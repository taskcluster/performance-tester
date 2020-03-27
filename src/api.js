const chalk = require('chalk');
const assert = require('assert');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const https = require('https');

const WINDOW_WIDTH = 10 * 60 * 1000 + 1000; // must be > max `since` in times
const TIMES = [
  {name: 'latest', since: now => now},
  {name: '10m', since: now => now - 10 * 60 * 1000},
  {name: '1m', since: now => now - 1 * 60 * 1000},
  {name: '5s', since: now => now - 1000},
];

const renderGrid = grid => {
  dbg = [];
  const lengths = new Set([...grid.map(row => row.length)]);
  assert(lengths.size === 1, "all grid rows must have same length");
  const width = [...lengths][0];
  const colWidths = new Array(width);

  for (const row of grid) {
    let i = 0;
    for (const {text, formatter} of row) {
      colWidths[i] = Math.max(colWidths[i] || 0, text.length);
      i++;
    }
  }

  const lines = [];
  for (const row of grid) {
    const line = [''];
    let i = 0;
    for (const {text, formatter} of row) {
      const cell = formatter(text);
      line.push(cell + _.repeat(' ', colWidths[i] - text.length));
      i++;
    }
    lines.push(line.join(' '));
  }
  return lines.join('\n');
};

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
    const times = TIMES.map(({name, since}) => ({name, since: since(now)}));

    // drop items that are outside of the window
    while (this.hist.length && this.hist[0][0] < now - WINDOW_WIDTH) {
      this.hist.splice(0, 1);
    }

    // now find counts that are at least as old as each of the times
    const res = times.map(({name, since}) => ({name, since, time: undefined, counts: undefined}));
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

    const apiMethods = {};
    const allMethodRates = {};
    for (let meth of Object.keys(this.counts)) {
      let info = apiMethods[meth];
      if (!info) {
        info = apiMethods[meth] = {};
      }

      const line = [];
      for (let then of hist) {
        if (latest.counts && then.counts && then.counts[meth] && latest.counts[meth]) {
          const dur = latest.time - then.time;
          const diff = latest.counts[meth] - then.counts[meth];
          const rate = diff * 1000 / dur;
          allMethodRates[then.name] = (allMethodRates[then.name] || 0) + rate;
          if (rate > 10) {
            info[then.name] = {text: `${Math.round(rate)}/s`, formatter: chalk.cyan};
          } else {
            info[then.name] = {text: `${Math.round(rate * 100)/100}/s`, formatter: chalk.cyan};
          }
        }
      }
    }
    for (let meth of Object.keys(this.running)) {
      let info = apiMethods[meth];
      if (!info) {
        info = apiMethods[meth] = {};
      }
      info['running'] = {text: this.running[meth].toString(), formatter: chalk.yellow};
    }

    const grid = [
      [
        {text: 'Method', formatter: chalk.bold},
        ...TIMES.slice(1).map(({name}) => ({text: `${name} avg`, formatter: chalk.bold})),
        {text: 'running', formatter: chalk.bold},
      ],
    ];
    for (let meth of Object.keys(apiMethods).sort()) {
      grid.push([
        {text: meth, formatter: chalk.magenta},
        ...TIMES.slice(1).map(({name}) => (apiMethods[meth][name] ?
                              apiMethods[meth][name] :
                              {text: '-', formatter: chalk.gray})),
        apiMethods[meth].running ? apiMethods[meth].running : {text: '0', formatter: chalk.yellow},
      ]);
    }
    grid.push([
      {text: 'Total', formatter: chalk.bold.magenta},
      ...TIMES.slice(1).map(({name}) => allMethodRates[name] ?
                            {text: `${Math.round(allMethodRates[name])}/s`, formatter: chalk.bold.cyan} :
                            {text: '-', formatter: chalk.gray}),
      {text: '-', formatter: chalk.gray},
    ]);

    return `${chalk.bold('API Methods')}:\n${renderGrid(grid)}`;
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
        return false;
      }
      if (err.statusCode === 502) {
        this.logger.log(`502 error from ${name}`);
        return false;
      }
      if (err.code === 'ECONNABORTED') {
        this.logger.log(`timeout from ${name}`);
        return false;
      }
      if (err.code === 'ECONNRESET') {
        this.logger.log(`connection reset from ${name}`);
        return false;
      }
      throw err;
    }
  }
}

module.exports = TCAPI;
