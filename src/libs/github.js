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
const {RandomProxyRedis, ProxyRateLimitSets} = require('./redis/redis_proxy');
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
     * Add jobdata to request queue
     * @param jobData
     * @param priority
     * @returns {*}
     */
    static addRequestQueue(jobData, priority = 1) {
        return GithubRequestQueue.add(jobData, {
            delay: Utils.randomSecond(),
            priority: priority,
            timeout: Config.queue.timeout,
            attempts: 3,
            backoff: 5000
        });
    }

    /**
     * Handle Github return httpcode 403
     * @param res Axios response
     * @returns {null}
     */
    static async handleRateLimit(res) {
        console.log(`GITHUB STATUS ERROR: ${res.status}`);
        console.log(`GITHUB STATUS TEXT ERROR: ${res.statusText}`);
        try {
            console.log(`GITHUB PROXY ERROR: ${res.request.agent.proxy.href}`);
        } catch (e) {
        }
        if (Number(res.status) === 403 || Number(res.status) === 429) {
            // Github rate limit
            console.log('====== GITHUB LIMIT ======');
            // Github.beforeExit();
            // Log to Redis
            try {
                await ProxyRateLimitSets.ZINCRBY(res.request.agent.proxy.href, 1);
            } catch (e) {
                console.log(e);
            }
        }
        throw new Error('GITHUB RETRY REQUEST');
    }

    /**
     * Increase page for url
     * @param url
     * @returns {string|boolean}
     */
    static getNextPageUrl(url) {
        let jobUrl = new URL(url);
        let currentPage = jobUrl.searchParams.get('page');
        if (!currentPage) {
            currentPage = 1;
        }
        if (Number(currentPage) < 10) {
            let nextPage = Number(currentPage) + 1;
            jobUrl.searchParams.set('page', nextPage);
            return jobUrl.href;
        }
        return false;
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

        console.error(endpoint);
        return await (0, await Github.apiInstance()).get(encodeURI(endpoint));
    }

    /**
     * Process Search Repos job
     * @param jobData
     */
    static async processSearchRepos(jobData = {}) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        const res = await Github.searchRepos(jobData);
        //console.log(res);
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
            if ('items' in res.data && res.data.items && res.data.items.length > 0 && res.data.items.length < Config.github.api.perPage) {
                newRangeStars = true;
            }
            if (newRangeStars === true) {
                // New stars range
                jobData.maxStars = lodash.clone(jobData.minStars);
                if (jobData.maxStars <= 1000) {
                    jobData.minStars = Number(lodash.clone(jobData.minStars)) - 100; // step 100 stars
                } else if (jobData.maxStars > 1000 && jobData.maxStars <= 2500) {
                    jobData.minStars = Number(lodash.clone(jobData.minStars)) - 150; // step 150 stars
                } else if (jobData.maxStars > 2500 && jobData.minStars <= 5000) {
                    jobData.minStars = Number(lodash.clone(jobData.minStars)) - 250; // step 250 stars
                } else {
                    jobData.minStars = Number(lodash.clone(jobData.minStars)) - 500; // step 500 stars
                }
                jobData.page = 1;
                console.error(jobData);
                Utils.logInfo(JSON.stringify(jobData), 'New_Range_Stars');
                // Keep working with min stars is Config.github.api.minStars (= 250)
                if (jobData.minStars >= Config.github.api.minStars) {
                    Github.addRequestQueue(jobData, 1);
                } else {
                    console.error(`REACH minStars ${Config.github.api.minStars}`);
                    // Send email notifcation to admin email
                    await Github.sendEmailNotification('Github Crawler Reach minStars', '<p>Github Crawler Reach minStars</p>');
                }
            }
            // Save data to mongodb
            if ('items' in res.data && res.data.items && res.data.items.length > 0) {

                if (res.data.items.length === Config.github.api.perPage) {
                    if (jobData.page < 10) {
                        // Increase page
                        jobData.page = Number(jobData.page) + 1;
                        console.error(jobData);
                        Utils.logInfo(JSON.stringify(jobData), 'Search_Repos_Results_Next_Page');
                        // Add to queue
                        Github.addRequestQueue(jobData, 1);
                    }
                }

                const items = lodash.clone(res.data.items);
                for (let item of items) {
                    if ('owner' in item) {
                        /**
                         * @todo We could filter owner later, remove un-use field
                         */
                        let contributorDoc = await GithubContributorModel.findOneAndUpdate(
                            {
                                login: item.owner.login
                            },
                            item.owner,
                            {
                                new: true,
                                upsert: true
                            }
                        ).exec();
                        if (contributorDoc) {
                            // Save repo data
                            // the omit is considerably slower than pick method. we could improve later
                            let repoObject = lodash(item).omit(['owner']).value();
                            repoObject.owner_id = contributorDoc._id;
                            let repoDoc = await GithubRepoModel.findOneAndUpdate(
                                {name: repoObject.name},
                                repoObject,
                                {
                                    new: true,
                                    upsert: true
                                }).exec();
                            if (repoDoc) {
                                /**
                                 * @todo Add get repo langs queue
                                 */
                                if ('languages_url' in repoObject && repoObject.languages_url) {
                                    // Add to GithubRequestQueue
                                    const langsJobData = {
                                        repoObjectId: repoDoc._id,
                                        url: repoObject.languages_url,
                                        repoName: repoObject.name,
                                        repoFullName: repoObject.full_name,
                                        type: 'RepoLanguages'
                                    };
                                    Utils.logInfo(JSON.stringify(langsJobData), 'Languages_Job_Data');

                                    Github.addRequestQueue(langsJobData, 4);
                                }
                                /**
                                 * @todo Add get repo topics queue
                                 */
                                if ('full_name' in repoObject && repoObject.full_name) {
                                    const topicsJobData = {
                                        repoObjectId: repoDoc._id,
                                        url: `${Config.github.api.host}/repos/${repoObject.full_name}/topics?per_page=${Config.github.api.perPage}&page=1`,
                                        repoName: repoObject.name,
                                        repoFullName: repoObject.full_name,
                                        type: 'RepoTopics'
                                    };
                                    Utils.logInfo(JSON.stringify(topicsJobData), 'Topics_Job_Data');
                                    Github.addRequestQueue(topicsJobData, 4);
                                }

                                /**
                                 * @todo Add get repo contributors queue
                                 */
                                let contributorsUrl = `${Config.github.api.host}/repos/${repoObject.full_name}/contributors?per_page=${Config.github.api.perPage}&page=1`;
                                if ('contributors_url' in repoObject && repoObject.contributors_url) {
                                    contributorsUrl = `${repoObject.contributors_url}?per_page=${Config.github.api.perPage}&page=1`;
                                }
                                // Add to GithubRequestQueue
                                const contributorJobData = {
                                    repoObjectId: repoDoc._id,
                                    url: contributorsUrl,
                                    repoName: repoObject.name,
                                    repoFullName: repoObject.full_name,
                                    type: 'RepoContributors'
                                };

                                Utils.logInfo(JSON.stringify(contributorJobData), 'Contributor_Job_Data');
                                Github.addRequestQueue(contributorJobData, 3);
                            }
                        }
                    }
                }
            }
            return true;
        } else {
            return await Github.handleRateLimit(res);
        }
    }

    /**
     * Process Request repo contributors
     * @param jobData
     */
    static async processRepoContributors(jobData = {}) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            // Request API
            const res = await Github.get(jobData.url);
            //console.log(res);
            if (res.status < 300) {
                // Request OK
                Utils.logInfo(JSON.stringify(res.data), 'Contributors_Response');
                // Save data to mongodb
                // Check if API return empty array
                if (res.data && lodash.isArray(res.data) && res.data.length > 0) {
                    if (res.data.length === Config.github.api.perPage) {
                        // Can add next page to queue
                        const nextPageUrl = Github.getNextPageUrl(jobData.url);
                        if (nextPageUrl) {
                            // Add next page to GithubRequestQueue
                            const nextPageJob = {
                                repoObjectId: jobData.repoObjectId,
                                url: nextPageUrl,
                                repoName: jobData.repoName,
                                repoFullName: jobData.repoFullName,
                                type: 'RepoContributors'
                            };
                            Utils.logInfo(nextPageJob, 'Contributors_Next_Page');
                            Github.addRequestQueue(nextPageJob, 3);
                        }
                    }

                    // Save to mongodb
                    for (let item of res.data) {
                        // console.log(item);
                        Utils.logInfo(JSON.stringify(item), 'Contributor_Items');

                        let contributorDoc = await GithubContributorModel.findOneAndUpdate(
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
                            })
                            .exec();

                        if ('url' in item && item.url) {
                            // Add user api to request queue
                            const userJobData = {
                                contributorObjectId: contributorDoc._id,
                                url: item.url,
                                contributorLogin: item.login,
                                type: 'User'
                            };
                            Utils.logInfo(JSON.stringify(userJobData), 'User_Job_Data');
                            Github.addRequestQueue(userJobData, 5);
                            // Add user starred repos api to request queue
                            const starredReposJob = {
                                contributorObjectId: contributorDoc._id,
                                url: `${item.url}/starred?per_page=${Config.github.api.perPage}&page=1`,
                                contributorLogin: item.login,
                                type: 'UserStarred'
                            };
                            Utils.logInfo(JSON.stringify(starredReposJob), 'Starred_Job_Data');
                            Github.addRequestQueue(starredReposJob, 5);
                            // Add user repos api to request queue
                            const userReposJob = {
                                contributorObjectId: contributorDoc._id,
                                url: `${item.url}/repos?type=owner&sort=updated&per_page=${Config.github.api.perPage}&page=1`,
                                contributorLogin: item.login,
                                type: 'UserRepos'
                            };
                            Utils.logInfo(JSON.stringify(userReposJob), 'User_Repos_Job_Data');
                            Github.addRequestQueue(userReposJob, 5);
                            // Add user events api to queue
                            const userEventsJob = {
                                contributorObjectId: contributorDoc._id,
                                url: `${item.url}/events?per_page=${Config.github.api.perPage}&page=1`,
                                contributorLogin: item.login,
                                type: 'UserEvents'
                            };
                            Utils.logInfo(JSON.stringify(userEventsJob), 'User_Events_Job_Data');
                            Github.addRequestQueue(userEventsJob, 5);
                            // Add get user email from npm
                            const getNpmEmailJob = {
                                contributorObjectId: contributorDoc._id,
                                url: `https://registry.npmjs.org/-/user/org.couchdb.user:${item.login}`,
                                contributorLogin: item.login,
                                type: 'NpmEmail'
                            };
                            Utils.logInfo(JSON.stringify(getNpmEmailJob), 'Npm_Email_Job_Data');
                            Github.addRequestQueue(getNpmEmailJob, 5);
                        }

                        // Push this contributor to repo doc
                        await GithubRepoModel.updateOne(
                            {
                                _id: jobData.repoObjectId
                            },
                            {
                                $addToSet: {
                                    contributors: contributorDoc._id
                                }
                            }).exec();
                    }
                }
                return true;
            } else {
                return await Github.handleRateLimit(res);
            }
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Process Repo Languages API
     * @param jobData
     */
    static async processRepoLanguages(jobData = {}) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            const res = await Github.get(jobData.url);
            //console.log(res);
            if (res.status < 300) {
                // Request OK
                Utils.logInfo(JSON.stringify(res.data), 'Languages_Response');
                // Save data to mongodb
                if (res.data && lodash.isObject(res.data) && Object.keys(res.data).length > 0) {
                    await GithubRepoModel.updateOne(
                        {_id: jobData.repoObjectId},
                        {
                            'languages': res.data
                        }).exec();
                }
                return true;
            } else {
                return await Github.handleRateLimit(res);
            }
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Process Repo Topics job
     * @param jobData
     */
    static async processRepoTopics(jobData = {}) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            const res = await Github.get(jobData.url, {headers: {'Accept': 'application/vnd.github.mercy-preview+json'}});
            //console.log(res);
            // //console.log(res);
            if (res.status < 300) {
                // Request OK
                Utils.logInfo(JSON.stringify(res.data), 'Topics_Response');
                // Save data to mongodb
                if ('names' in res.data && lodash.isArray(res.data.names) && res.data.names.length > 0) {
                    await GithubRepoModel.updateOne(
                        {_id: jobData.repoObjectId},
                        {'topics': res.data.names}
                    ).exec();
                }
                return true;
            } else {
                return await Github.handleRateLimit(res);
            }
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Process user api
     * @param jobData
     */
    static async processUser(jobData) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            const res = await Github.get(jobData.url);
            //console.log(res);
            if (res.status < 300) {
                // Request OK
                Utils.logInfo(JSON.stringify(res.data), 'User_Response');
                // Save data to mongodb
                if (res.data && lodash.isObject(res.data) && Object.keys(res.data).length > 0) {
                    // Update to contributor collections
                    await GithubContributorModel.updateOne(
                        {_id: jobData.contributorObjectId},
                        res.data
                    ).exec();
                }
                return true;
            } else {
                return await Github.handleRateLimit(res);
            }
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Process user repos api
     * @param jobData
     */
    static async processUserRepos(jobData) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            const res = await Github.get(jobData.url);
            //console.log(res);
            if (res.status < 300) {
                // Request OK
                Utils.logInfo(JSON.stringify(res.data), 'User_Repos_Response');
                // Save data to mongodb
                if (res.data && lodash.isArray(res.data) && res.data.length > 0) {
                    const UserRepos = res.data;
                    if (UserRepos.length === Config.github.api.perPage) {
                        // Add next page
                        const nextPageUrl = Github.getNextPageUrl(jobData.url);
                        if (nextPageUrl) {
                            // Add nex page to GithubRequestQueue
                            const nextPageJob = {
                                contributorObjectId: jobData.contributorObjectId,
                                url: nextPageUrl,
                                contributorLogin: jobData.contributorLogin,
                                type: 'UserRepos'
                            };
                            Utils.logInfo(nextPageJob, 'User_Repos_Next_Page');
                            Github.addRequestQueue(nextPageJob, 5);
                        }
                    }
                    // Update to contributor collections
                    for (let userRepo of UserRepos) {
                        // Only save to mongodb, does not grab contributors
                        let repoDoc = await GithubRepoModel.findOneAndUpdate(
                            {name: userRepo.name},
                            userRepo,
                            {
                                new: true,
                                upsert: true
                            }
                        ).exec();

                        // console.log(repoDoc._id);
                        // Push to contributor doc
                        let pushData = {
                            owner_repos: repoDoc._id
                        };
                        // if this repo is fork
                        if ('fork' in userRepo && userRepo.fork === true) {
                            pushData = {
                                owner_repos: repoDoc._id,
                                forked_repos: repoDoc._id,
                            };
                        }
                        await GithubContributorModel.updateOne(
                            {
                                _id: jobData.contributorObjectId
                            },
                            {
                                $addToSet: pushData,
                            }
                        ).exec();
                    }
                }
                return true;
            } else {
                return await Github.handleRateLimit(res);
            }
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Process get starred repos api
     * @param jobData
     */
    static async processUserStarred(jobData) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            const res = await Github.get(jobData.url);
            //console.log(res);
            if (res.status < 300) {
                // Request OK
                Utils.logInfo(JSON.stringify(res.data), 'Starred_Repos_Response');
                // Save data to mongodb
                if (res.data && lodash.isArray(res.data) && res.data.length > 0) {
                    const UserRepos = res.data;
                    if (UserRepos.length === Config.github.api.perPage) {
                        // Add next page
                        const nextPageUrl = Github.getNextPageUrl(jobData.url);
                        if (nextPageUrl) {
                            // Add nex page to GithubRequestQueue
                            const nextPageJob = {
                                contributorObjectId: jobData.contributorObjectId,
                                url: nextPageUrl,
                                contributorLogin: jobData.contributorLogin,
                                type: 'UserStarred'
                            };
                            Utils.logInfo(nextPageJob, 'Starred_Repos_Next_Page');
                            Github.addRequestQueue(nextPageJob, 5);
                        }
                    }
                    // Update to contributor collections
                    for (let userRepo of UserRepos) {
                        // Only save to mongodb, does not grab contributors
                        let repoDoc = await GithubRepoModel.findOneAndUpdate(
                            {name: userRepo.name},
                            userRepo,
                            {
                                new: true,
                                upsert: true
                            }
                        ).exec();
                        // console.log(repoDoc._id);
                        // Push to contributor doc
                        await GithubContributorModel.updateOne(
                            {
                                _id: jobData.contributorObjectId
                            },
                            {
                                $addToSet: {
                                    starred_repos: repoDoc._id
                                }
                            }
                        ).exec();
                    }
                }
                return true;
            } else {
                return await Github.handleRateLimit(res);
            }
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Get user email from npm
     * @param jobData
     * @returns {boolean}
     */
    static async processNpmEmail(jobData) {
        if ('contributorLogin' in jobData && jobData.contributorLogin) {
            const userAgent = lodash.sample(Config.axios.userAgents);
            Utils.logInfo(userAgent, 'User_Agents');
            const proxyUrl = await RandomProxyRedis.pick();
            console.log(proxyUrl);
            if (proxyUrl) {
                let axiosInstance = axios.create({
                    timeout: Config.github.api.timeout,
                    headers: {
                        'User-Agent': userAgent
                    },
                    httpsAgent: new HttpsProxyAgent(proxyUrl)
                });

                const res = await axiosInstance.get(`https://registry.npmjs.org/-/user/org.couchdb.user:${jobData.contributorLogin}`);
                // //console.log(res);
                if (res.status < 300) {
                    // Request OK
                    if (res.data && lodash.isObject(res.data) && Object.keys(res.data)) {
                        // Check response contains email
                        if ('email' in res.data && res.data.email) {
                            // Save email to contributor doc
                            await GithubContributorModel.updateOne(
                                {_id: jobData.contributorObjectId},
                                {
                                    npm_email: res.data.email,
                                    npm_name: res.data.name,
                                }
                            ).exec();
                        }
                    }
                    return true;
                }
                return false;
            }
        }
        return false;
    }

    /**
     * Process get user events and find out email + name of user
     * @param jobData
     */
    static async processUserEvents(jobData) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');

        if ('url' in jobData && jobData.url) {
            const res = await Github.get(jobData.url);
            //console.log(res);
            if (res.status < 300) {
                // Request OK
                Utils.logInfo(JSON.stringify(res.data), 'User_Events_Response');
                // Save data to mongodb
                if (res.data && lodash.isArray(res.data) && res.data.length > 0) {
                    const UserEvents = res.data;
                    if (UserEvents.length === Config.github.api.perPage) {
                        // Add next page
                        const nextPageUrl = Github.getNextPageUrl(jobData.url);
                        if (nextPageUrl) {
                            // Add nex page to GithubRequestQueue
                            const nextPageJob = {
                                contributorObjectId: jobData.contributorObjectId,
                                url: nextPageUrl,
                                contributorLogin: jobData.contributorLogin,
                                type: 'UserStarred'
                            };
                            Utils.logInfo(nextPageJob, 'User_Events_Next_Page');
                            Github.addRequestQueue(nextPageJob, 5);
                        }
                    }
                    // Find email from response
                    let findEmails = Utils.findEmails(UserEvents);
                    console.log(findEmails);
                    Utils.logInfo(JSON.stringify(findEmails), 'Find_Emails');
                    let uniqEmails = lodash.uniqBy(findEmails, 'email');
                    Utils.logInfo(JSON.stringify(uniqEmails), 'Find_Emails');
                    console.log(uniqEmails);
                    // Add this email to contributors
                    await GithubContributorModel.updateOne(
                        {
                            _id: jobData.contributorObjectId
                        },
                        {
                            $addToSet: {
                                events_emails: uniqEmails
                            }
                        }
                    ).exec();
                }
                return true;
            } else {
                return await Github.handleRateLimit(res);
            }
        } else {
            throw new Error('Invalid Job Data');
        }
    }

    /**
     * Process queue job
     * @param jobData
     * @param job
     * @returns {Promise<boolean>}
     */
    static async processJob(jobData = {}, job) {
        (0, _utils.checkParamOrThrow)(jobData, 'jobData', 'Object');
        if ('type' in jobData) {
            console.log(jobData.type);
            let processFunc = `process${jobData.type}`;
            if (processFunc in Github && typeof Github[processFunc] === 'function') {
                // Delay process
                await new Promise((resolve, reject) => {
                    setTimeout(resolve, lodash.random(0.6, 1.1) * 1000);
                });
                // Call ${processFunc}
                try {
                    await (0, Github[processFunc])(jobData);
                } catch (e) {
                    if (String(e.message).includes('GITHUB RETRY REQUEST')) {
                        try {
                            await new Promise((resolve, reject) => {
                                setTimeout(resolve, lodash.random(0.6, 1.1) * 1000);
                            });
                            await job.retry();
                        } catch (e) {
                            throw e;
                        }
                    }
                }
                return true;
            }
        }
        throw new Error('Invalid job data');
    }
}


module.exports = {
    Github: Github
};
