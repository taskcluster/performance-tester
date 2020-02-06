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

### createtask

* `task-queue-id` - task queue to create tasks in
* `rate` - target pending count for the `built-in/succeed` worker pool

This loader creates tasks for the given task queue at the given rate.

It also monitors the pending count for the queue, and will throttle itself it
that goes above 20s worth of tasks.

### claimwork

* `task-queue-id` - task queue to claim from
* `parallelism` - number of "workers" to run in parallel (each with capacity=4)

This loader claims and "runs" tasks with a simulated worker that takes about
60s to complete a task.

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
