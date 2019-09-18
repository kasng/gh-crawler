const {Github} = require('./libs/github');
const {Utils} = require('./libs/utils');
const Config = require('./config');
var lodash = require('lodash');
const mongoose = require('mongoose');
const {GithubRequestQueue} = require('./libs/redis/redis_queues');


(async () => {
    await Utils.connectMongo();
    // Start queue listener
    GithubRequestQueue.process(Config.queue.concurrency, function (job, done) {
        console.log(job.data);
        // Delay time between request ~ 1-4 seconds
        const delayTime = new Promise((resolve, reject) => {
            setTimeout(resolve, lodash.random(1, 4) * 1000);
        });

        delayTime.then(function () {
            // Main process
            const jobData = lodash.clone(job.data);
            // Search Repos API
            if ('type' in jobData && jobData.type === 'SearchRepos') {
                Utils.logInfo(JSON.stringify(jobData), 'Search_Repos');
                try {
                    Github.processSearchRepos(jobData, done);
                } catch (e) {
                    Utils.logInfo(e, 'Search_Repos_Error');
                    throw e;
                }
            } else if ('type' in jobData && jobData.type === 'RepoTopics') {
                // Repo Topics API
                Utils.logInfo(JSON.stringify(jobData), 'Topics_Job');

                try {
                    Github.processRepoTopics(jobData, done);
                } catch (e) {
                    Utils.logInfo(e, 'Topics_Error');
                    throw e;
                }

            } else if ('type' in jobData && jobData.type === 'RepoLanguages') {
                // Repo Languages API
                Utils.logInfo(JSON.stringify(jobData), 'Languages_Job');

                try {
                    Github.processRepoLanguages(jobData, done);
                } catch (e) {
                    Utils.logInfo(e, 'Languages_Error');
                    throw e;
                }

            } else if ('type' in jobData && jobData.type === 'RepoContributors') {
                // Repo Contributors API
                Utils.logInfo(JSON.stringify(jobData), 'Contributors_Job');
                try {
                    Github.processRepoContributors(jobData, done);
                } catch (e) {
                    Utils.logInfo(e, 'Contributors_Error');
                    throw e;
                }
            } else if ('type' in jobData && jobData.type === 'User') {
                // User API
                Utils.logInfo(JSON.stringify(jobData), 'User_Job');
                try {
                    Github.processUser(jobData, done);
                } catch (e) {
                    Utils.logInfo(e, 'User_Error');
                    throw e;
                }
            } else if ('type' in jobData && jobData.type === 'UserStarred') {
                // User Starred Repos API
                Utils.logInfo(JSON.stringify(jobData), 'User_Starred');
                try {
                    Github.processUserStarredRepos(jobData, done);
                } catch (e) {
                    Utils.logInfo(e, 'User_Starred_Error');
                    throw e;
                }
            } else if ('type' in jobData && jobData.type === 'UserRepos') {
                // User Repos API
                Utils.logInfo(JSON.stringify(jobData), 'User_Repos_Job');
                try {
                    Github.processUserRepos(jobData, done);
                } catch (e) {
                    Utils.logInfo(e, 'User_Repos_Error');
                    throw e;
                }
            } else if ('type' in jobData && jobData.type === 'UserEvents') {
                // User Events API
                Utils.logInfo(JSON.stringify(jobData), 'User_Events_Job');
                try {
                    Github.processUserEvents(jobData, done);
                } catch (e) {
                    Utils.logInfo(e, 'User_Events_Job');
                    throw e;
                }
            } else if ('type' in jobData && jobData.type === 'NpmEmail') {
                // Get user email from npm
                Utils.logInfo(JSON.stringify(jobData), 'Npm_Email_Job');
                try {
                    Github.getUserEmailFromNpm(jobData, done);
                } catch (e) {
                    Utils.logInfo(e, 'Npm_Email_Job');
                    throw e;
                }
            } else {
                done();
            }
        }).catch(done);
    });

})();
