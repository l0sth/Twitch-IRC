###*
Better descriptions for error codes.
###
errors = (->
  private_ =
    EADDRINUSE: "Address already in use"
    EADDRNOTAVAIL: "Cannot assign requested address"
    ENETDOWN: "Network is down"
    ENETUNREACH: "Network is unreachable"
    ENETRESET: "Network dropped connection because of reset"
    ENOTFOUND: "Cannot get your address informations"
    ECONNABORTED: "Software caused connection abort"
    ECONNRESET: "Connection reset by peer"
    ENOBUFS: "No buffer space available"
    ETIMEDOUT: "Connection timed out"
    ECONNREFUSED: "Connection refused"
    EHOSTDOWN: "Host is down"
    EHOSTUNREACH: "No route to host"
    EREMOTEIO: "Remote I/O error"
    ESOCKTNOSUPPORT: "Socket type not supported"

  get: (name) ->
    private_[name] or name
)()
module.exports = errors