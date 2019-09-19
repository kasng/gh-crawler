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
                port: this.port
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
        queue_instance.on('ready', () => {
            console.log(`${queue_name} queue now ready to start doing things`);
            Utils.logInfo(`${queue_name} queue now ready to start doing things`, 'QueueEvent');
        });
        queue_instance.on('error', (err) => {
            console.log(`${queue_name} error happened: ${err.message}`);
            Utils.logInfo(`${queue_name} error happened: ${err.message}`, 'QueueEvent');
        });
        queue_instance.on('succeeded', (job, result) => {
            console.log(`${queue_name} Job ${job.id} succeeded with result: ${result}`);
            Utils.logInfo(`${queue_name} Job ${job.id} succeeded with result: ${result}`, 'QueueEvent');
        });
        queue_instance.on('failed', (job, err) => {
            console.log('------------------- JOB FAILED -------------------');
            console.error(err);
            console.log(`${queue_name} Job ${job.id} failed with error ${err.message}`);
            Utils.logInfo(`${queue_name} Job ${job.id} failed with error ${err.message}`, 'QueueEvent');
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

module.exports = {
    GithubRequestQueue: GithubRequestQueue.init()
};
