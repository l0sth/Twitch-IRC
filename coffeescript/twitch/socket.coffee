util = require("util")
net = require("net")
errors = require("./errors")

###*
Create a new socket and handle error(s).
###
createSocket = createSocket = (client, options, logger, port, host, callback) ->
  socket = net.connect(port, host, ->
    logger.event "connecting"
    client.emit "connecting", host, port
    callback()
    return
  )
  socket.crlfWrite = (data) ->
    string = util.format.apply(this, arguments)
    @write string + "\r\n"
    return

  
  # Encounter an error, emit disconnected event with the error message and reconnect to server.
  socket.on "error", (err) ->
    logger.error errors.get(err.code)
    logger.event "disconnected"
    client.emit "disconnected", errors.get(err.code)
    connection = options.connection or {}
    reconnect = connection.reconnect or true
    
    # Set the default for replies to -1 for infinite.
    connection.retries = -1  if connection.retries is `undefined`
    
    # Try to reconnect.
    if reconnect and (connection.retries >= 1 or connection.retries is -1)
      setTimeout (->
        logger.event "reconnect"
        client.emit "reconnect"
        connection.retries--  if connection.retries isnt -1
        client.connect()
        return
      ), 5000
    
    # Couldn't reconnect to server after X retries, emit connectfail event.
    if reconnect and connection.retries is 0
      logger.event "connectfail"
      client.emit "connectfail"
    return

  socket

module.exports = createSocket