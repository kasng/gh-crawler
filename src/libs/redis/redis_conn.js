var Redis = require('ioredis');
Redis.Promise = require('bluebird');
var lodash = require('lodash');
const process = require('process');
const Config = require('./../../config');

const JSON_KEYS = [
    'topics',
    'contributors'
];


const parseRedisVal = function (val) {
    if (val === 'null' || val === 'None' || val === 'Null' || val === 'none') {
        return null;
    }
    if (val === 'true' || val === 'True') {
        return true;
    }
    if (val === 'false' || val === 'False') {
        return false;
    }
    if (JSON_KEYS.includes(val)) {
        return JSON.parse(val);
    }
    return val;
};

const initRedisConn = (port) => {
    return new Redis({
        port: port,          // Redis port
        host: Config.redis.host,   // Redis host
        // family: 4,           // 4 (IPv4) or 6 (IPv6)
        // password: 'auth',
        // db: 0,
        // sentinels: [
        //     {host: '127.0.0.1', port: 26379},
        //     {host: '127.0.0.1', port: 26380},
        //     {host: '127.0.0.1', port: 26381}
        // ],
        // name: 'mymaster',
        // role: 'slave',
        // preferredSlaves: [
        //     { ip: '127.0.0.1', port: '6380', prio: 1 },
        //     { ip: '127.0.0.1', port: '6381', prio: 2 }
        // ],
        // This is the default value of `retryStrategy`
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
    });
};

var redisCommonConn = initRedisConn(Config.redis.port);

const exitHandler = function (options, exitCode) {
    console.error('exitHandler');
    try {
        redisCommonConn.quit();
    } finally {
        if (options.cleanup) {
            console.log('clean');
        }
        if (exitCode || exitCode === 0) {
            console.log(exitCode);
        }
        if (options.exit) {
            process.exit();
        }
    }
};

//do something when app is closing
process.on('exit', exitHandler.bind(null, {cleanup: true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit: true}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {exit: true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit: true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit: true}));

/**
 * Redis Sets Master
 */
class RedisSetsMaster {
    constructor(redisConn) {
        if (redisConn) {
            this.redisConn = redisConn;
        } else {
            this.redisConn = redisCommonConn;
        }
        this.mainKey = null; // redis sets
    }

    async SMEMBERS() {
        if (this.mainKey) {
            return await this.redisConn.smembers(this.mainKey);
        }
        return null;
    }

    async SISMEMBER(val) {
        if (this.mainKey) {
            return await this.redisConn.sismember(this.mainKey, val);
        }
        return null;
    }

    async SADD(val) {
        if (this.mainKey) {
            return await this.redisConn.sadd(this.mainKey, val);
        }
        return null;
    }

    async SREM(val) {
        if (this.mainKey) {
            return await this.redisConn.srem(this.mainKey, val);
        }
        return null;
    }

    async exists(val) {
        if (this.mainKey) {
            var member = await this.redisConn.sismember(this.mainKey, String(val));
            if (member > 0) {
                return member;
            }
        }
        return false;
    }

    async SELF_DELETE() {
        return await this.redisConn.del(this.mainKey);
    }
}


class RedisStringMaster {
    constructor(redisConn) {
        if (redisConn) {
            this.redisConn = redisConn;
        } else {
            this.redisConn = redisCommonConn;
        }
        this.mainKey = null;
    }

    async SET(val) {
        if (this.mainKey) {
            if (Array.isArray(val) || lodash.isObjectLike(val)) {
                val = JSON.stringify(val);
            }
            return await this.redisConn.set(this.mainKey, val);
        }
        return null;
    }

    async GET() {
        if (this.mainKey) {
            var val = await this.redisConn.get(this.mainKey);
            return parseRedisVal(val);
        }

        return null;
    }

    async MGET() {
        if (this.mainKey) {
            var val = await this.redisConn.mget(this.mainKey);
            console.error(val);
            return lodash.map(val, parseRedisVal);
        }
        return null;
    }

    async ALL_KEYS() {
        return await this.redisConn.keys('*');
    }

    async DELETE_ALL() {
        var keys = await this.ALL_KEYS();
        if (keys && Array.isArray(keys) && keys.length > 0) {
            for (let key of keys) {
                try {
                    await this.redisConn.del(key);
                    console.log('DELETED KEY: ', key);
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return true;
    }

    /**
     * Increase value of key
     * @param key
     * @returns {Promise<*>}
     * @constructor
     */
    async INCR(key) {
        return await this.redisConn.INCR(key);
    }

    /**
     * Increments the number stored at key by increment
     * @param key
     * @param increment
     * @returns {Promise<*>}
     * @constructor
     */
    async INCRBY(key, increment) {
        return await this.redisConn.INCRBY(key, increment);
    }
}

class RedisSortedSetsMaster {
    constructor(redisConn) {
        if (redisConn) {
            this.redisConn = redisConn;
        } else {
            this.redisConn = redisCommonConn;
        }
        this.mainKey = null;
    }

    async ZSCORE(member) {
        if (this.mainKey) {
            return this.redisConn.zscore(this.mainKey, member);
        }
        return null;
    }

    async ZADD(member, score = 0) {
        if (this.mainKey) {
            return this.redisConn.zadd(this.mainKey, score, member);
        }
        return null;
    }

    async ZINCRBY(member, score = 1) {
        if (this.mainKey) {
            return this.redisConn.zincrby(this.mainKey, score, member)
        }
        return null;
    }

    async ZCOUNT() {
        if (this.mainKey) {
            return this.redisConn.zcount(this.mainKey, '-inf', '+inf');
        }
        return null;
    }

    async ZREM(member) {
        if (this.mainKey) {
            return this.redisConn.zrem(this.mainKey, member);
        }
        return null;
    }

    async minScore() {
        if (this.mainKey) {
            return this.redisConn.zrangebyscore(this.mainKey, '-inf', '+inf', 'WITHSCORES', 'LIMIT', 0, 1);
        }
        return null;
    }

    async minScoreByUnixTime(unixTime, withscore = false, numberItem = null) {
        if (this.mainKey) {
            if (true === withscore) {
                if (null !== numberItem) {
                    return this.redisConn.zrangebyscore(this.mainKey, '-inf', unixTime, 'WITHSCORES', 'LIMIT', 0, numberItem);
                }
                return this.redisConn.zrangebyscore(this.mainKey, '-inf', unixTime, 'WITHSCORES');
            }
            if (null !== numberItem) {
                return this.redisConn.zrangebyscore(this.mainKey, '-inf', unixTime, 'LIMIT', 0, numberItem);
            }
            return this.redisConn.zrangebyscore(this.mainKey, '-inf', unixTime);
        }
        return null;
    }

    async maxScore() {
        if (this.mainKey) {
            return this.redisConn.zrevrangebyscore(this.mainKey, '+inf', '-inf', 'WITHSCORES', 'LIMIT', 0, 1);
        }
        return null;
    }

    async SELF_DELETE() {
        return await this.redisConn.del(this.mainKey);
    }
}

class RedisSuffixKeySortedSets {
    constructor(redisConn) {
        if (redisConn) {
            this.redisConn = redisConn;
        } else {
            this.redisConn = redisCommonConn;
        }
        this.mainKey = null;
    }

    wrapKey(suffix) {
        return `${this.mainKey}${suffix}`;
    }

    async ZSCORE(suffix, member) {
        if (this.mainKey) {
            return this.redisConn.zscore(this.wrapKey(suffix), member);
        }
        return null;
    }

    async ZADD(suffix, member, score = 0) {
        if (this.mainKey) {
            return this.redisConn.zadd(this.wrapKey(suffix), score, member);
        }
        return null;
    }

    async ZINCRBY(suffix, member, score = 1) {
        if (this.mainKey) {
            return this.redisConn.zincrby(this.wrapKey(suffix), score, member)
        }
        return null;
    }

    async ZCOUNT(suffix) {
        if (this.mainKey) {
            return this.redisConn.zcount(this.wrapKey(suffix), '-inf', '+inf');
        }
        return null;
    }

    async ZREM(suffix, member) {
        if (this.mainKey) {
            return this.redisConn.zrem(this.wrapKey(suffix), member);
        }
        return null;
    }

    async minScore(suffix) {
        if (this.mainKey) {
            return this.redisConn.zrangebyscore(this.wrapKey(suffix), '-inf', '+inf', 'WITHSCORES', 'LIMIT', 0, 1);
        }
        return null;
    }

    async maxScore(suffix) {
        if (this.mainKey) {
            return this.redisConn.zrevrangebyscore(this.wrapKey(suffix), '+inf', '-inf', 'WITHSCORES', 'LIMIT', 0, 1);
        }
        return null;
    }

    async ALL_KEYS() {
        return await this.redisConn.keys(`${this.wrapKey('*')}`);
    }

    async DELETE_ALL() {
        var keys = await this.ALL_KEYS();
        if (keys && Array.isArray(keys) && keys.length > 0) {
            for (let key of keys) {
                try {
                    await this.redisConn.del(key);
                    console.log('DELETED KEY: ', key);
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return true;
    }
}

class RedisSuffixKeySets {
    constructor(redisConn) {
        if (redisConn) {
            this.redisConn = redisConn;
        } else {
            this.redisConn = redisCommonConn;
        }
        this.mainKey = null;
    }

    wrapKey(suffix) {
        return `${this.mainKey}${suffix}`;
    }

    async SMEMBERS(suffix) {
        if (this.mainKey) {
            return await this.redisConn.smembers(this.wrapKey(suffix));
        }
        return null;
    }

    async SISMEMBER(suffix, val) {
        if (this.mainKey) {
            return await this.redisConn.sismember(this.wrapKey(suffix), val);
        }
        return null;
    }

    async SADD(suffix, val) {
        if (this.mainKey) {
            return await this.redisConn.sadd(this.wrapKey(suffix), val);
        }
        return null;
    }

    async SREM(suffix, val) {
        if (this.mainKey) {
            return await this.redisConn.srem(this.wrapKey(suffix), val);
        }
        return null;
    }

    async exists(suffix, val) {
        if (this.mainKey) {
            var member = await this.redisConn.sismember(this.wrapKey(suffix), String(val));
            if (member > 0) {
                return member;
            }
        }
        return false;
    }

    async ALL_KEYS() {
        return await this.redisConn.keys(`${this.wrapKey('*')}`);
    }

    async DELETE_ALL() {
        var keys = await this.ALL_KEYS();
        if (keys && Array.isArray(keys) && keys.length > 0) {
            for (let key of keys) {
                try {
                    await this.redisConn.del(key);
                    console.log('DELETED KEY: ', key);
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return true;
    }
}

class RedisHashesMaster {
    constructor(mainKey, redisConn) {
        if (redisConn) {
            this.redisConn = redisConn;
        } else {
            this.redisConn = redisCommonConn;
        }
        this.mainKey = mainKey;
    }

    async HMSET(inputData) {
        var data = lodash.mapValues(inputData, (val, key) => {
            if (lodash.isObject(val)) {
                return JSON.stringify(val);
            }
            return val;
        });
        return await this.redisConn.hmset(`${this.mainKey}`, data);
    }

    async HGET(field) {
        return await this.redisConn.hget(`${this.mainKey}`, field);
    }

    async HGETALL() {
        var data = await this.redisConn.hgetall(`${this.mainKey}`);
        if (data && true !== lodash.isEmpty(data)) {
            return lodash.mapValues(data, (val, key) => {
                if (JSON_KEYS.includes(key)) {
                    return JSON.parse(val);
                }
                if (val === 'true' || val === 'True') {
                    return true;
                }
                if (val === 'false' || val === 'False') {
                    return false;
                }
                if (val === 'null' || val === 'None' || val === 'Null' || val === 'none') {
                    return null;
                }
                return val;
            });
        }
        return null;
    }

    async EXISTS() {
        return Boolean(await this.redisConn.exists(this.mainKey));
    }
}

module.exports = {
    redisCommonConn: redisCommonConn,
    RedisSetsMaster: RedisSetsMaster,
    RedisStringMaster: RedisStringMaster,
    RedisSortedSetsMaster: RedisSortedSetsMaster,
    RedisSuffixKeySortedSets: RedisSuffixKeySortedSets,
    RedisHashesMaster: RedisHashesMaster,
    RedisSuffixKeySets: RedisSuffixKeySets,
};
