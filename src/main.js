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
      throw new Error('no such loader ' + loader);
    }
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
