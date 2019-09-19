const {
    redisCommonConn,
    RedisSortedSetsMaster,
} = require('./redis_conn');

const lodash = require('lodash');
const Config = require('./../../config');
const LOCALLY_PROXY = `http://${Config.axios.proxy.host}:${Config.axios.proxy.port}`;

/**
 * Store luminati random proxies into sorted sets
 */
class RandomProxyRedis {
    constructor(redisConn) {
        if (redisConn) {
            this.redisConn = redisConn;
        } else {
            this.redisConn = redisCommonConn;
        }
        this.redisProxyKey = 'random_proxies_sets'; // Redis Sorted sets data type
    }

    async pick() {
        var minScoreProxy = await this.redisConn.zrangebyscore(this.redisProxyKey, '-inf', '+inf', 'WITHSCORES', 'LIMIT', 0, 1);

        if (minScoreProxy && Array.isArray(minScoreProxy) && minScoreProxy.length > 1) {
            var resMinScore = lodash.clone(minScoreProxy);
            /**
             * Increate minscore proxy
             */
            await this.redisConn.zincrby(this.redisProxyKey, 1, resMinScore[0]);

            return resMinScore[0];
        }
        // Locally proxy. Run command `node src/proxy-server.js`
        return LOCALLY_PROXY;
    }

    async count() {
        return await this.redisConn.zcount(this.redisProxyKey, '-inf', '+inf');
    }

    async check_proxy_avai(proxy) {
        var rank = await this.redisConn.zrank(this.redisProxyKey, proxy);
        if (null === rank) {
            return false;
        }
        return rank;
    }

    async ZREM(proxy) {
        return await this.redisConn.zrem(this.redisProxyKey, proxy);
    }

    async ZADD(proxy, score = 0) {
        return this.redisConn.zadd(this.redisProxyKey, score, proxy);
    }
}

var randomProxyRedisInstance = new RandomProxyRedis(redisCommonConn);


/**
 * This sorted sets save the number of failed of proxy url
 */
class RandomProxyFailedStatsRedis extends RedisSortedSetsMaster {
    constructor(props) {
        super(props);
        this.mainKey = 'proxy_request_failed_stats';
    }
}

module.exports = {
    RandomProxyRedis: randomProxyRedisInstance,
    RandomProxyFailedStatsRedis: new RandomProxyFailedStatsRedis(redisCommonConn)
};
