'use strict';
/* --------------------------------
Before your run this example
1. Register twitter application
2. Update config.json with authentication credentials
3. Run `npm install`
4. Run demo with: `node server-with-cookie.js`
---------------------------------- */
const
	Hapi = require('hapi'),
	Boom = require('boom'),
	Hoek = require('hoek'),
	Glue = require('glue'),
	config = require('./config.json'),
	//todo: figure out when this becomes accessible for registered plugins as server.settings.app
	server = new Hapi.Server({ app: { config: config }})

let uuid = 1       // Use seq instead of proper unique identifiers for demo only

// twitter successful authentication handler method, we will use to override default one
function handleTwitterLogin(request, reply) {
	//Store the third party credentials in the session as an example. You could do something
	//more useful here - like loading or setting up an account (social signup).
	const sid = String(++uuid)
	request.server.app.cache.set(sid, request.auth.credentials.profile, 0, (err) => {
		if (err) return reply(err)
		request.cookieAuth.set({sid: sid})
		//return reply('<pre>' + JSON.stringify(request.auth.credentials, null, 4) + '</pre>')
		return reply.redirect('/')
	})
}

// server manifest for glue
const manifest = {
	connections: [{
		port: config.port || process.env.PORT || 3000,
		host: config.host || process.env.HOST || 'localhost'
	}],
	registrations: [
		{
			plugin: 'bell', options: {}
		},{
			plugin: 'hapi-auth-cookie', options: {}
		},{
			plugin: '../lib/login-plugin.js',
			options: {
				routes: { prefix: '/user' }
			}
		}
	]
}

const options = {
	relativeTo: __dirname,
	preRegister: function (server, callback) {
		// override default authentication handler
		config.auth.twitter.handler = handleTwitterLogin
		// make config available for the plugin using 'preRegister' hook
		// todo: might not be the best way to expose config to app but unlike other suggested methods this one just works
		server.app.config = config
		callback()
	}
}

// register and configure User Router Plugin
Glue.compose(manifest, options, (err, server) => {

	Hoek.assert(!err, err)

	// set cache policy
	const cache = server.cache({
		segment: 'sessions',
		expiresIn: 3 * 24 * 60 * 60 * 1000
	})
	// expose cache in a runtime app state
	server.app.cache = cache

	// Setup the session strategy
	server.auth.strategy('session', 'cookie', true, {
		cookie: config.auth.session.cookie,
		password: config.auth.session.password,
		redirectTo: '/user/login/twitter', // redirect url if there is no session
		isSecure: config.auth.session.isSecure,
		validateFunc: function (request, session, callback) {
			cache.get(session.sid, (err, cached) => {
				if (err)  return callback(err, false)
				if (!cached) return callback(null, false)
				return callback(null, true, cached.account)
			})
		}
	})

	server.route({
		method: 'GET',
		path: '/',
		config: {
			auth: 'session', //<-- require authentication session for this
			handler: function (request, reply) {
				let sessionId = request.auth.credentials.sid
				cache.get(sessionId, (err, value, cached, log) => {
					if (err) reply(Boom(err))
					let profile = value
					//Return a message using the information from the session
					return reply('<pre>' + JSON.stringify(profile, null, 4) + '</pre>')
				})
			}
		}
	})

	// Start the server
	server.start((err) => {
		if (err) throw err
		console.log('Server running at:', server.info.uri)
	})
})
