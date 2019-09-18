const current_path = require('path');
const {RandomProxyRedis} = require('./libs/redis/redis_proxy');
var _bluebird = require('bluebird');
const Config = require('./config');

const LOCALLY_PROXY = `http://${Config.axios.proxy.host}:${Config.axios.proxy.port}`;

async function processFile(inputFile) {
    var ip_json = [];
    var fs = require('fs'),
        readline = require('readline'),
        instream = fs.createReadStream(current_path.resolve(__dirname, `./${inputFile}`)),
        outstream = new (require('stream'))(),
        rl = readline.createInterface(instream, outstream);

    rl.on('line', function (line) {
        let line_parse = String(line).split(':');
        // console.log(line_parse);
        if (line_parse && line_parse.length > 3) {
            ip_json.push(`http://${line_parse[2]}:${line_parse[3]}@${line_parse[0]}:${line_parse[1]}`)
        }
    });

    rl.on('close', () => {
        console.log(ip_json);
        // Add to RandomProxyRedis
        _bluebird.resolve(saveToRedis(ip_json)).then(() => {
            console.log('save to redis done.');
        });
    });
}

const saveToRedis = async (ip_list) => {
    for (let ipListElement of ip_list) {
        await RandomProxyRedis.ZADD(ipListElement, 0);
    }
};

(async () => {
    // Comment if do not use local proxy
    await RandomProxyRedis.ZADD(LOCALLY_PROXY, 0);
    await processFile('proxies.txt');
    console.log('------- DONE ---------');
})();
