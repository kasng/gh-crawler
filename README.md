# SimpleGithubCrawler

This project is written by Node

## Install node modules
`npm install`

## Check app config at
`src/config.js`

## Create logs folder and make it writable
```
mkdir logs
chmod -R 0755 logs
```

## Run Locally Proxy Server
_The locally proxy server will be run on port 7999_

`node src/proxy-server.js`

## Start queue listener
`node src/run_queues.js`

## Init search repos job
`node src/init.js`
