const mongoose = require('mongoose');
const Schema = mongoose.Schema;
require('./contributor');

/**
 * Github Repo Schema
 */
const GithubRepoSchema = new Schema({
    id: Number,
    name: String,
    full_name: String,
    created_time: {type: Date, default: Date.now},
    owner_id: {type: Schema.Types.ObjectId, ref: 'GithubContributor'},
    contributors: [
        {type: Schema.Types.ObjectId, ref: 'GithubContributor'}
    ],
}, {collection: 'github_repos_v2', versionKey: false, strict: false});

GithubRepoSchema.statics.checkExistByName = async function (name) {
    let count = await this.count({
        name: name,
    }).exec();

    return count > 0;
};

module.exports = mongoose.model('GithubRepo', GithubRepoSchema);
