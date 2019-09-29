var _utils = require('apify-client/build/utils');
var Queue = require('bull');
const {Utils} = require('./../utils');
const Config = require('./../../config');

const REDIS_DEFAULT_PORT = Config.redisQueue.port;

class AppInitRedisQueue {
    constructor(options = {}) {
        (0, _utils.checkParamOrThrow)(options, 'options', 'Object');

        const {
            queueName,
            port = REDIS_DEFAULT_PORT,
            host = Config.redisQueue.host,
            addEvent = true
        } = options;

        (0, _utils.checkParamOrThrow)(queueName, 'queueName', 'Number | String');
        (0, _utils.checkParamOrThrow)(port, 'port', 'Number | String');
        (0, _utils.checkParamOrThrow)(host, 'host', 'String');
        (0, _utils.checkParamOrThrow)(addEvent, 'addEvent', 'Boolean');

        this.queueName = queueName;
        this.port = port;
        this.host = host;
        this.addEvent = addEvent;
    }

    init() {
        const queue = new Queue(this.queueName, {
            redis: {
                host: this.host,
                port: this.port,
                retryStrategy: function (times) {
                    // Delay time
                    return Math.min(times * 50, 2000);
                },
                reconnectOnError: function (err) {
                    var targetError = 'READONLY';
                    if (err.message.slice(0, targetError.length) === targetError) {
                        // Only reconnect when the error starts with "READONLY"
                        return true; // or `return 1;`
                    }
                },
                maxRetriesPerRequest: 1
            },
            // Limit queue to max 5 jobs per 5 seconds
            limiter: {
                max: 5,
                duration: 5000
            }
        });
        if (true === this.addEvent) {
            this.addQueueEvents(queue, this.queueName);
        }

        return queue;
    }

    addQueueEvents(queue_instance, queue_name) {
        queue_instance.on('active', (job, jobPromise) => {
            console.log(`${job.id} stated with data: `, job.data);
            Utils.logInfo(`${queue_name} queue now ready to start doing things`, 'QueueEvent');
        });
        queue_instance.on('error', (err) => {
            console.log(`${queue_name} error happened: ${err.message}`);
            Utils.logInfo(`${queue_name} error happened: ${err.message}`, 'QueueEvent');
        });
        queue_instance.on('completed', (job, result) => {
            console.log(`${queue_name} Job ${job.id} completed with result: ${result}`);
            Utils.logInfo(`${queue_name} Job ${job.id} completed with result: ${result}`, 'QueueEvent');
        });
        queue_instance.on('failed', (job, err) => {
            console.log('------------------- JOB FAILED -------------------');
            if (String(err.name) === 'TimeoutError' || String(err.message).includes('Promise timed out')) {
                // Retry job
                console.log('RETRY THIS JOB');
                console.log(job.data);
                try {
                    job.retry();
                } catch (e) {
                    console.log(e);
                }
            }
            console.error(err);
            console.log(`${queue_name} Job ${job.id} failed with error ${err.message}`);
            Utils.logInfo(`${queue_name} Job ${job.id} failed with error ${err.message}`, 'QueueEvent');
            console.log('------------------- END JOB FAILED -------------------');
        });
        queue_instance.on('stalled', (jobId) => {
            console.log(`${queue_name} Job ${jobId} stalled and will be reprocessed`);
            Utils.logInfo(`${queue_name} Job ${jobId} stalled and will be reprocessed`, 'QueueEvent');
        });
    }
}

const GithubRequestQueue = new AppInitRedisQueue({
    queueName: 'github-request-queue',
    port: REDIS_DEFAULT_PORT,
});

const ContributorRequestQueue = new AppInitRedisQueue({
    queueName: 'contributor-request-queue',
    port: 6680,
});

const RepoRequestQueue = new AppInitRedisQueue({
    queueName: 'repo-request-queue',
    port: 6681,
});

module.exports = {
    GithubRequestQueue: GithubRequestQueue.init(),
    ContributorRequestQueue: ContributorRequestQueue.init(),
    RepoRequestQueue: RepoRequestQueue.init(),
};
