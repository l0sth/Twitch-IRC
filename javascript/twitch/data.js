var tempUserData = {};
var channelUserData = {};

function createTempUserData(username) {
	if (!tempUserData[username]) {
		tempUserData[username] = {
			username: username,
			special: [],
			color: '#696969',
			emote: []
		};
	}
}

function createChannelUserData(channel, username, cb) {
	if (!channelUserData[channel]) { channelUserData[channel] = {}; }
	if (!tempUserData[username]) { createTempUserData(username); }
	
	channelUserData[channel][username] = tempUserData[username];
	tempUserData[username] = null;
	
	cb();
}

exports.tempUserData = tempUserData;
exports.createTempUserData = createTempUserData;
exports.createChannelUserData = createChannelUserData;
exports.channelUserData = channelUserData;