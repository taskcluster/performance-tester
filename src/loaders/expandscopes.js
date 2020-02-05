const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {atRate} = require('../util');
const {clientConfig} = require('./common');

// expandscopes: call auth.expandScopes with items randomly selected from
// $EXPANDSCOPES
exports.expandscopes_loader = async ({name, stopper, tcapi, settings, monitor}) => {
  const auth = new taskcluster.Auth(clientConfig);
  const scopes = settings.scopes;
  const rate = settings.rate;

  await atRate(stopper, async () => {
    const size = _.random(1, scopes.length);
    const toExpand = _.sampleSize(scopes, size);
    await tcapi.call("auth.expandScopes", cb => auth.expandScopes({scopes: toExpand}));
  }, rate);
};

