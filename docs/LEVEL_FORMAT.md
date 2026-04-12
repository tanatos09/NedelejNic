# LEVEL DATA FORMAT

Každý level je JSON objekt.

Example:

{
  "id": 1,

  "rules": {
    "mouseMove": false,
    "click": false,
    "keyboard": false,
    "scroll": false,
    "touch": false
  },

  "events": [
    {
      "time": 3,
      "type": "voice",
      "audio": "welcome.mp3"
    },
    {
      "time": 5,
      "type": "subtitle",
      "text": "Nedělej nic."
    },
    {
      "time": 8,
      "type": "clear"
    }
  ],

  "end": {
    "type": "timer",
    "time": 20
  },

  "signature": "hmac-sha256-hash"
}