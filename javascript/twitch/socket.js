var util = require('util');
var net = require('net');
var errors = require('./errors');

/**
 * Create a new socket and handle error(s).
 */
var createSocket = function createSocket(client, options, logger, port, host, callback) {
    var socket = net.connect(port, host, function() {
    	logger.event('connecting');
    	client.emit('connecting', host, port);
        callback();
    });

    socket.crlfWrite = function(data) {
        var string = util.format.apply(this, arguments);
        this.write(string + '\r\n');
    }
    
    // Encounter an error, emit disconnected event with the error message and reconnect to server.
    socket.on('error', function(err) {
    	logger.error(errors.get(err.code));
    	logger.event('disconnected');
    	client.emit('disconnected', errors.get(err.code));
        var connection = options.connection || {};
    	var reconnect = connection.reconnect || true;
    	
    	// Set the default for replies to -1 for infinite.
    	if (connection.retries === undefined) { connection.retries = -1; }
    	
    	// Try to reconnect.
    	if (reconnect && (connection.retries >= 1 || connection.retries === -1)) {
	    	setTimeout(function(){
	    		logger.event('reconnect');
	    		client.emit('reconnect');
	    		if (connection.retries !== -1) { connection.retries--; }
	    		client.connect();
	    	}, 5000);
    	}
    	
    	// Couldn't reconnect to server after X retries, emit connectfail event.
    	if (reconnect && connection.retries === 0) { logger.event('connectfail'); client.emit('connectfail'); }
    });

    return socket;
};

module.exports = createSocket;
