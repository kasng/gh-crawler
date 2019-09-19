const {Github} = require('./libs/github');
const Config = require('./config');
const {GithubRequestQueue} = require('./libs/redis/redis_queues');

(async () => {
    const searchParams = Github.initSearchParams();

    GithubRequestQueue.add(searchParams);
    console.error('============ END ============');
})();
