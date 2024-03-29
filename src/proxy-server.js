const ProxyChain = require('./libs/proxy-chain/index');
const Config = require('./config');

const opts = {
    errorEventName: 'error',
    logDirectory: Config.logDir, // NOTE: folder must exist and be writable...
    fileNamePattern: 'Hosts-<DATE>.log',
    dateFormat: 'YYYY.MM.DD'
};

const log = require('simple-node-logger').createRollingFileLogger(opts);

const conn_opts = {
    errorEventName: 'info',
    logDirectory: Config.logDir, // NOTE: folder must exist and be writable...
    fileNamePattern: 'Connection-<DATE>.log',
    dateFormat: 'YYYY.MM.DD'
};
const conn_log = require('simple-node-logger').createRollingFileLogger(conn_opts);

const server = new ProxyChain.Server({
    // Port where the server will listen. By default 8000.
    port: Config.axios.proxy.port,

    // Enables verbose logging
    verbose: true,

    // Custom function to authenticate proxy requests and provide the URL to chained upstream proxy.
    // It must return an object (or promise resolving to the object) with the following form:
    // { requestAuthentication: Boolean, upstreamProxyUrl: String }
    // If the function is not defined or is null, the server runs in simple mode.
    // Note that the function takes a single argument with the following properties:
    // * request      - An instance of http.IncomingMessage class with information about the client request
    //                  (which is either HTTP CONNECT for SSL protocol, or other HTTP request)
    // * username     - Username parsed from the Proxy-Authorization header. Might be empty string.
    // * password     - Password parsed from the Proxy-Authorization header. Might be empty string.
    // * hostname     - Hostname of the target server
    // * port         - Port of the target server
    // * isHttp       - If true, this is a HTTP request, otherwise it's a HTTP CONNECT tunnel for SSL
    //                  or other protocols
    // * connectionId - Unique ID of the HTTP connection. It can be used to obtain traffic statistics.
    prepareRequestFunction: ({request, username, password, hostname, port, isHttp, connectionId}) => {
        log.info('HOST: ', request.url);
        return null;
        return {
            // Require clients to authenticate with username 'bob' and password 'TopSecret'
            requestAuthentication: username !== 'bob' || password !== 'TopSecret',

            // Sets up an upstream HTTP proxy to which all the requests are forwarded.
            // If null, the proxy works in direct mode, i.e. the connection is forwarded directly
            // to the target server.
            upstreamProxyUrl: `http://username:password@proxy.example.com:3128`,
        };
    },
});

server.listen(() => {
    console.log(`Proxy server is listening on port ${server.port}`);
});

// Emitted when HTTP connection is closed
server.on('connectionClosed', ({connectionId, stats}) => {
    conn_log.info(`Connection ${connectionId} closed`);
    conn_log.info(stats);
});

// Emitted when HTTP request fails
server.on('requestFailed', ({request, error}) => {
    conn_log.info(`Request ${request.url} failed`);
    conn_log.info(error);
});
