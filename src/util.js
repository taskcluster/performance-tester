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

exports.atRate = (state, cb, rate) => {
  let started = 0;
  let completed = 0;
  let outstanding = {};
  let start = +new Date();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const shouldveStarted = rate * (+new Date() - start) / 1000;
      while (started < shouldveStarted) {
        const i = started;
        cb().then(() => {
          completed++;
          delete outstanding[i];
        }, reject);
        started++;
      }
      if (state.stop) {
        clearInterval(timer);
        Promise.all(Object.values(outstanding)).then(resolve);
      }
      if (started > rate * 60 && completed < 0.8 * started) {
        reject(new Error(`not completing ${cb} fast enough`));
      }
    }, rate < 3 ? 100 : 10);
  });
};

exports.apiCall = async (state, name, cb) => {
  try {
    state.running(name, 1);
    try {
      res = await cb();
    } finally {
      state.running(name, -1);
    }
    state.count(name, 1);
    return res;
  } catch (err) {
    if (err.statusCode === 500) {
      state.log(`500 error from ${name}`);
      state.count(name + '-500', 1);
      return;
    }
    if (err.statusCode === 502) {
      state.log(`502 error from ${name}`);
      state.count(name + '-502', 1);
      return;
    }
    if (err.code === 'ECONNABORTED') {
      state.log(`timeout from ${name}`);
      state.count(name + '-timeout', 1);
      return;
    }
    throw err;
  }
}
