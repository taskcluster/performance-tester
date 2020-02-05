# performance-tester

A performance tester for Taskcluster deployments.

*NOTE*: this is built as a development testing tool and is not suitable for general use.

# Usage

```
yarn load <cfg>
```

The configuration file contains an object `loaders` with an array of loaders to
run.  Each object has a name, a `use` property giving the loader
implementation, and settings for that implementation.

The output is a frequently-updated textual display giving rates of various API
methods, counts of running API calls, and metadata about each running loader.

For example:

```yaml
loaders:
  test-built-in:
    use: builtin
    pending-count: 100
```

## Loaders

### builtin

* `pending-count` - target pending count for the `built-in/succeed` worker pool

This loader keeps the pending queue full for the built-in-workers service.

This is somewhat difficult since `queue.pendingTasks` does not update immediately, so the best approach is to set a high pending count.

### claimwork

* `task-queue-id` - task queue to create tasks in
* `parallelism` - number of "workers" to run in parallel
* `pending-count` - target pending count for the `built-in/succeed` worker pool

This loader is similar to builtin, but runs the tasks itself with a simulated
worker.  The same warnings apply about the pending count, but this loader helps
the situation by creating a new task immediately every time it resolves a task.
So a pending-count of 1000 should do.

### expandscopes

* `rate` - the rate at which to call the API method (req/s)
* `scopes` - the scopes to expand

This loader calls `auth.expandScopes` with random subsets of the given scopes,
attempting to do so at the given rate.  It will make multiple parallel calls to
achieve that rate, if necessary.

### gettask

* `rate` - the rate at which to call the API method (req/s)

This loader calls `queue.task` with random taskIds for tasks that other loaders
have created.  It can't start until such a task is created, which may tak ea
few seconds.
