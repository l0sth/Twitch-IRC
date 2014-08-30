createTempUserData = (username) ->
  unless tempUserData[username]
    tempUserData[username] =
      username: username
      special: []
      color: "#696969"
      emote: []
  return
  
createChannelUserData = (channel, username, cb) ->
  channelUserData[channel] = {}  unless channelUserData[channel]
  createTempUserData username  unless tempUserData[username]
  channelUserData[channel][username] = tempUserData[username]
  tempUserData[username] = null
  cb()
  return
  
tempUserData = {}
channelUserData = {}

exports.tempUserData = tempUserData
exports.createTempUserData = createTempUserData
exports.createChannelUserData = createChannelUserData
exports.channelUserData = channelUserData