var logger = require('winston');
var mkdirp = require('mkdirp');

/**
 * Custom logger with custom levels and colors.
 */
module.exports = function(config) {
	var debug = config.options.debug || false;
	var logging = config.options.logging || false;
	
	logger.setLevels({
		raw:0,
		event: 1,
		error:2,
		crash: 3
	});

	logger.addColors({
		raw: 'cyan',
		event: 'green',
		error: 'red',
		crash: 'red'
	});

	logger.remove(logger.transports.Console);
	
	if (debug) { logger.add(logger.transports.Console, { level: 'raw', colorize:true }); }
	
	if (logging) {
		mkdirp('./logs', function (err) {
		    if (err) { logger.error(err); }
		    else {
		    	logger.add(logger.transports.File, { level: 'raw', filename: './logs/status.log' });
		    	logger.handleExceptions(new logger.transports.File({ filename: './logs/exceptions.log' }))
		    }
		});
	}
	
	return logger;
};