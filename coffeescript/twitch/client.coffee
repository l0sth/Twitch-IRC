messageStream = require("irc-message-stream")
createSocket = require("./socket")
events = require("events")
util = require("util")
servers = require("./servers")
data = require("./data")
s = require("string")

client = client = (options) ->
  self = this
  events.EventEmitter.call this
  @logger = require("./logger")(options)
  @options = options
  @stream = messageStream()
  @socket = null
  @stream.on "data", @_handleMessage.bind(this)
  process.on "uncaughtException", (err) ->
    self.logger.crash err.stack
    self.emit "crash", err.message, err.stack
    return

  return


# Inherit client from EventEmitter.
util.inherits client, events.EventEmitter

###*
Handle all IRC Messages, including jtv and TwitchNotify.

@param message
###
client::_handleMessage = _handleMessage = (message) ->
  self = this
  
  # Logging RAW messages.
  self.logger.raw "%s: %s", message.command, message.params[1]  if message.command.match(/^[0-9]+$/g)
  messageFrom = message.prefix
  messageFrom = message.parseHostmaskFromPrefix().nickname  if message.prefix.indexOf("@") >= 0
  switch message.command
    
    # Received PING from server.
    when "PING"
      self.logger.event "ping"
      self.emit "ping"
      self.socket.crlfWrite "PONG"
    
    # Received PONG from server.
    when "PONG"
      self.logger.event "pong"
      self.emit "pong"
    
    # Received MOTD from server.
    when "372"
      self.logger.event "connected"
      self.emit "connected", self.socket.remoteAddress, self.socket.remotePort
      self.socket.crlfWrite "TWITCHCLIENT 3"
      timer = 0
      self.options.channels.forEach (channel) ->
        setTimeout (->
          self.join channel
          return
        ), timer
        timer = timer + 3000
        return

    
    # Someone has joined a channel.
    when "JOIN"
      self.logger.event "join"
      self.emit "join", message.params[0], message.parseHostmaskFromPrefix().nickname
    
    # Someone has left a channel.
    when "PART"
      self.logger.event "part"
      self.emit "part", message.params[0], message.parseHostmaskFromPrefix().nickname
    
    # Received notice from server.
    when "NOTICE"
      if message.prefix is "tmi.twitch.tv"
        if message.params[1] is "Login unsuccessful"
          self.logger.event "disconnected"
          self.emit "disconnected", message.params[1]
    
    # Received message.
    when "PRIVMSG"
      
      # Messages from JTV.
      if messageFrom is "jtv"
        self.emit "jtv", message.params
        username = (if message.params[1] then message.params[1].split(" ")[1] else message.params.push(""))
        value = (if message.params[1] then message.params[1].split(" ")[2] else message.params.push(""))
        switch true
          
          # Subscriber only.
          when (message.params[1] is "This room is now in subscribers-only mode.")
            self.logger.event "subscriber"
            self.emit "subscriber", message.params[0], true
          
          # No longer subscriber only.
          when (message.params[1] is "This room is no longer in subscribers-only mode.")
            self.logger.event "subscriber"
            self.emit "subscriber", message.params[0], false
          
          # Slow mode.
          when (s(message.params[1]).contains("This room is now in slow mode."))
            parts = message.params[1].split(" ")
            length = parts[parts.length - 2]
            self.logger.event "slowmode"
            self.emit "slowmode", message.params[0], true, length
          
          # No longer slow mode.
          when (message.params[1] is "This room is no longer in slow mode.")
            self.logger.event "slowmode"
            self.emit "slowmode", message.params[0], false, -1
          
          # R9K Beta.
          when (message.params[1] is "This room is now in r9k mode. See http://bit.ly/bGtBDf")
            self.logger.event "r9kbeta"
            self.emit "r9kbeta", message.params[0], true
          
          # No longer in R9K BETA.
          when (message.params[1] is "This room is no longer in r9k mode.")
            self.logger.event "r9kbeta"
            self.emit "r9kbeta", message.params[0], false
          
          # Being hosted.
          when (s(message.params[0]).contains("is now hosting you for"))
            parts = message.params[0].split(" ")
            self.logger.event "hosted"
            self.emit "hosted", parts[0], parts[6]
          
          # Mods.
          when (s(message.params[1]).contains("The moderators of this room are:"))
            parts = message.params[1].split(":")
            mods = parts[1].replace(/,/g, "").split(":")
            i = 0

            while i < mods.length
              mods[i] = mods[i].trim()
              i++
            self.logger.event "mods"
            self.emit "mods", message.params[0], mods
          
          # Limitation.
          when (message.params[1] is "Host target cannot be changed more than three times per 30 minutes.")
            self.logger.event "limitation"
            self.emit "limitation",
              message: message.params[1]
              code: "CANNOT_HOST"

          
          # Permission error.
          when (message.params[1] is "You don't have permission to do this." or s(message.params[1]).contains("Only the owner of this channel can use"))
            self.logger.event "permission"
            self.emit "permission", message.params[1]
          
          # SPECIALUSER
          when (message.params[1].split(" ")[0] is "SPECIALUSER")
            self.emit "specialuser", username, value
            data.createTempUserData username
            data.tempUserData[username].special.push value
          
          # USERCOLOR
          when (message.params[1].split(" ")[0] is "USERCOLOR")
            self.emit "usercolor", username, value
            data.createTempUserData username
            data.tempUserData[username].color = value
          
          # EMOTESET
          when (message.params[1].split(" ")[0] is "EMOTESET")
            self.emit "emoteset", username, value
            data.createTempUserData username
            data.tempUserData[username].emote = value
          
          # CLEARCHAT
          when (message.params[1].split(" ")[0] is "CLEARCHAT")
            if username
              self.emit "timeout", message.params[0], username
            else
              self.emit "clearchat", message.params[0]
          
          # HISTORYEND
          
          # Hmm.
          
          # HOSTTARGET
          when (message.params[1].split(" ")[0] is "HISTORYEND"), (message.params[1].split(" ")[0] is "HOSTTARGET")
            if message.params[1].split(" ")[1] is "-"
              self.logger.event "unhost"
              self.emit "unhost", message.params[0], message.params[1].split(" ")[2]
            else
              self.logger.event "hosting"
              self.emit "hosting", message.params[0], message.params[1].split(" ")[1], message.params[1].split(" ")[2]
          else
            console.log "Unhandled message from JTV: " + message.params[1]
      
      # Messages from TwitchNotify.
      else if messageFrom is "twitchnotify"
        self.emit "twitchnotify", message.params
        switch true
          when (s(message.params[1]).contains("just subscribed!"))
            self.logger.event "subscription"
            self.emit "subscription", message.params[0], message.params[1].split(" ")[0]
          else
            console.log "Unhandled message from TwitchNotify: " + message.params[1]
      
      # Messages from user on a channel.
      else
        username = message.parseHostmaskFromPrefix().nickname
        data.createChannelUserData message.params[0], username, (done) ->
          if s(message.params[1]).startsWith("\u0001ACTION")
            self.emit "action", message.params[0], data.channelUserData[message.params[0]][username], s(message.params[1]).between("\u0001ACTION ", "\u0001")
          else
            self.emit "chat", message.params[0], data.channelUserData[message.params[0]][username], message.params[1]
          return



###*
Connect to server.

@param callback
###
client::connect = connect = (callback) ->
  self = this
  connection = self.options.connection or {}
  preferredServer = connection.preferredServer or null
  preferredPort = connection.preferredPort or null
  serverType = connection.serverType or "chat"
  host = servers.getServer(serverType, preferredServer, preferredPort)
  authenticate = authenticate = ->
    identity = self.options.identity
    nickname = identity.username or "justinfan" + Math.floor((Math.random() * 80000) + 1000)
    password = identity.password or "SCHMOOPIIE"
    self.logger.event "logon"
    self.emit "logon"
    self.socket.crlfWrite "PASS " + password
    self.socket.crlfWrite "NICK %s", nickname
    self.socket.crlfWrite "USER %s 8 * :%s", nickname, nickname
    return

  self.socket = createSocket(self, self.options, self.logger, host.split(":")[1], host.split(":")[0], authenticate)
  self.socket.pipe self.stream
  return

client::join = join = (channel) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "JOIN " + channel.toLowerCase()
  return

client::part = part = (channel) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PART " + channel.toLowerCase()
  return

client::ping = ping = ->
  @socket.crlfWrite "PING"
  return

client::say = say = (channel, message) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :" + message
  return

client::host = host = (channel, target) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.host " + target
  return

client::unhost = unhost = (channel) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.unhost"
  return

client::timeout = timeout = (channel, username, seconds) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  seconds = (if typeof seconds isnt "undefined" then seconds else 300)
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.timeout " + username + " " + seconds
  return

client::ban = ban = (channel, username) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.ban " + username
  return

client::unban = unban = (channel, username) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.unban " + username
  return

client::slow = slow = (channel, seconds) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  seconds = (if typeof seconds isnt "undefined" then seconds else 300)
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.slow " + seconds
  return

client::slowoff = slowoff = (channel) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.slowoff"
  return

client::subscribers = subscribers = (channel) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.subscribers"
  return

client::subscribersoff = subscribersoff = (channel) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.subscribersoff"
  return

client::clear = clear = (channel) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.clear"
  return

client::r9kbeta = r9kbeta = (channel) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.r9kbeta"
  return

client::r9kbetaoff = r9kbetaoff = (channel) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.r9kbetaoff"
  return

client::mod = mod = (channel, username) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.mod " + username
  return

client::unmod = mod = (channel, username) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.unmod " + username
  return

client::commercial = commercial = (channel, seconds) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  seconds = (if typeof seconds isnt "undefined" then seconds else 30)
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.commercial " + seconds
  return

client::mods = mods = (channel) ->
  channel = "#" + channel  unless s(channel).startsWith("#")
  @socket.crlfWrite "PRIVMSG " + channel.toLowerCase() + " :.mods"
  return

module.exports = client