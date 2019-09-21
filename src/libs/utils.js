var _utils = require('apify-client/build/utils');
var lodash = require('lodash');
const mongoose = require('mongoose');
const Config = require('../config');

class Utils {
    /**
     * Get log log file
     * @param message
     * @param fileNamePrefix
     * @returns {boolean}
     */
    static logInfo(message, fileNamePrefix = 'Error') {
        (0, _utils.checkParamOrThrow)(fileNamePrefix, 'fileNamePrefix', 'String | Number');

        // const opts = {
        //     errorEventName: 'error',
        //     logDirectory: Config.logDir, // NOTE: folder must exist and be writable...
        //     fileNamePattern: `${fileNamePrefix}-<DATE>.log`,
        //     dateFormat: 'YYYY.MM.DD'
        // };
        // const log = require('simple-node-logger').createRollingFileLogger(opts);
        // log.info(message);
        // console.log(`${fileNamePrefix}: `, message);
        if (String(fileNamePrefix).includes('Error')) {
            console.error(message);
        }
        return true;
    }

    static async randomSleep() {
        return await new Promise((resolve, reject) => {
            setTimeout(resolve, lodash.random(1.5, 3.5) * 1000);
        });
    }

    /**
     * Random second
     * @returns {number}
     */
    static randomSecond() {
        return lodash.random(3, 6) * 1000;
    }

    /**
     * Connect mongo db
     * @returns {Promise<never>}
     */
    static async connectMongo() {
        /**
         * Connect mongodb
         */
        try {
            await mongoose.connect(Config.mongooseUri, {useNewUrlParser: true, useFindAndModify: false});
        } catch (e) {
            console.log('try catch connect');
            /**
             * @todo Retry task process
             */
            return process.exit(400);
        }
        mongoose.Promise = global.Promise;
        const db = mongoose.connection;
        db.on('error', function () {
            console.error.bind(console, 'MongoDB connection error:');
            /**
             * @todo Retry task process
             */
            // Kill this process
            return process.exit(400);
        });

        db.once('open', function () {
            // we're connected!
            console.log('Connected mongoDB');
        });
    }

    static findEmailsHelper(obj, list) {
        if (!obj) return list;
        if (obj instanceof Array) {
            for (let i in obj) {
                list = list.concat(Utils.findEmailsHelper(obj[i], []));
            }
            return list;
        }
        if (obj['email']) {
            let foundObj = {
                'email': obj['email'],
                'name': null
            };
            if (obj['name']) {
                foundObj.name = obj['name'];
            }
            list.push(foundObj);
        }

        if ((typeof obj == "object") && (obj !== null)) {
            let children = Object.keys(obj);
            if (children.length > 0) {
                for (let i = 0; i < children.length; i++) {
                    list = list.concat(Utils.findEmailsHelper(obj[children[i]], []));
                }
            }
        }
        return list;
    }

    static findEmails(obj) {
        return Utils.findEmailsHelper(obj, []);
    }
}

module.exports = {
    Utils: Utils
};
