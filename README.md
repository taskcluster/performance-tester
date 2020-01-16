# performance-tester

A performance tester for Taskcluster deployments.

*NOTE*: this is built as a development testing tool and is not suitable for general use.

# Usage

Configuration is via env vars.
There are a set of loaders described below, and the desired loaders are specified in LOADERS as a space-separated list of `<loader>@<rate>` where the rate is requests per second.
For example:

```shell
export TASKCLUSTER_ROOT_URL=..
export TASKCLUSTER_CLIENT_ID=..
export TASKCLUSTER_ACCESS_TOKEN=..
export LOADERS="expandscopes@100"
export EXPANDSCOPES="assume:repo:github.com/taskcluster/taskcluster:push assume:*"
export EXPANDSCOPES_RATE=100
yarn load
```

## Loaders

### expandscopes

**Configuration**:
```shell
export LOADERS="expandscopes"
export EXPANDSCOPES="somescope someotherscope"
export EXPANDSCOPES_RATE=100
```
This loader calls `auth.expandScopes` with a random subset of the scopes given as a the space-separated list in EXPANDSCOPES.

### claimwork

**Configuration**:
```shell
export LOADERS="claimwork"
export CLAIMWORK_TASKQUEUID=proj-taskcluster/load-test
export CLAIMWORK_PENDING_COUNT=10
export CLAIMWORK_PARALLELISM=10
export CLAIMWORK_TASK_FILE=./task.yml
```

This loader creates and resolves tasks.  It ensures that there are at least
CLAIMWORK_PENDING_COUNT tasks pending, adding tasks where necessary.
Otherwise, it claims tasks from the queue and resolves them, and then creates a
new task to replace each one.
