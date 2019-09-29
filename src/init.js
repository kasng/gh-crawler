const Config = require('./config');
const lodash = require('lodash');
const {Github} = require('./libs/github');
const {Utils} = require('./libs/utils');
var GithubContributorModel = require('./libs/models/contributor');
var GithubRepoModel = require('./libs/models/repo');
var {ContributorRequestQueue} = require('./libs/redis/redis_queues');

(async () => {
    // Init crawler
    // const searchParams = Github.initSearchParams();
    //
    // GithubRequestQueue.add(searchParams);

    // // Migrate queue
    await Utils.connectMongo();
    // // Start queue listener
    // GithubRequestQueue.process(10, function (job, done) {
    //     console.log(job.data);
    //     // Main process
    //     const jobData = lodash.clone(job.data);
    //     // Process Job
    //     Github.addRequestQueue(jobData, 1);
    //     done();
    // });

    // GET USERS MISSING LOCATION FIELDS
    const docs = await GithubContributorModel.find({
        location: {
            $exists: false
        }
    }).exec();

    for (let doc of docs) {
        let docJson = doc.toJSON();
        console.log(docJson.login);
        console.log(docJson.url);
        console.log(docJson._id);
        const userJobData = {
            contributorObjectId: doc._id,
            url: docJson.url,
            contributorLogin: docJson.login,
            type: 'User'
        };
        // // Utils.logInfo(JSON.stringify(userJobData), 'User_Job_Data');
        console.log(userJobData);
        Github.addRequestQueue(userJobData, 1);
        await new Promise((resolve, reject) => {
            setTimeout(resolve,1000);
        });
    }

    // const docs = await GithubContributorModel.find({
    //     location: {
    //         $exists: false
    //     }
    // }).exec();
    //
    // for (let doc of docs) {
    //     let repoObject = doc.toJSON();
    //     console.log(doc);
    //     console.log(repoObject);
    //     // console.log(doc._id);
    //     // console.log(repoObject.name);
    //     // console.log(repoObject.full_name);
    //     // let contributorsUrl = `${Config.github.api.host}/repos/${repoObject.full_name}/contributors?per_page=${Config.github.api.perPage}&page=1`;
    //     // if ('contributors_url' in repoObject && repoObject.contributors_url) {
    //     //     contributorsUrl = `${repoObject.contributors_url}?per_page=${Config.github.api.perPage}&page=1`;
    //     // }
    //     //
    //     // const contributorJobData = {
    //     //     repoObjectId: doc._id,
    //     //     url: contributorsUrl,
    //     //     repoName: repoObject.name,
    //     //     repoFullName: repoObject.full_name,
    //     //     type: 'RepoContributors'
    //     // };
    //     // // Utils.logInfo(JSON.stringify(userJobData), 'User_Job_Data');
    //     // console.log(contributorJobData);
    //     // Github.addRequestQueue(contributorJobData, 1);
    //     await new Promise((resolve, reject) => {
    //         setTimeout(resolve,1000);
    //     });
    // }


    // var cursor = await GithubContributorModel.m
    // cursor.on('data', function(doc) {
    //     // Called once for every document
    //     console.log(doc);
    // });
    // cursor.on('error', function(err) {
    //     // Called once for every document
    //     console.log(err);
    // });
    // cursor.on('close', function() {
    //     // Called when done
    //     console.log('--- CLOSE ----');
    // });
    // console.log(docs);
    console.log(docs.length);

    console.error('============ END ============');
})();
