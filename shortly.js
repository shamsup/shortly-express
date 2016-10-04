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
// Parse cookie header into an object
app.use(cookieParser());
app.use(express.static(__dirname + '/public'));


app.get('/', checkUser, function(req, res) {
  res.render('index');
});

app.get('/login', function(req, res) {
  res.render('login');
});

app.get('/signup', function(req, res) {
  res.render('signup');
});


app.get('/create', function(req, res) {
  res.render('index');
});

app.get('/links', function(req, res) {
  Links.reset().fetch().then(function(links) {
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
          console.log('Bcrypt error: ', err);
        }
        if (isSame) {
          console.log('password matched');
          // TODO: Create session
          new Session ({
            user_id: user.id
          }).save().then(function(session) {
            res.set({
              location: '/',
              'set-cookie': 'shortly_session=' + session.get('uuid_session_id')
            }).status(302).send();
          }).catch(function (err) {
            console.log('Error from session: ', err);
            res.status(500).send();
          });
        } else {
          console.log('Password didnt match');
          res.status(401).render('login');
        }
      });
    } else {
      console.log('User not found');
      res.status(401).render('login');
    }
  }).catch(function(err) {
    console.log('Error: ', err);
    res.status(500).send(err.message);
  });
});


app.post('/signup', function(req, res) {
  User.where('username', req.body.username).fetch()
  .then(function(user) {
    console.log('user: ', user);
    if (user) {
      // TODO: show an error in the template
      res.status(400).render('signup');
    } else {
      new User({
        username: req.body.username,
        password: req.body.password
      }).save()
      .then(function(u){
        console.log('user created: ', u);
        res.set('location', '/login').status(302).send();
      }).catch(function (err) {
        console.log('Error: ', err);
      });
    }
  }).catch((err) => {
    console.log('error: ', err);
    res.send(err.message);
  });
});


app.post('/links', function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
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
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

function checkUser(req, res, next) {
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
      res.status(401).render('login');
    }
  }).catch(function(err) {
    console.log('Session fetching error: ', err);
  });
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











