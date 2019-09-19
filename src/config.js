module.exports = {
    env: 'dev',
    logDir: __dirname + "/../logs",
    mongooseUri: 'mongodb://github_mongo:testing123456@127.0.0.1/github_crawler',
    // smtp: {
    //     host: "smtp.example.com",
    //     port: 587,
    //     secure: false, // upgrade later with STARTTLS
    //     auth: {
    //         user: "username",
    //         pass: "password"
    //     }
    // },
    senderEmail: 'kastestmail@gmail.com',
    adminEmail: 'kasngvn@gmail.com',
    // Github essential settings
    github: {
        api: {
            host: 'https://api.github.com',
            timeout: 15000, // 15s
            perPage: 100,
            minStars: 250,
            startStarsSearch: 15000 // Start search repo with 15k stars
        }
    },
    // Axios Request settings
    axios: {
        // Local proxy server
        proxy: {
            host: '127.0.0.1',
            port: 7999,
            keepAlive: true
        },
        userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        userAgents: [
            // Google bot
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Googlebot/2.1 (+http://www.google.com/bot.html)',
            'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 8_3 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Version/8.0 Mobile/12F70 Safari/600.1.4 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Googlebot/2.1 (+http://www.googlebot.com/bot.html)',
            'OnPageBot (compatible; Googlebot 2.1; +https://bot.onpage.org/)',
            'Mozilla/5.0 (compatible; Googlebot/2.1; http://www.google.com/bot.html)',
            'Mozilla/5.0 (compatible; Googlebot/2.1; startmebot/1.0; +https://start.me/bot)',
            // Facebook bot
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
            'facebookexternalhit/1.1',
            // Bing bot
            'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 7_0 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Version/7.0 Mobile/11A465 Safari/9537.53 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 7_0 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Version/7.0 Mobile/11A465 Safari/9537.53 (compatible; bingbot/2.0; http://www.bing.com/bingbot.htm)',
            // Twitterbot
            'Twitterbot/1.0',
            // Yandex Search Bot
            'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
            'Mozilla/5.0 (compatible; YandexBot/3.0; MirrorDetector; +http://yandex.com/bots)',
            // Android Browser
            'Mozilla/5.0 (Linux; U; Android 2.2) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1',
            'Mozilla/5.0 (Linux; U; Android 4.3; de-de; GT-I9300 Build/JSS15J) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
            'Dalvik/2.1.0 (Linux; U; Android 5.1.1; AFTT Build/LVY48F) CTV',
            'Mozilla/5.0 (Linux; U; Android 2.2.1; en-us; Nexus One Build/FRG83) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1',
            'Dalvik/2.1.0 (Linux; U; Android 7.1.2; AFTA Build/NS6264) CTV',
            'Mozilla/5.0 (Linux; U; Android 4.1.2; de-de; GT-I8190 Build/JZO54K) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
            'Mozilla/5.0 (Linux; U; Android 4.3; en-us; SM-N900T Build/JSS15J) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
        ]
    },
    // Redis server for store data
    redis: {
        host: '127.0.0.1',
        port: 6379
    },
    // Redis server for store queues
    redisQueue: {
        host: '127.0.0.1',
        port: 6679
    },
    // Queue config
    queue: {
        concurrency: 1,
        timeout: 15000, // 12s
    },
};
