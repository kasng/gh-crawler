const {Github} = require('./libs/github');
const {Utils} = require('./libs/utils');
const Config = require('./config');
var lodash = require('lodash');
const {GithubRequestQueue, ContributorRequestQueue, RepoRequestQueue} = require('./libs/redis/redis_queues');


(async () => {
    await Utils.connectMongo();
    // Start queue listener
    GithubRequestQueue.process(Config.queue.concurrency, function (job) {
        console.log(job.data);
        // Main process
        const jobData = lodash.clone(job.data);
        // Process Job
        return Github.processJob(jobData, job);
    });

    ContributorRequestQueue.process(function (job) {
        console.log(job.data);
        // Main process
        const jobData = lodash.clone(job.data);
        // Process Job
        return Github.processJob(jobData, job);
    });

    RepoRequestQueue.process(function (job) {
        console.log(job.data);
        // Main process
        const jobData = lodash.clone(job.data);
        // Process Job
        return Github.processJob(jobData, job);
    });

})();
