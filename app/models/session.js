var db = require('../config');
var uuid = require('uuid');
var Promise = require('bluebird');
var User = require('./user');


var Session = db.Model.extend({
  tableName: 'sessions',
  user: function() {
    return this.belongsTo(User, 'user_id');
  },
  initialize: function(attributes) {
    this.on('creating', function(model, attrs, options){
      model.set('uuid_session_id', uuid.v4());
    });
  }
});

module.exports = Session;
