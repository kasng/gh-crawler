const _utils = require('apify-client/build/utils');
const axios = require('axios');
const Config = require('./../config');
const HttpsProxyAgent = require("https-proxy-agent");
const {Utils} = require('./utils');
const lodash = require('lodash');
const {RedisHashesMaster} = require('./redis/redis_conn');
var GithubRepoModel = require('./models/repo');
var GithubContributorModel = require('./models/contributor');
const {GithubRequestQueue} = require('./redis/redis_queues');
const {URL} = require('url');
const {RandomProxyRedis} = require('./redis/redis_proxy');
const nodemailer = require('nodemailer');

class Github {
    constructor(options = {}) {
        (0, _utils.checkParamOrThrow)(options, 'options', 'Object');
        this.options = options;
    }

    /**
     * Process before exit
     * @returns {null}
     */
    static beforeExit() {
        /**
         * Do something before exit process
         */
        setTimeout(function () {
            process.exit(403);
        }, 3000);
        return null;
    }

    /**
     * Send email notification
     * @param subject
     * @param content
     * @returns {Promise<boolean>}
     */
    static async sendEmailNotification(subject, content) {
        if ('smtp' in Config) {
            let transporter = nodemailer.createTransport(Config.smtp);
            // verify connection configuration
            transporter.verify(function (error, success) {
                if (error) {
                    console.error(error);
                    throw error;
                } else {
                    // Send message
                    const mailOptions = {
                        from: Config.senderEmail,
                        to: Config.adminEmail,
                        subject: subject,
                        html: content
                    };

                    transporter.sendMail(mailOptions, function (err, info) {
                        if (err) {
                            console.error(err);
                            throw err;
                        } else {
                            return true;
                        }
                    });
                }
            });
        }
        return false;
    }

    /**
     * Handle Github return httpcode 403
     * @param res Axios response
     * @returns {null}
     */
    static handleRateLimit(res) {
        if (res.status === 403) {
            // Github rate limit
            console.error('====== GITHUB LIMIT ======');
            Github.beforeExit();
        }
        return null;
    }

    /**
     * Increase page for url
     * @param url
     * @returns {string}
     */
    static getNextPageUrl(url) {
        let jobUrl = new URL(url);
        let currentPage = jobUrl.searchParams.get('page');
        if (!currentPage) {
            currentPage = 1;
        }
        let nextPage = Number(currentPage) + 1;
        jobUrl.searchParams.set('page', nextPage);
        return jobUrl.href;
    }

    /**
     * Init search params
     * @returns {{perPage: number, maxStars: null, minStars: number, page: number}}
     */
    static initSearchParams() {
        return {
            maxStars: null,
            minStars: Config.github.api.startStarsSearch,
            page: 1,
            perPage: Config.github.api.perPage,
            type: 'SearchRepos'
        };
    }

    /**
     * Get search params from redis
     * @returns {Promise<*>}
     */
    static async getSearchParams() {
        let redis = new RedisHashesMaster('Github:SearchParams');
        let val = await redis.HGETALL();
        if (!val) {
            val = Github.initSearchParams();
            await redis.HMSET(val);
        }
        return val;
    }

    /**
     * Create Axios instance with basic proxy and user-agent configurations
     * @returns {Promise<AxiosInstance>}
     */
    static async apiInstance() {
        const userAgent = lodash.sample(Config.axios.userAgents);
        Utils.logInfo(userAgent, 'User_Agents');
        const proxyUrl = await RandomProxyRedis.pick();
        console.log(proxyUrl);
        return axios.create({
            baseURL: Config.github.api.host,
            timeout: Config.github.api.timeout,
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': userAgent
            },
            httpsAgent: new HttpsProxyAgent(proxyUrl)
        });
    }

    /**
     * Get data from github api
     * @param endpoint
     * @param config
     * @returns {Promise<AxiosResponse<T>>}
     */
    static get(endpoint, config = {}) {
        (0, _utils.checkParamOrThrow)(config, 'config', 'Object');
        endpoint = String(endpoint).replace(Config.github.api.host, '');
        return Github.apiInstance().then((instance) => {
            return instance.get(encodeURI(endpoint), config);
        });
    }

    /**
     * Post data to github api
     * @param endpoint
     * @param data
     * @param config
     * @returns {Promise<AxiosInstance | never>}
     */
    post(endpoint, data = {}, config = {}) {
        (0, _utils.checkParamOrThrow)(data, 'data', 'Object');
        (0, _utils.checkParamOrThrow)(config, 'config', 'Object');
        return Github.apiInstance().then((instance) => {
            return instance.post(endpoint, data, config);
        });
    }

    /**
     * Search Repos
     * @param searchParams
     * @returns {Promise<*>}
     */
    static async searchRepos(searchParams = {}) {
        console.log(searchParams);
        var endpoint = null;
        if (!searchParams.maxStars) {
            endpoint = `/search/repositories?q=stars:>${searchParams.minStars}&per_page=${searchParams.perPage}&page=${searchParams.page}`;
        }

        if (searchParams.maxStars && searchParams.minStars) {
            endpoint = `/search/repositories?q=stars:${searchParams.minStars}..${searchParams.maxStars}&per_page=${searchParams.perPage}&page=${searchParams.page}`;
        }

        console.log(endpoint);
        return Github.apiInstance().then((instance) => {
            return instance.get(encodeURI(endpoint));
        });
    }

    /**
     * Process Search Repos job
     * @param jobData
     * @param done
     */
    static processSearchRepos(jobData = {}, done) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        Github.searchRepos(jobData).then(res => {
            // Check res
            console.log(res);
            if (res.status < 300) {
                // Request OK
                // Create new queue
                let newRangeStars = false;
                if (!('items' in res.data)) {
                    newRangeStars = true;
                }
                if ('items' in res.data && res.data.items && res.data.items.length === 0) {
                    newRangeStars = true;
                }
                if (newRangeStars === true) {
                    // New stars range
                    jobData.maxStars = lodash.clone(jobData.minStars);
                    jobData.minStars = Number(lodash.clone(jobData.minStars)) - 500; // step 500 stars
                    jobData.page = 1;
                    console.error(jobData);
                    Utils.logInfo(JSON.stringify(jobData), 'New_Range_Stars');
                    // Keep working with min stars is Config.github.api.minStars (= 250)
                    if (jobData.minStars >= Config.github.api.minStars) {
                        GithubRequestQueue.add(jobData, {
                            delay: Utils.randomSecond(),
                            priority: 1,
                            timeout: Config.queue.timeout
                        });
                    } else {
                        console.error(`REACH ${Config.github.api.minStars}`);
                        // Send email notifcation to admin email
                        Github.sendEmailNotification('Github Crawler Reach minStars', '<p>Github Crawler Reach minStars</p>').then(() => {
                            done();
                        }).catch(err => {
                            console.error(err);
                            done();
                        });
                    }
                }
                // Save data to mongodb
                if ('items' in res.data && res.data.items && res.data.items.length > 0) {

                    if (res.data.items.length === Config.github.api.perPage) {
                        // Increase page
                        jobData.page = Number(jobData.page) + 1;
                        console.error(jobData);
                        Utils.logInfo(JSON.stringify(jobData), 'Search_Repos_Results_Next_Page');
                        // Add to queue
                        GithubRequestQueue.add(jobData, {
                            delay: Utils.randomSecond(),
                            priority: 1,
                            timeout: Config.queue.timeout
                        });
                    }

                    const items = lodash.clone(res.data.items);
                    for (let item of items) {
                        if ('owner' in item) {
                            /**
                             * @todo We could filter owner later, remove un-use field
                             */
                            GithubContributorModel.findOneAndUpdate({
                                login: item.owner.login
                            }, item.owner, {
                                new: true,
                                upsert: true
                            }, (err, doc) => {
                                if (err) {
                                    throw err;
                                }
                                // Save repo data
                                // the omit is considerably slower than pick method. we could improve later
                                var repoObject = lodash(item).omit(['owner']).value();
                                repoObject.owner_id = doc._id;
                                /**
                                 * @todo filter repo owner data, remove un-use field
                                 */
                                GithubRepoModel.findOneAndUpdate({name: repoObject.name}, repoObject, {
                                    new: true,
                                    upsert: true
                                }, (err, doc) => {
                                    if (err) {
                                        throw err;
                                    }
                                    /**
                                     * @todo Add get repo langs queue
                                     */
                                    if ('languages_url' in repoObject && repoObject.languages_url) {
                                        // Add to GithubRequestQueue
                                        const langsJobData = {
                                            repoObjectId: doc._id,
                                            url: repoObject.languages_url,
                                            repoName: repoObject.name,
                                            repoFullName: repoObject.full_name,
                                            type: 'RepoLanguages'
                                        };
                                        Utils.logInfo(JSON.stringify(langsJobData), 'Languages_Job_Data');
                                        GithubRequestQueue.add(langsJobData, {
                                            delay: Utils.randomSecond(),
                                            priority: 4,
                                            timeout: Config.queue.timeout
                                        });
                                    }
                                    /**
                                     * @todo Add get repo topics queue
                                     */
                                    if ('full_name' in repoObject && repoObject.full_name) {
                                        const topicsJobData = {
                                            repoObjectId: doc._id,
                                            url: `${Config.github.api.host}/repos/${repoObject.full_name}/topics?per_page=${Config.github.api.perPage}&page=1`,
                                            repoName: repoObject.name,
                                            repoFullName: repoObject.full_name,
                                            type: 'RepoTopics'
                                        };
                                        Utils.logInfo(JSON.stringify(topicsJobData), 'Topics_Job_Data');
                                        GithubRequestQueue.add(topicsJobData, {
                                            delay: Utils.randomSecond(),
                                            priority: 4,
                                            timeout: Config.queue.timeout
                                        });
                                    }

                                    /**
                                     * @todo Add get repo contributor queue
                                     */
                                    let contributorsUrl = `${Config.github.api.host}/repos/${repoObject.full_name}/contributors?per_page=${Config.github.api.perPage}&page=1`;
                                    if ('contributors_url' in repoObject && repoObject.contributors_url) {
                                        contributorsUrl = `${repoObject.contributors_url}?per_page=${Config.github.api.perPage}&page=1`;
                                    }
                                    // Add to GithubRequestQueue
                                    const contributorJobData = {
                                        repoObjectId: doc._id,
                                        url: contributorsUrl,
                                        repoName: repoObject.name,
                                        repoFullName: repoObject.full_name,
                                        type: 'RepoContributors'
                                    };

                                    Utils.logInfo(JSON.stringify(contributorJobData), 'Contributor_Job_Data');
                                    GithubRequestQueue.add(contributorJobData, {
                                        delay: Utils.randomSecond(),
                                        priority: 3,
                                        timeout: Config.queue.timeout
                                    });
                                });
                            });
                        }
                    }
                }
                done();
            } else {
                done();
                Github.handleRateLimit(res);
            }
        }).catch(err => {
            // Log
            console.log(err);
            if (err) {
                throw err;
            }
        });
    }

    /**
     * Process Request repo contributors
     * @param jobData
     * @param done
     */
    static processRepoContributors(jobData = {}, done) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            // Request API
            Github.get(jobData.url).then((res) => {
                console.log(res);
                if (res.status < 300) {
                    // Request OK
                    Utils.logInfo(JSON.stringify(res.data), 'Contributors_Response');
                    // Save data to mongodb
                    console.log(res.data);
                    // Check if API return empty array
                    if (res.data && lodash.isArray(res.data) && res.data.length > 0) {
                        if (res.data.length === Config.github.api.perPage) {
                            // Can add next page to queue
                            const nextPageUrl = Github.getNextPageUrl(jobData.url);
                            // Add next page to GithubRequestQueue
                            const nextPageJob = {
                                repoObjectId: jobData.repoObjectId,
                                url: nextPageUrl,
                                repoName: jobData.repoName,
                                repoFullName: jobData.repoFullName,
                                type: 'RepoContributors'
                            };
                            Utils.logInfo(nextPageJob, 'Contributors_Next_Page');
                            GithubRequestQueue.add(nextPageJob, {
                                delay: Utils.randomSecond(),
                                priority: 3,
                                timeout: Config.queue.timeout
                            });
                        }

                        // Save to mongodb
                        for (let item of res.data) {
                            // console.log(item);
                            Utils.logInfo(JSON.stringify(item), 'Contributor_Items');

                            GithubContributorModel.findOneAndUpdate(
                                // condition
                                {
                                    login: item.login
                                },
                                // data
                                item,
                                // options
                                {
                                    new: true,
                                    upsert: true
                                },
                                (err, doc) => {
                                    if (err) {
                                        throw err;
                                    }
                                    // console.log(doc);
                                    if ('url' in item && item.url) {
                                        // Add user api to request queue
                                        const userJobData = {
                                            contributorObjectId: doc._id,
                                            url: item.url,
                                            contributorLogin: item.login,
                                            type: 'User'
                                        };
                                        Utils.logInfo(JSON.stringify(userJobData), 'User_Job_Data');
                                        GithubRequestQueue.add(userJobData, {
                                            delay: Utils.randomSecond(),
                                            priority: 5,
                                            timeout: Config.queue.timeout
                                        });
                                        // Add user starred repos api to request queue
                                        const starredReposJob = {
                                            contributorObjectId: doc._id,
                                            url: `${item.url}/starred?per_page=${Config.github.api.perPage}&page=1`,
                                            contributorLogin: item.login,
                                            type: 'UserStarred'
                                        };
                                        Utils.logInfo(JSON.stringify(starredReposJob), 'Starred_Job_Data');
                                        GithubRequestQueue.add(starredReposJob, {
                                            delay: Utils.randomSecond(),
                                            priority: 5,
                                            timeout: Config.queue.timeout
                                        });
                                        // Add user repos api to request queue
                                        const userReposJob = {
                                            contributorObjectId: doc._id,
                                            url: `${item.url}/repos?type=owner&sort=updated&per_page=${Config.github.api.perPage}&page=1`,
                                            contributorLogin: item.login,
                                            type: 'UserRepos'
                                        };
                                        Utils.logInfo(JSON.stringify(userReposJob), 'User_Repos_Job_Data');
                                        GithubRequestQueue.add(userReposJob, {
                                            delay: Utils.randomSecond(),
                                            priority: 5,
                                            timeout: Config.queue.timeout
                                        });
                                        // Add user events api to queue
                                        const userEventsJob = {
                                            contributorObjectId: doc._id,
                                            url: `${item.url}/events?per_page=${Config.github.api.perPage}&page=1`,
                                            contributorLogin: item.login,
                                            type: 'UserEvents'
                                        };
                                        Utils.logInfo(JSON.stringify(userEventsJob), 'User_Events_Job_Data');
                                        GithubRequestQueue.add(userEventsJob, {
                                            delay: Utils.randomSecond(),
                                            priority: 5,
                                            timeout: Config.queue.timeout
                                        });
                                        // Add get user email from npm
                                        const getNpmEmailJob = {
                                            contributorObjectId: doc._id,
                                            url: `https://registry.npmjs.org/-/user/org.couchdb.user:${item.login}`,
                                            contributorLogin: item.login,
                                            type: 'NpmEmail'
                                        };
                                        Utils.logInfo(JSON.stringify(getNpmEmailJob), 'Npm_Email_Job_Data');
                                        GithubRequestQueue.add(getNpmEmailJob, {
                                            delay: Utils.randomSecond(),
                                            priority: 5,
                                            timeout: Config.queue.timeout
                                        });
                                    }

                                    // Push this contributor to repo doc
                                    GithubRepoModel.updateOne(
                                        {
                                            _id: jobData.repoObjectId
                                        },
                                        {
                                            $addToSet: {
                                                contributors: doc._id
                                            }
                                        }, function (err, doc) {
                                            if (err) {
                                                throw err;
                                            }
                                        });
                                }
                            );
                        }

                        done();
                    } else {
                        done();
                    }
                } else {
                    done();
                    Github.handleRateLimit(res);
                }
            }).catch(err => {
                throw err;
            });
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Process Repo Languages API
     * @param jobData
     * @param done
     */
    static processRepoLanguages(jobData = {}, done) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            Github.get(jobData.url).then((res) => {
                console.log(res);
                if (res.status < 300) {
                    // Request OK
                    Utils.logInfo(JSON.stringify(res.data), 'Languages_Response');
                    // Save data to mongodb
                    if (res.data && lodash.isObject(res.data) && Object.keys(res.data).length > 0) {
                        GithubRepoModel.updateOne(
                            {_id: jobData.repoObjectId},
                            {
                                'languages': res.data
                            },
                            function (err, doc) {
                                if (err) {
                                    throw err;
                                }
                            });
                    } else {
                        done();
                    }
                } else {
                    done();
                    Github.handleRateLimit(res);
                }
            }).catch(err => {
                console.log(err);
                if (err) {
                    throw err;
                }
            });
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Process Repo Topics job
     * @param jobData
     * @param done
     */
    static processRepoTopics(jobData = {}, done) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            Github.get(jobData.url, {
                headers: {
                    'Accept': 'application/vnd.github.mercy-preview+json'
                }
            }).then((res) => {
                console.log(res);
                if (res.status < 300) {
                    // Request OK
                    Utils.logInfo(JSON.stringify(res.data), 'Topics_Response');
                    // Save data to mongodb
                    if ('names' in res.data && lodash.isArray(res.data.names) && res.data.names.length > 0) {
                        GithubRepoModel.updateOne(
                            {_id: jobData.repoObjectId},
                            {
                                'topics': res.data.names
                            },
                            function (err, doc) {
                                if (err) {
                                    throw err;
                                }
                                console.log(doc);
                            });
                    } else {
                        done();
                    }
                } else {
                    done();
                    Github.handleRateLimit(res);
                }
            }).catch(err => {
                console.log(err);
                if (err) {
                    throw err;
                }
            });
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Process user api
     * @param jobData
     * @param done
     */
    static processUser(jobData, done) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            Github.get(jobData.url).then((res) => {
                console.log(res);
                if (res.status < 300) {
                    // Request OK
                    Utils.logInfo(JSON.stringify(res.data), 'User_Response');
                    // Save data to mongodb
                    if (res.data && lodash.isObject(res.data) && Object.keys(res.data).length > 0) {
                        // Update to contributor collections
                        GithubContributorModel.updateOne(
                            {_id: jobData.contributorObjectId},
                            res.data,
                            function (err, doc) {
                                if (err) {
                                    throw err;
                                }
                            });
                    } else {
                        done();
                    }
                } else {
                    done();
                    Github.handleRateLimit(res);
                }
            }).catch(err => {
                console.log(err);
                if (err) {
                    throw err;
                }
            });
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Process user repos api
     * @param jobData
     * @param done
     */
    static processUserRepos(jobData, done) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            Github.get(jobData.url).then((res) => {
                console.log(res);
                if (res.status < 300) {
                    // Request OK
                    Utils.logInfo(JSON.stringify(res.data), 'User_Repos_Response');
                    // Save data to mongodb
                    if (res.data && lodash.isArray(res.data) && res.data.length > 0) {
                        const UserRepos = res.data;
                        if (UserRepos.length === Config.github.api.perPage) {
                            // Add next page
                            const nextPageUrl = Github.getNextPageUrl(jobData.url);
                            // Add nex page to GithubRequestQueue
                            const nextPageJob = {
                                contributorObjectId: jobData.contributorObjectId,
                                url: nextPageUrl,
                                contributorLogin: jobData.contributorLogin,
                                type: 'UserRepos'
                            };
                            Utils.logInfo(nextPageJob, 'User_Repos_Next_Page');
                            GithubRequestQueue.add(nextPageJob, {
                                delay: Utils.randomSecond(),
                                priority: 5,
                                timeout: Config.queue.timeout
                            });
                        }
                        // Update to contributor collections
                        for (let userRepo of UserRepos) {
                            // Only save to mongodb, does not grab contributors
                            GithubRepoModel.findOneAndUpdate({name: userRepo.name}, userRepo, {
                                new: true,
                                upsert: true
                            }, (err, doc) => {
                                if (err) {
                                    throw err;
                                }
                                console.log(doc._id);
                                // Push to contributor doc
                                let pushData = {
                                    owner_repos: doc._id
                                };
                                // if this repo is fork
                                if ('fork' in userRepo && userRepo.fork === true) {
                                    pushData = {
                                        owner_repos: doc._id,
                                        forked_repos: doc._id,
                                    };
                                }
                                GithubContributorModel.updateOne(
                                    {
                                        _id: jobData.contributorObjectId
                                    },
                                    {
                                        $addToSet: pushData,
                                    }, function (err, doc) {
                                        if (err) {
                                            throw err;
                                        }
                                    });
                            });
                        }
                    } else {
                        done();
                    }
                } else {
                    done();
                    Github.handleRateLimit(res);
                }
            }).catch(err => {
                console.log(err);
                if (err) {
                    throw err;
                }
            });
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Process get starred repos api
     * @param jobData
     * @param done
     */
    static processUserStarredRepos(jobData, done) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            Github.get(jobData.url).then((res) => {
                console.log(res);
                if (res.status < 300) {
                    // Request OK
                    Utils.logInfo(JSON.stringify(res.data), 'Starred_Repos_Response');
                    // Save data to mongodb
                    if (res.data && lodash.isArray(res.data) && res.data.length > 0) {
                        const UserRepos = res.data;
                        if (UserRepos.length === Config.github.api.perPage) {
                            // Add next page
                            const nextPageUrl = Github.getNextPageUrl(jobData.url);
                            // Add nex page to GithubRequestQueue
                            const nextPageJob = {
                                contributorObjectId: jobData.contributorObjectId,
                                url: nextPageUrl,
                                contributorLogin: jobData.contributorLogin,
                                type: 'UserStarred'
                            };
                            Utils.logInfo(nextPageJob, 'Starred_Repos_Next_Page');
                            GithubRequestQueue.add(nextPageJob, {
                                delay: Utils.randomSecond(),
                                priority: 5,
                                timeout: Config.queue.timeout
                            });
                        }
                        // Update to contributor collections
                        for (let userRepo of UserRepos) {
                            // Only save to mongodb, does not grab contributors
                            GithubRepoModel.findOneAndUpdate({name: userRepo.name}, userRepo, {
                                new: true,
                                upsert: true
                            }, (err, doc) => {
                                if (err) {
                                    throw err;
                                }
                                console.log(doc._id);
                                // Push to contributor doc
                                GithubContributorModel.updateOne(
                                    {
                                        _id: jobData.contributorObjectId
                                    },
                                    {
                                        $addToSet: {
                                            starred_repos: doc._id
                                        }
                                    }, function (err, doc) {
                                        if (err) {
                                            throw err;
                                        }
                                    });
                            });
                        }
                    } else {
                        done();
                    }
                } else {
                    done();
                    Github.handleRateLimit(res);
                }
            }).catch(err => {
                console.log(err);
                if (err) {
                    throw err;
                }
            });
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Get user email from npm
     * @param jobData
     * @param done
     * @returns {boolean}
     */
    static getUserEmailFromNpm(jobData, done) {
        if ('contributorLogin' in jobData && jobData.contributorLogin) {
            const userAgent = lodash.sample(Config.axios.userAgents);
            Utils.logInfo(userAgent, 'User_Agents');
            RandomProxyRedis.pick().then((proxyUrl) => {
                console.log(proxyUrl);
                let axiosInstance = axios.create({
                    timeout: Config.github.api.timeout,
                    headers: {
                        'User-Agent': userAgent
                    },
                    httpsAgent: new HttpsProxyAgent(proxyUrl)
                });

                axiosInstance.get(`https://registry.npmjs.org/-/user/org.couchdb.user:${jobData.contributorLogin}`)
                    .then(res => {
                        console.log(res);
                        if (res.status < 300) {
                            // Request OK
                            if (res.data && lodash.isObject(res.data) && Object.keys(res.data)) {
                                // Check response contains email
                                if ('email' in res.data && res.data.email) {
                                    // Save email to contributor doc
                                    GithubContributorModel.updateOne(
                                        {_id: jobData.contributorObjectId},
                                        {
                                            npm_email: res.data.email,
                                            npm_name: res.data.name,
                                        },
                                        function (err, doc) {
                                            if (err) {
                                                throw err;
                                            }
                                            done();
                                        });
                                } else {
                                    done();
                                }
                            } else {
                                done();
                            }
                        } else {
                            done();
                        }
                    })
                    .catch(err => {
                        throw err;
                    });
            }).catch(err => {
                throw err;
            });
        } else {
            done();
        }
        return false;
    }

    /**
     * Process get user events and find out email + name of user
     * @param jobData
     * @param done
     */
    static processUserEvents(jobData, done) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            Github.get(jobData.url).then((res) => {
                console.log(res);
                if (res.status < 300) {
                    // Request OK
                    Utils.logInfo(JSON.stringify(res.data), 'User_Events_Response');
                    // Save data to mongodb
                    if (res.data && lodash.isArray(res.data) && res.data.length > 0) {
                        const UserEvents = res.data;
                        if (UserEvents.length === Config.github.api.perPage) {
                            // Add next page
                            const nextPageUrl = Github.getNextPageUrl(jobData.url);
                            // Add nex page to GithubRequestQueue
                            const nextPageJob = {
                                contributorObjectId: jobData.contributorObjectId,
                                url: nextPageUrl,
                                contributorLogin: jobData.contributorLogin,
                                type: 'UserStarred'
                            };
                            Utils.logInfo(nextPageJob, 'User_Events_Next_Page');
                            GithubRequestQueue.add(nextPageJob, {
                                delay: Utils.randomSecond(),
                                priority: 5,
                                timeout: Config.queue.timeout
                            });
                        }
                        // Find email from response
                        let findEmails = Utils.findEmails(UserEvents);
                        Utils.logInfo(JSON.stringify(findEmails), 'Find_Emails');
                        let uniqEmails = lodash.uniqBy(findEmails, 'email');
                        Utils.logInfo(JSON.stringify(uniqEmails), 'Find_Emails');
                        // Add this email to contributors
                        GithubContributorModel.updateOne(
                            {
                                _id: jobData.contributorObjectId
                            },
                            {
                                $addToSet: {
                                    events_emails: uniqEmails
                                }
                            }, function (err, doc) {
                                if (err) {
                                    throw err;
                                }
                            });
                        done();
                    } else {
                        done();
                    }
                } else {
                    done();
                    Github.handleRateLimit(res);
                }
            }).catch(err => {
                console.log(err);
                if (err) {
                    throw err;
                }
            });
        } else {
            throw new Error('Invalid Job Data');
        }
    }
}


module.exports = {
    Github: Github
};
