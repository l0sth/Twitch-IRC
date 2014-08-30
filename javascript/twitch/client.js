var messageStream = require('irc-message-stream');
var createSocket = require('./socket');
var events = require('events');
var util = require('util');
var servers = require('./servers');
var data = require('./data');
var s = require('string');

var client = function client(options) {
	var self = this;
	
    events.EventEmitter.call(this);
    
    this.logger = require('./logger')(options); 

    this.options = options;
    this.stream = messageStream();
    this.socket = null;

    this.stream.on('data', this._handleMessage.bind(this));
    
    process.on('uncaughtException', function (err) {
    	self.logger.crash(err.stack);
    	self.emit('crash', err.message, err.stack);
	});
};

// Inherit client from EventEmitter.
util.inherits(client, events.EventEmitter);

/**
 * Handle all IRC Messages, including jtv and TwitchNotify.
 * 
 * @param message
 */
client.prototype._handleMessage = function _handleMessage(message) {
	var self = this;
    
    // Logging RAW messages.
    if (message.command.match(/^[0-9]+$/g)) { self.logger.raw('%s: %s', message.command, message.params[1]); }
    
    var messageFrom = message.prefix;
    if (message.prefix.indexOf('@') >= 0) { messageFrom = message.parseHostmaskFromPrefix().nickname; }
    
    switch(message.command) {
    	// Received PING from server.
    	case 'PING':
    		self.logger.event('ping');
	    	self.emit('ping');
	        self.socket.crlfWrite('PONG');
	        break;
	        
	    // Received PONG from server.
    	case 'PONG':
    		self.logger.event('pong');
	    	self.emit('pong');
	        break;
	        
	    // Received MOTD from server.
    	case '372':
    		self.logger.event('connected');
	    	self.emit('connected', self.socket.remoteAddress, self.socket.remotePort);
	    	self.socket.crlfWrite('TWITCHCLIENT 3');
	    	var timer = 0;
	    	self.options.channels.forEach(function(channel) {
	    		setTimeout(function(){self.join(channel);}, timer);
	    		timer = timer+3000;
	    	});
	    	break;
	    	
	    // Someone has joined a channel.
    	case 'JOIN':
    		self.logger.event('join');
    		self.emit('join', message.params[0], message.parseHostmaskFromPrefix().nickname);
    		break;
    		
		// Someone has left a channel.
    	case 'PART':
    		self.logger.event('part');
    		self.emit('part', message.params[0], message.parseHostmaskFromPrefix().nickname);
    		break;
    		
    	// Received notice from server.
    	case 'NOTICE':
    		if (message.prefix === 'tmi.twitch.tv') {
    			if (message.params[1] === 'Login unsuccessful') {
    				self.logger.event('disconnected');
    		    	self.emit('disconnected', message.params[1]);
    			}
    		}
    		break;
    	
		// Received message.
    	case 'PRIVMSG':
    		// Messages from JTV.
    		if (messageFrom === 'jtv') {
		    	self.emit('jtv', message.params);

                var username = message.params[1] ? message.params[1].split(' ')[1] : message.params.push('');
                var value = message.params[1] ? message.params[1].split(' ')[2] : message.params.push('');

		    	switch(true) {
		    		// Subscriber only.
			    	case (message.params[1] === 'This room is now in subscribers-only mode.'):
			    		self.logger.event('subscriber');
		    			self.emit('subscriber', message.params[0], true);
			    		break;
			    		
		    		// No longer subscriber only.
			    	case (message.params[1] === 'This room is no longer in subscribers-only mode.'):
			    		self.logger.event('subscriber');
		    			self.emit('subscriber', message.params[0], false);
			    		break;
			    		
	    			// Slow mode.
			    	case (s(message.params[1]).contains('This room is now in slow mode.')):
			    		var parts = message.params[1].split(' ');
			    		var length = parts[parts.length - 2];
			    		self.logger.event('slowmode');
			    		self.emit('slowmode', message.params[0], true, length);
			    		break;
			    		
		    		// No longer slow mode.
			    	case (message.params[1] === 'This room is no longer in slow mode.'):
			    		self.logger.event('slowmode');
		    			self.emit('slowmode', message.params[0], false, -1);
			    		break;
			    		
		    		// R9K Beta.
			    	case (message.params[1] === 'This room is now in r9k mode. See http://bit.ly/bGtBDf'):
			    		self.logger.event('r9kbeta');
		    			self.emit('r9kbeta', message.params[0], true);
			    		break;
			    		
		    		// No longer in R9K BETA.
			    	case (message.params[1] === 'This room is no longer in r9k mode.'):
			    		self.logger.event('r9kbeta');
		    			self.emit('r9kbeta', message.params[0], false);
			    		break;

                    // Being hosted.
                    case (s(message.params[0]).contains('is now hosting you for')):
                        var parts = message.params[0].split(' ');
                        self.logger.event('hosted');
                        self.emit('hosted', parts[0], parts[6]);
                        break;

                    // Mods.
                    case (s(message.params[1]).contains('The moderators of this room are:')):
                        var parts = message.params[1].split(':');
                        var mods = parts[1].replace(/,/g, '').split(':');
                        for (var i = 0; i < mods.length; i++) {
                            mods[i] = mods[i].trim();
                        }
                        self.logger.event('mods');
                        self.emit('mods', message.params[0], mods);
                        break;

                    // Limitation.
                    case (message.params[1] === 'Host target cannot be changed more than three times per 30 minutes.'):
                        self.logger.event('limitation');
                        self.emit('limitation', {message:message.params[1], code:'CANNOT_HOST'});
                        break;

		    		// Permission error.
			    	case (message.params[1] === 'You don\'t have permission to do this.' || s(message.params[1]).contains('Only the owner of this channel can use')):
			    		self.logger.event('permission');
		    			self.emit('permission', message.params[1]);
			    		break;
			    		
		    		// SPECIALUSER
			    	case (message.params[1].split(' ')[0] === 'SPECIALUSER'):
			    		self.emit('specialuser', username, value);
			    		data.createTempUserData(username);
			    		data.tempUserData[username].special.push(value);
			    		break;
			    		
		    		// USERCOLOR
			    	case (message.params[1].split(' ')[0] === 'USERCOLOR'):
			    		self.emit('usercolor', username, value);
			    		data.createTempUserData(username);
			    		data.tempUserData[username].color = value;
			    		break;
			    		
		    		// EMOTESET
			    	case (message.params[1].split(' ')[0] === 'EMOTESET'):
			    		self.emit('emoteset', username, value);
			    		data.createTempUserData(username);
			    		data.tempUserData[username].emote = value;
			    		break;
			    		
		    		// CLEARCHAT
			    	case (message.params[1].split(' ')[0] === 'CLEARCHAT'):
			    		if (username) { self.emit('timeout', message.params[0], username); }
			    		else { self.emit('clearchat', message.params[0]); }
			    		break;
			    		
		    		// HISTORYEND
			    	case (message.params[1].split(' ')[0] === 'HISTORYEND'):
			    		// Hmm.
			    		break;

                    // HOSTTARGET
                    case (message.params[1].split(' ')[0] === 'HOSTTARGET'):
                        if (message.params[1].split(' ')[1] === '-') {
                            self.logger.event('unhost');
                            self.emit('unhost', message.params[0], message.params[1].split(' ')[2]);
                        } else {
                            self.logger.event('hosting');
                            self.emit('hosting', message.params[0], message.params[1].split(' ')[1], message.params[1].split(' ')[2]);
                        }
                        break;
			    		
		    		default:
		    			console.log('Unhandled message from JTV: '+message.params[1]);
		    			break;
		    	}
    		}
    		
    		// Messages from TwitchNotify.
    		else if (messageFrom === 'twitchnotify') {
		    	self.emit('twitchnotify', message.params);
		    	
		    	switch(true) {
			    	case (s(message.params[1]).contains('just subscribed!')):
			    		self.logger.event('subscription');
	    				self.emit('subscription', message.params[0], message.params[1].split(' ')[0]);
			    		break;
			    	default:
		    			console.log('Unhandled message from TwitchNotify: '+message.params[1]);
		    			break;
		    	}
    		}
    		
    		// Messages from user on a channel.
    		else {
    			var username = message.parseHostmaskFromPrefix().nickname;
    			data.createChannelUserData(message.params[0], username, function(done) {
    				if (s(message.params[1]).startsWith('\u0001ACTION')) {
    					self.emit('action', message.params[0], data.channelUserData[message.params[0]][username], s(message.params[1]).between('\u0001ACTION ', '\u0001'));
    				} else {
    					self.emit('chat', message.params[0], data.channelUserData[message.params[0]][username], message.params[1]);
    				}
    			});
    		}
    		break;
    }
};

/**
 * Connect to server.
 * 
 * @param callback
 */
client.prototype.connect = function connect(callback) {
    var self = this;
    
    var connection = self.options.connection || {};
    
    var preferredServer = connection.preferredServer || null;
    var preferredPort = connection.preferredPort || null;
    var serverType = connection.serverType || 'chat';
    var host = servers.getServer(serverType, preferredServer, preferredPort);
    
    var authenticate = function authenticate() {
    	var identity = self.options.identity;
        var nickname = identity.username || 'justinfan'+Math.floor((Math.random() * 80000) + 1000);
        var password = identity.password || 'SCHMOOPIIE';

        self.logger.event('logon');
    	self.emit('logon');
    	
        self.socket.crlfWrite('PASS '+password);
        self.socket.crlfWrite('NICK %s', nickname);
        self.socket.crlfWrite('USER %s 8 * :%s', nickname, nickname);
    };
	self.socket = createSocket(self, self.options, self.logger, host.split(':')[1], host.split(':')[0], authenticate);
	
	self.socket.pipe(self.stream);
};

client.prototype.join = function join(channel) {
	if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('JOIN '+channel.toLowerCase());
};

client.prototype.part = function part(channel) {
	if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PART '+channel.toLowerCase());
};

client.prototype.ping = function ping() {
	this.socket.crlfWrite('PING');
};

client.prototype.say = function say(channel, message) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :'+message);
};

client.prototype.host = function host(channel, target) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.host '+target);
};

client.prototype.unhost = function unhost(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.unhost');
};

client.prototype.timeout = function timeout(channel, username, seconds) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    seconds = typeof seconds !== 'undefined' ? seconds : 300;
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.timeout '+username+' '+seconds);
};

client.prototype.ban = function ban(channel, username) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.ban '+username);
};

client.prototype.unban = function unban(channel, username) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.unban '+username);
};

client.prototype.slow = function slow(channel, seconds) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    seconds = typeof seconds !== 'undefined' ? seconds : 300;
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.slow '+seconds);
};

client.prototype.slowoff = function slowoff(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.slowoff');
};

client.prototype.subscribers = function subscribers(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.subscribers');
};

client.prototype.subscribersoff = function subscribersoff(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.subscribersoff');
};

client.prototype.clear = function clear(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.clear');
};

client.prototype.r9kbeta = function r9kbeta(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.r9kbeta');
};

client.prototype.r9kbetaoff = function r9kbetaoff(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.r9kbetaoff');
};

client.prototype.mod = function mod(channel, username) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.mod '+username);
};

client.prototype.unmod = function mod(channel, username) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.unmod '+username);
};

client.prototype.commercial = function commercial(channel, seconds) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    seconds = typeof seconds !== 'undefined' ? seconds : 30;
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.commercial '+seconds);
};

client.prototype.mods = function mods(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.mods');
};

module.exports = client;