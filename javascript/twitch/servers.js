/**
 * Twitch IRC Servers.
 */

var serverList = {
	'chat': {
		80: ['199.9.250.229', '199.9.250.239', '199.9.252.120', '199.9.252.28', '199.9.253.165', '199.9.253.199', '199.9.253.210'],
		443: ['199.9.250.229', '199.9.250.239', '199.9.252.120', '199.9.252.28', '199.9.253.165', '199.9.253.199', '199.9.253.210']
	},
	'events': {
		80: ['199.9.250.117', '199.9.251.213', '199.9.252.26'],
		443: ['199.9.250.117', '199.9.251.213', '199.9.252.26']
	},
	'groups': {
		80: ['199.9.248.232', '199.9.248.248'],
		443: ['199.9.248.232', '199.9.248.248']
	}
};

var getServer = function getServer(type, server, port) {
	var serverType = type || 'chat';
	var serverAddress = server || null;
	var serverPort = port || 443;
	if (serverAddress === null) {
		// Server type is valid.
		var serverTypes = ['chat', 'events', 'groups'];
		if (serverTypes.indexOf(serverType) === -1) { serverType = 'chat'; }
		
		// Port is valid.
		var serverPortsChat = [80,443];
		var serverPorts = [80,443];
		if (serverType === 'chat' && serverPortsChat.indexOf(serverPort) === -1) { serverPort = 443; }
		else if (serverType !== 'chat' && serverPorts.indexOf(serverPort) === -1) { serverPort = 443; }
		
		return serverList[serverType][serverPort][Math.floor(Math.random() * (serverList[serverType][serverPort].length - 1))]+':'+serverPort;
	}
	return serverAddress+':'+serverPort;
}

exports.getServer = getServer;