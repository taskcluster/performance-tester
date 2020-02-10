99% of the requests to Firefox-CI-TC during a 10-minute window in Feb 2020
consisted of the following

```
  total API method                 req/s
  ----- -------------------------- -----
   1002 queue.reportCompleted     +1.7
   1055 secrets.get               +1.8
   1208 queue.reclaimTask         +2
   1640 index.findTask             2.7
   1713 index.findArtifactFromTask 2.9
   2421 queue.listLatestArtifacts  4
   2463 queue.createTask          +4.1
   2511 queue.pendingTasks        +4.2
   2847 queue.listWorkers          4.7
   4357 queue.listArtifacts        7.3
   6748 purge-cache.purgeRequests  11.2
   6849 queue.getArtifact          11.4
  10792 queue.createArtifact       18
  12355 queue.getLatestArtifact    20.6
  18990 queue.task                +31.7
  23313 queue.claimWork           +38.9
  40383 auth.authenticateHawk      n/a
 252647 queue.status              +421
```
