# Channels

Channels are named rooms. Add sessions to a channel and fan a message out to every member with one
call — the frame is built **once** and written to each member (encode-once, deliver-many).

> [!NOTE]
> Channels live **per worker**. Each `SO_REUSEPORT` worker has its own channel registry, so a
> broadcast reaches only the members on that worker. Run `workers: 1` (or a sticky load balancer)
> when every client must receive every message.

## Join, broadcast, leave

Join on connect, broadcast on message, and let disconnect clean up membership automatically:

```php
use Bootgly\WPI\Nodes\WS_Server_CLI\Events;

$WS
   ->on(Events::Connected, function ($Session) {
      $Session->join('lobby');
   })
   ->on(Events::MessageReceived, function ($Session, $Message) {
      // relay to everyone else in the lobby; echo back to the sender
      $Session->broadcast('lobby', $Message->payload);

      return "you said: {$Message->payload}";
   })
   ->on(Events::Disconnected, function ($Session) {
      // membership is released automatically; no manual leave() needed
   });
```

`broadcast()` excludes the sender by default — pass `self: true` to include them. A channel is
created on the first `join()` and dropped automatically when its last member leaves. To move a
client between rooms, call `leave()` then `join()`:

```php
$Session->leave('lobby');
$Session->join('room-42');
```

## Reference

### `Session->join (string $channel): Channel`

Add this session to a channel, creating it on first use. Returns the `Channel` so you can inspect
`count()` or broadcast directly.

### `Session->leave (string $channel): void`

Remove this session from a channel. The channel is dropped from the registry when it becomes empty.

### `Session->broadcast (string $channel, string $payload, bool $binary = false, bool $self = false): int`

Encode the message once and write it to every member of `$channel`. The sender is skipped unless
`$self` is `true`. Returns the number of recipients. Broadcast frames are sent uncompressed (a
single shared frame cannot carry per-session compression state).

### `Channel->count (): int`

The number of sessions currently in the channel.
