var db = require('../config');
var bcrypt = require('bcryptjs');
var Promise = require('bluebird');
var Link = require('./link');


var User = db.Model.extend({
  tableName: 'users',
  links: function() {
    return this.belongsToMany(Link, 'users_urls', 'user_id', 'url_id');
  },
  initialize: function(attributes) { // { username: ..., password: ...}
    this.on('creating', this.hashPassword, this);
  },
  hashPassword: function(model, attrs, options) {
    console.log('Hashing: ', model.attributes.password);
    return new Promise((resolve, reject) => {
      bcrypt.hash(model.attributes.password, 10, function(err, hash) {
        if (err) {
          return reject(err);
        }
        model.set('password', hash);
        resolve(hash);
      });
    });
  }
});

module.exports = User;
