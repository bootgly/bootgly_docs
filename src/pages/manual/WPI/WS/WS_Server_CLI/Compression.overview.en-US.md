# Compression

The server supports `permessage-deflate` (RFC 7692). It is negotiated automatically during the
handshake whenever the client offers it and `compression` is on (the default), using PHP's built-in
`zlib` — no extra dependency, and it honors Bootgly's dependency-free core.

## How it works

- The client advertises `Sec-WebSocket-Extensions: permessage-deflate` in the upgrade request.
- The server accepts it and answers the negotiated parameters in the `101` response — always with
  `server_no_context_takeover` and `client_no_context_takeover`:
  `Sec-WebSocket-Extensions: permessage-deflate; server_no_context_takeover; client_no_context_takeover`.
- Inbound compressed messages (RSV1 set) are **inflated** before your handler runs — `$Message->payload`
  is always the decompressed bytes.
- Inflation is budgeted incrementally against `maxMessageSize`. An expansion that crosses the limit
  is stopped with close code `1009` before the complete attacker-controlled output is retained.
- String replies (and `Session->send()`) are **deflated** on the way out and marked with RSV1.

Nothing in your handler changes; compression is transparent.

## Every message on its own

The server compresses and inflates **each message independently** — no compression state is kept
between messages, in either direction:

- Outbound, every session of a worker shares one compressor per window size, flushed completely after
  each message. A message never refers to bytes of an earlier message, from that session or any other.
- Inbound, each compressed message is inflated with a fresh inflater. A client must honor
  `client_no_context_takeover` (RFC 7692 §7.1.1.2 — browsers and standard clients do): a message that
  refers to the client's previous message is invalid data and closes the connection with `1007`.
  A client configured to refuse it fails the handshake instead — for example the Node.js `ws` client
  with `perMessageDeflate: { clientNoContextTakeover: false }`; keep its defaults, or turn compression
  off on either side.
- So a compressed connection holds no compression memory of its own: an idle compressed connection
  costs about the same as a plain one, and a worker reaches its connection limit with compression on
  instead of running out of memory.

The trade-off is ratio on small, repetitive messages: each message is compressed without the
dictionary of the previous ones, so a stream of short, similar JSON messages compresses less than it
would with context takeover, and each one costs a few microseconds more CPU to compress. Large messages
are barely affected. If your traffic is mostly tiny
messages, compare the wire size with `compression: false` before keeping it on.

## Toggle it

It is on by default. Turn it off per server:

```php
$WS->configure(
   new WS_Server_CLI\Configs(host: '0.0.0.0', port: 8083, workers: 1, compression: false)
);
```

> [!NOTE]
> `configure()` takes **Configs** value objects, **named arguments only** — a positional
> `new WS_Server_CLI\Configs('0.0.0.0', 8083, 1)` raises a `TypeError`. See the **WS Server CLI** page
> for the full contract.

A `server_max_window_bits` bound the client offers (9 to 15) is accepted and echoed in the answer,
and the server compresses within it. A bound outside 9–15 (in `server_max_window_bits` or
`client_max_window_bits`) declines that offer: the server tries the next offer in the header, and with
none left the connection runs uncompressed. Without the bound, the server compresses with a full 15-bit
window. It always inflates with a full window, so it decodes any client window from 9 to 15. Both
`no_context_takeover` flags are always part of the answer, whether the client offered them or not.

To check whether a session negotiated compression, test `$Session->extensions !== []` — it holds the
negotiated parameters.

> [!NOTE]
> Broadcast frames (see **Channels**) are sent **uncompressed** — one frame is built once for every
> member of the channel, whether or not each member negotiated compression. Direct `send()` and handler
> replies to a single client are compressed normally.
