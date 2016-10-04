var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var bcrypt = require('bcryptjs');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var Session = require('./app/models/session');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());

// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
// username=Phillip&password=Phillip
//req.body = { username: 'Phillip', password: 'Phillip' }
// Parse cookie header into an object
app.use(cookieParser());
app.use(express.static(__dirname + '/public'));


app.get('/', checkUser, function(req, res) {
  render(res, 'index', {user: req.user.username});
});

app.get('/login', function(req, res) {
  render(res, 'login');
});

app.get('/signup', function(req, res) {
  render(res, 'signup');
});


app.get('/create', checkUser, function(req, res) {
  render(res, 'index', {user: req.user.username});
});

app.get('/links', checkUser, function(req, res) {
  User.where('id', req.user.id).fetch({withRelated: ['links']}).then(function(user) {
    var links = user.related('links');
    res.status(200).send(links.models);
  });
});

app.post('/login', function(req, res) {
  console.log('username: ', req.body.username, ', password: ', req.body.password);
  User.where('username', req.body.username).fetch()
  .then(function(user) {
    if (user) {
      bcrypt.compare(req.body.password, user.get('password'), (err, isSame) => {
        if (err) {
          res.status(500);
          render(res, 'login', { err: 'There was a problem processing your request' });
        }
        if (isSame) {
          new Session ({
            user_id: user.id
          }).save().then(function(session) {
            res.set({
              location: '/',
              'set-cookie': 'shortly_session=' + session.get('uuid_session_id')
            }).status(302).send();
          }).catch(function (err) {
            // TODO: show an error in the template
            console.log('Error from session: ', err);
            res.status(500);
            render(res, 'login', { error: 'There was a problem processing your request' });
          });
        } else {
          // TODO: show an error in the template
          console.log('Password didnt match');
          res.status(401);
          render(res, 'login', {error: 'Invalid login credentials'});
        }
      });
    } else {
      // TODO: show an error in the template
      console.log('User not found');
      res.status(401);
      render(res, 'login', {
        error: 'Invalid login credentials'
      });
    }
  }).catch(function(err) {
    console.log('Error: ', err);
    res.status(500);
    render(res, 'login', {error: 'There was a problem processing your request'});
  });
});


app.post('/signup', function(req, res) {
  User.where('username', req.body.username).fetch()
  .then(function(user) {
    if (user) {
      // TODO: show an error in the template
      res.status(400);
      render(res, 'signup', { error: 'That username is unavailable' });
    } else {
      new User({
        username: req.body.username,
        password: req.body.password
      }).save()
      .then(function(user){
        new Session ({
          user_id: user.id
        }).save().then(function(session) {
          res.set({
            location: '/',
            'set-cookie': 'shortly_session=' + session.get('uuid_session_id')
          }).status(302).send();
        }).catch(function (err) {
          console.log('Error from session: ', err);
          res.status(500);
          render(res, 'login', { error: 'There was a problem processing your request' });
        });
      }).catch(function (err) {
        console.log('Error: ', err);
        res.status(500);
        render(res, 'signup', { error: 'There was a problem processing your request'})
      });
    }
  }).catch((err) => {
    console.log('error: ', err);
    res.status(500);
    render(res, 'signup', {error: 'There was a problem processing your request'});
  });
});

app.use('/logout', checkUser, function(req, res) {
  Session.where('uuid_session_id', req.cookies.shortly_session).destroy().then(function(session) {
      res.status(302).set('location', '/login').send();
  });
});


app.post('/links', checkUser, function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      User.where('id', req.user.id).fetch()
      .then(function(user) {
        return user.links().attach(found);
      }).then(function(user) {
        res.status(200).send(found.attributes);
      });
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          User.where('id', req.user.id).fetch()
          .then(function (user) {
            return user.links().attach(newLink);
          }).then(function(user) {
            res.status(200).send(newLink)
          });
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

function checkUser(req, res, next) {
  console.log(req.cookies);
  Session.where('uuid_session_id', req.cookies.shortly_session).fetch({withRelated: ['user']})
  .then(function (session) {
    if (session) {
      var user = session.related('user');
      req.user = {
        id: user.get('id'),
        username: user.get('username')
      };
      next();
    } else {
      res.redirect('/login');
    }
  }).catch(function(err) {
    console.log('Session fetching error: ', err);
  });
}

function render(res, template, args) {
  var defaults = {
    user: '',
    error: '',
  };
  args = args || {};
  args = Object.assign({}, defaults, args);
  res.render(template, args);
}



/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);











