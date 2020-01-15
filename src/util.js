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
