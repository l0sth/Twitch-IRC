###*
Twitch IRC Servers.
###
serverList =
  chat:
    80: [
      "199.9.250.229"
      "199.9.250.239"
      "199.9.252.120"
      "199.9.252.28"
      "199.9.253.165"
      "199.9.253.199"
      "199.9.253.210"
    ]
    443: [
      "199.9.250.229"
      "199.9.250.239"
      "199.9.252.120"
      "199.9.252.28"
      "199.9.253.165"
      "199.9.253.199"
      "199.9.253.210"
    ]

  events:
    80: [
      "199.9.250.117"
      "199.9.251.213"
      "199.9.252.26"
    ]
    443: [
      "199.9.250.117"
      "199.9.251.213"
      "199.9.252.26"
    ]

  groups:
    80: [
      "199.9.248.232"
      "199.9.248.248"
    ]
    443: [
      "199.9.248.232"
      "199.9.248.248"
    ]

getServer = getServer = (type, server, port) ->
  serverType = type or "chat"
  serverAddress = server or null
  serverPort = port or 443
  if serverAddress is null
    
    # Server type is valid.
    serverTypes = [
      "chat"
      "events"
      "groups"
    ]
    serverType = "chat"  if serverTypes.indexOf(serverType) is -1
    
    # Port is valid.
    serverPortsChat = [
      80
      443
    ]
    serverPorts = [
      80
      443
    ]
    if serverType is "chat" and serverPortsChat.indexOf(serverPort) is -1
      serverPort = 443
    else serverPort = 443  if serverType isnt "chat" and serverPorts.indexOf(serverPort) is -1
    return serverList[serverType][serverPort][Math.floor(Math.random() * (serverList[serverType][serverPort].length - 1))] + ":" + serverPort
  serverAddress + ":" + serverPort

exports.getServer = getServer