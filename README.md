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

### createtasks

**Configuration**:
```shell
export LOADERS="createtasks"
export CREATETASKS_TASKQUEUID=proj-taskcluster/load-test
export CREATETASKS_COUNT=10
export CREATETASKS_TASK_FILE=./task.yml
```

This loader polls `queue.pendingTasks` every 2 seconds and ensures that at least CREATETASKS_COUNT tasks are in the queue, adding tasks from the JSON-e template in CREATETASKS_TASK_FILE.
The intent of this load generator is to create a set of tasks for another load generator to process.
