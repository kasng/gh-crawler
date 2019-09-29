const mongoose = require('mongoose');
const Schema = mongoose.Schema;
require('./repo');

/**
 * Github Contributor Schema
 */
const GithubContributorSchema = new Schema({
    id: Number,
    login: String,
    owner_repos: [
        {type: Schema.Types.ObjectId, ref: 'GithubRepo'}
    ],
    starred_repos: [
        {type: Schema.Types.ObjectId, ref: 'GithubRepo'}
    ],
    forked_repos: [
        {type: Schema.Types.ObjectId, ref: 'GithubRepo'}
    ],
    events_emails: [
        {
            email: String,
            name: String,
            _id: false
        }
    ]
}, {collection: 'github_contributors_v2', versionKey: false, strict: false});

GithubContributorSchema.statics.checkExistByLogin = async function (login) {
    let count = await this.count({
        login: login,
    }).exec();

    return count > 0;
};

GithubContributorSchema.statics.findByLogin = (login) => {
    return this.findOne({login: login});
};

module.exports = mongoose.model('GithubContributor', GithubContributorSchema);
