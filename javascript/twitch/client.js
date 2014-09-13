/**
 * Twitch-IRC
 *
 * An open source library for Node.js to connect on Twitch IRC Servers.
 *
 * NOTICE OF LICENSE
 *
 * Copyright (c) 2014 Schmoopiie
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * @package  Twitch-IRC
 * @author   Schmoopiie
 * @license  http://opensource.org/licenses/MIT - The MIT License (MIT)
 * @link     http://www.schmoopiie.com
 * @since    version 1.0
 */

var messageStream = require('irc-message-stream');
var createSocket = require('./socket');
var events = require('events');
var util = require('util');
var servers = require('./servers');
var data = require('./data');
var s = require('string');
var locallydb = require('locallydb');
var db = new locallydb('./database');

/**
 * Represents a new IRC client.
 * @constructor
 * @param {object} options
 */
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
 * Handle all IRC messages.
 *
 * @fires client#ping
 * @fires client#pong
 * @fires client#connected
 * @fires client#join
 * @fires client#part
 * @fires client#disconnected
 * @fires client#jtv
 * @fires client#subscriber
 * @fires client#slowmode
 * @fires client#r9kbeta
 * @fires client#hosted
 * @fires client#mods
 * @fires client#limitation
 * @fires client#permission
 * @fires client#specialuser
 * @fires client#usercolor
 * @fires client#emoteset
 * @fires client#timeout
 * @fires client#clearchat
 * @fires client#roomban
 * @fires client#roomchanged
 * @fires client#roomdeleted
 * @fires client#roominvite
 * @fires client#unhost
 * @fires client#hosting
 * @fires client#twitchnotify
 * @fires client#subscription
 */
client.prototype._handleMessage = function _handleMessage(message) {
    var self = this;

    // Logging RAW messages.
    if (message.command.match(/^[0-9]+$/g)) { self.logger.raw('%s: %s', message.command, message.params[1]); }

    var messageFrom = message.prefix;
    if (message.prefix.indexOf('@') >= 0) { messageFrom = message.parseHostmaskFromPrefix().nickname; }

    switch(message.command) {
        case 'PING':
            /**
             * Received PING from server.
             * @event ping
             */
            self.logger.event('ping');
            self.emit('ping');
            self.socket.crlfWrite('PONG');
            break;

        case 'PONG':
            /**
             * Received PONG from server.
             * @event pong
             */
            self.logger.event('pong');
            self.emit('pong');
            break;

        case '372':
            /**
             * Received MOTD from server.
             * @event connected
             */
            self.logger.event('connected');
            self.emit('connected', self.socket.remoteAddress, self.socket.remotePort);
            self.socket.crlfWrite('TWITCHCLIENT 3');
            var timer = 0;
            self.options.channels.forEach(function(channel) {
                setTimeout(function(){self.join(channel);}, timer);
                timer = timer+3000;
            });
            break;

        case 'JOIN':
            /**
             * User has joined a channel.
             * @event join
             * @params {string} channel
             * @params {string} username
             */
            self.logger.event('join');
            self.emit('join', message.params[0], message.parseHostmaskFromPrefix().nickname.toLowerCase());
            break;

        case 'PART':
            /**
             * User has left a channel.
             * @event part
             * @params {string} channel
             * @params {string} username
             */
            self.logger.event('part');
            self.emit('part', message.params[0], message.parseHostmaskFromPrefix().nickname.toLowerCase());
            break;

        case 'NOTICE':
            /**
             * Received a notice from the server.
             * @event disconnected
             * @params {string} reason
             */
            if (message.prefix === 'tmi.twitch.tv') {
                if (message.params[1] === 'Login unsuccessful') {
                    self.logger.event('disconnected');
                    self.emit('disconnected', message.params[1]);
                }
            }
            break;

        // Received message.
        case 'PRIVMSG':
            /**
             * Received a message from JTV.
             * @event jtv
             * @params {string} message
             */
            if (messageFrom === 'jtv') {
                self.emit('jtv', message.params);

                var username = message.params[1] ? message.params[1].split(' ')[1] : message.params.push('');
                var value = message.params[1] ? message.params[1].split(' ')[2] : message.params.push('');

                switch(true) {
                    case (message.params[1] === 'This room is now in subscribers-only mode.'):
                        /**
                         * Room is now in subscribers-only mode.
                         * @event subscriber
                         * @params {string} channel
                         * @params {boolean} status
                         */
                        self.logger.event('subscriber');
                        self.emit('subscriber', message.params[0], true);
                        break;

                    case (message.params[1] === 'This room is no longer in subscribers-only mode.'):
                        /**
                         * Room is now no longer in subscribers-only mode.
                         * @event subscriber
                         * @params {string} channel
                         * @params {boolean} status
                         */
                        self.logger.event('subscriber');
                        self.emit('subscriber', message.params[0], false);
                        break;

                    case (s(message.params[1]).contains('This room is now in slow mode.')):
                        /**
                         * Room is now in slow mode.
                         * @event slowmode
                         * @params {string} channel
                         * @params {boolean} status
                         * @params {string} length
                         */
                        var parts = message.params[1].split(' ');
                        var length = parts[parts.length - 2];
                        self.logger.event('slowmode');
                        self.emit('slowmode', message.params[0], true, length);
                        break;

                    case (message.params[1] === 'This room is no longer in slow mode.'):
                        /**
                         * Room is no longer in slow mode.
                         * @event slowmode
                         * @params {string} channel
                         * @params {boolean} status
                         */
                        self.logger.event('slowmode');
                        self.emit('slowmode', message.params[0], false, -1);
                        break;

                    case (message.params[1] === 'This room is now in r9k mode. See http://bit.ly/bGtBDf'):
                        /**
                         * Room is in r9k mode.
                         * @event r9kbeta
                         * @params {string} channel
                         * @params {boolean} status
                         */
                        self.logger.event('r9kbeta');
                        self.emit('r9kbeta', message.params[0], true);
                        break;

                    case (message.params[1] === 'This room is no longer in r9k mode.'):
                        /**
                         * Room is no longer in r9k mode.
                         * @event r9kbeta
                         * @params {string} channel
                         * @params {boolean} status
                         */
                        self.logger.event('r9kbeta');
                        self.emit('r9kbeta', message.params[0], false);
                        break;

                    case (s(message.params[0]).contains('is now hosting you for')):
                        /**
                         * Room is now hosted by someone else.
                         * @event hosted
                         * @params {string} channel
                         * @params {string} username
                         * @params {string} viewers count
                         */
                        var parts = message.params[0].split(' ');
                        self.logger.event('hosted');
                        self.emit('hosted', message.params[0], parts[0], parts[6]);
                        break;

                    case (s(message.params[1]).contains('The moderators of this room are:')):
                        /**
                         * Received mods list on a channel.
                         * @event mods
                         * @params {string} channel
                         * @params {array} mods
                         */
                        var parts = message.params[1].split(':');
                        var mods = parts[1].replace(/,/g, '').split(':');
                        for (var i = 0; i < mods.length; i++) {
                            mods[i] = mods[i]..toLowerCase().trim();
                        }
                        self.logger.event('mods');
                        self.emit('mods', message.params[0], mods);
                        break;

                    case (message.params[1] === 'Host target cannot be changed more than three times per 30 minutes.') ||
                    message.params[1] === 'UNAUTHORIZED JOIN':
                        /**
                         * Encountered some kind of limitation.
                         * @event limitation
                         * @params {object} err
                         */
                        self.logger.event('limitation');
                        var code;
                        if (message.params[1] === 'Host target cannot be changed more than three times per 30 minutes.') { code = 'CANNOT_HOST'; }
                        else if (message.params[1] === 'UNAUTHORIZED JOIN') { code = 'CANNOT_HOST'; }
                        self.emit('limitation', {message: message.params[1], code: code});
                        break;

                    case (message.params[1] === 'You don\'t have permission to do this.' || s(message.params[1]).contains('Only the owner of this channel can use')) ||
                    message.params[1] === 'You don\'t have permission to timeout people in this room.':
                        /**
                         * Encountered some kind of permission problems.
                         * @event permission
                         * @params {object} err
                         */
                        self.logger.event('permission');
                        var code;
                        if (message.params[1] === 'You don\'t have permission to do this.') { code = 'NO_PERMISSION'; }
                        else if (s(message.params[1]).contains('Only the owner of this channel can use')) { code = 'OWNER_ONLY'; }
                        else if (message.params[1] === 'You don\'t have permission to timeout people in this room.') { code = 'NO_PERMISSION'; }
                        self.emit('permission', {message: message.params[1], code: code});
                        break;

                    case (message.params[1].split(' ')[0] === 'SPECIALUSER'):
                        /**
                         * SPECIALUSER message sent by JTV.
                         * @event specialuser
                         * @params {string} username
                         * @params {string} value
                         */
                        self.emit('specialuser', username, value);
                        data.createTempUserData(username);
                        data.tempUserData[username].special.push(value);
                        break;

                    case (message.params[1].split(' ')[0] === 'USERCOLOR'):
                        /**
                         * USERCOLOR message sent by JTV.
                         * @event usercolor
                         * @params {string} username
                         * @params {string} value
                         */
                        self.emit('usercolor', username, value);
                        data.createTempUserData(username);
                        data.tempUserData[username].color = value;
                        break;

                    case (message.params[1].split(' ')[0] === 'EMOTESET'):
                        /**
                         * EMOTESET message sent by JTV.
                         * @event emoteset
                         * @params {string} username
                         * @params {string} value
                         */
                        self.emit('emoteset', username, value);
                        data.createTempUserData(username);
                        data.tempUserData[username].emote = value;
                        break;

                    case (message.params[1].split(' ')[0] === 'CLEARCHAT'):
                        /**
                         * CLEARCHAT message sent by JTV.
                         * @event clearchat
                         * @params {string} channel
                         *
                         * @event timeout
                         * @params {string} channel
                         * @params {string} username
                         */
                        if (username) {
                            self.logger.event('timeout');
                            self.emit('timeout', message.params[0], username);
                        }
                        else {
                            self.logger.event('clearchat');
                            self.emit('clearchat', message.params[0]);
                        }
                        break;

                    case (message.params[1].split(' ')[0] === 'ROOMBAN'):
                        /**
                         * ROOMBAN message sent by JTV.
                         * @event roomban
                         * @params {string} room
                         * @params {string} username
                         */
                        self.emit('roomban', message.params[0], username);
                        break;

                    case (message.params[1].split(' ')[0] === 'ROOMCHANGED'):
                        /**
                         * ROOMCHANGED message sent by JTV.
                         * @event roomchanged
                         * @params {string} channel
                         */
                        self.emit('roomchanged', message.params[0]);
                        break;

                    case (message.params[1].split(' ')[0] === 'ROOMDELETED'):
                        /**
                         * ROOMDELETED message sent by JTV.
                         * @event roomdeleted
                         * @params {string} room
                         */
                        self.emit('roomdeleted', message.params[0]);
                        break;

                    case (message.params[1].split(' ')[0] === 'ROOMINVITE'):
                        /**
                         * ROOMINVITE message sent by JTV.
                         * @event roominvite
                         * @params {string} room
                         * @params {string} by username
                         */
                        self.emit('roominvite', message.params[0], username);
                        break;

                    case (message.params[1].split(' ')[0] === 'HISTORYEND'):
                        break;

                    case (message.params[1].split(' ')[0] === 'HOSTTARGET'):
                        /**
                         * HOSTTARGET message sent by JTV.
                         * @event unhost
                         * @params {string} channel
                         * @params {string} remains
                         *
                         * @event hosting
                         * @params {string} channel
                         * @params {string} target
                         * @params {string} remains
                         */
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

            /**
             * Received a message from TwitchNotify.
             * @event twitchnotify
             * @params {string} channel
             * @params {string} message
             */
            else if (messageFrom === 'twitchnotify') {
                self.emit('twitchnotify', message.params[0], message.params[1]);

                switch(true) {
                    case (s(message.params[1]).contains('just subscribed!')):
                        /**
                         * Someone has subscribed to a channel.
                         * @event subscription
                         * @params {string} channel
                         * @params {string} username
                         */
                        self.logger.event('subscription');
                        self.emit('subscription', message.params[0], message.params[1].split(' ')[0]);
                        break;
                    default:
                        console.log('Unhandled message from TwitchNotify: '+message.params[1]);
                        break;
                }
            }

            /**
             * Someone has sent a message on a channel.
             * @event action
             * @params {string} channel
             * @params {object} user
             * @params {string} message
             *
             * @event chat
             * @params {string} channel
             * @params {object} user
             * @params {string} message
             */
            else {
                var username = message.parseHostmaskFromPrefix().nickname.toLowerCase();
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
 * Connect to the server.
 * @params callback
 * @fires connect#logon
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

/**
 * Join a channel.
 * @params {string} channel
 */
client.prototype.join = function join(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('JOIN '+channel.toLowerCase());
};

/**
 * Leave a channel.
 * @params {string} channel
 */
client.prototype.part = function part(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PART '+channel.toLowerCase());
};

/**
 * Send a PING to the server.
 */
client.prototype.ping = function ping() {
    this.socket.crlfWrite('PING');
};

/**
 * Say something on a channel.
 * @params {string} channel
 * @params {string} message
 */
client.prototype.say = function say(channel, message) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :'+message);
};

/**
 * Host a channel.
 * @params {string} channel
 * @params {string} target
 */
client.prototype.host = function host(channel, target) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.host '+target);
};

/**
 * Unhost.
 * @params {string} channel
 */
client.prototype.unhost = function unhost(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.unhost');
};

/**
 * Timeout a username on a channel for X seconds.
 * @params {string} channel
 * @params {string} username
 * @params {integer} seconds
 */
client.prototype.timeout = function timeout(channel, username, seconds) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    seconds = typeof seconds !== 'undefined' ? seconds : 300;
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.timeout '+username+' '+seconds);
};

/**
 * Ban a username on a channel.
 * @params {string} channel
 * @params {string} username
 */
client.prototype.ban = function ban(channel, username) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.ban '+username);
};

/**
 * Unban a username on a channel.
 * @params {string} channel
 * @params {string} username
 */
client.prototype.unban = function unban(channel, username) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.unban '+username);
};

/**
 * Enable slow mode on a channel.
 * @params {string} channel
 * @params {integer} seconds
 */
client.prototype.slow = function slow(channel, seconds) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    seconds = typeof seconds !== 'undefined' ? seconds : 300;
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.slow '+seconds);
};

/**
 * Disable the slow mode on a channel.
 * @params {string} channel
 */
client.prototype.slowoff = function slowoff(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.slowoff');
};

/**
 * Enable subscriber-only on a channel.
 * @params {string} channel
 */
client.prototype.subscribers = function subscribers(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.subscribers');
};

/**
 * Disable subscriber-only on a channel.
 * @params {string} channel
 */
client.prototype.subscribersoff = function subscribersoff(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.subscribersoff');
};

/**
 * Clear all the messages on a channel.
 * @params {string} channel
 */
client.prototype.clear = function clear(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.clear');
};

/**
 * Enable R9KBeta on a channel.
 * @params {string} channel
 */
client.prototype.r9kbeta = function r9kbeta(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.r9kbeta');
};

/**
 * Disable R9KBeta on a channel.
 * @params {string} channel
 */
client.prototype.r9kbetaoff = function r9kbetaoff(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.r9kbetaoff');
};

/**
 * Mod a username on a channel.
 * @params {string} channel
 * @params {string} username
 */
client.prototype.mod = function mod(channel, username) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.mod '+username);
};

/**
 * Unmod a username on a channel.
 * @params {string} channel
 * @params {string} username
 */
client.prototype.unmod = function mod(channel, username) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.unmod '+username);
};

/**
 * Show a commercial on a channel for X seconds.
 * @params {string} channel
 * @params {integer} seconds
 */
client.prototype.commercial = function commercial(channel, seconds) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    seconds = typeof seconds !== 'undefined' ? seconds : 30;
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.commercial '+seconds);
};

/**
 * Get all the mods on a channel.
 * @params {string} channel
 */
client.prototype.mods = function mods(channel) {
    if (!s(channel).startsWith('#')) { channel = '#'+channel; }
    this.socket.crlfWrite('PRIVMSG '+channel.toLowerCase()+ ' :.mods');
};

client.prototype.db = {
    /**
     * Insert/add/push a list of elements.
     * @params {string} collection
     * @params {object} elements
     */
    insert: function insert(collection, elements) {
        var collection = db.collection(collection);
        collection.insert(elements);
        collection.save();
        return true;
    },
    /**
     * Retrieve elements.
     * @params {string} collection
     * @params {query} query
     */
    where: function where(collection, query) {
        var collection = db.collection(collection);
        return collection.where(query);
    },
    /**
     * Retrieve by cid.
     * @params {string} collection
     * @params {integer} cid
     */
    get: function get(collection, cid) {
        var collection = db.collection(collection);
        return collection.get(cid);
    },
    /**
     * List all elements in the collection.
     * @params {string} collection
     */
    list: function list(collection) {
        var collection = db.collection(collection);
        return collection.list;
    },
    /**
     * Update an element, it will add un-exsited key and replace existed.
     * @params {string} collection
     * @params {integer} cid
     * @params {object} object
     */
    update: function update(collection, cid, object) {
        var collection = db.collection(collection);
        collection.update(cid, object);
        collection.save();
        return true;
    },
    /**
     * Replace the element with the same cid.
     * @params {string} collection
     * @params {integer} cid
     * @params {object} object
     */
    replace: function replace(collection, cid, object) {
        var collection = db.collection(collection);
        collection.replace(cid, object);
        collection.save();
        return true;
    },
    /**
     * Delete an item by cid.
     * @params {string} collection
     * @params {integer} cid
     */
    remove: function remove(collection, cid) {
        var collection = db.collection(collection);
        collection.remove(cid);
        collection.save();
        return true;
    }
}

module.exports = client;