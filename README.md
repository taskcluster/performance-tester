# performance-tester

A performance tester for Taskcluster deployments.

*NOTE*: this is built as a development testing tool and is not suitable for general use.

# Usage

Configuration is via env vars.
There are a set of loaders described below, and the desired loaders are specified in LOADERS as a space-separated list of `<loader>@<rate>` where the rate is requests per second.
For example:

```shell
LOADERS="expandscopes@100"
EXPANDSCOPES="assume:repo:github.com/taskcluster/taskcluster:push assume:*"
yarn load
```

## Loaders

### expandscopes

*Configuration*:
```shell
LOADERS="expandscopes@10"
EXPANDSCOPES="somescope someotherscope"
```
This loader calls `auth.expandScopes` with a random subset of the scopes given as a the space-separated list in EXPANDSCOPES.
