const fs = require('fs');

module.exports = {};

fs.readdirSync(`${__dirname}/`).forEach(file => {
  if (file !== 'index.js' && file.match(/\.js$/)) {
    const exports = require(`./${file}`);
    Object.keys(exports)
      .filter(key => key.endsWith('_loader'))
      .forEach(key => {
        if (module.exports[key]) {
          throw new Error(`Cannot export same loader twice: "${key}"`);
        }
      });
    Object.assign(module.exports, exports);
  }
});
