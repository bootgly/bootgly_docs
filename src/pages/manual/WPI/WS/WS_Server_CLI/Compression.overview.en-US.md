# Compression

The server supports `permessage-deflate` (RFC 7692). It is negotiated automatically during the
handshake whenever the client offers it and `compression` is on (the default), using PHP's built-in
`zlib` — no extra dependency, and it honors Bootgly's dependency-free core.

## How it works

- The client advertises `Sec-WebSocket-Extensions: permessage-deflate` in the upgrade request.
- The server accepts it and echoes the negotiated parameters back in the `101` response.
- Inbound compressed messages (RSV1 set) are **inflated** before your handler runs — `$Message->payload`
  is always the decompressed bytes.
- String replies (and `Session->send()`) are **deflated** on the way out and marked with RSV1.

Nothing in your handler changes; compression is transparent.

## Toggle it

It is on by default. Turn it off per server:

```php
$WS->configure(host: '0.0.0.0', port: 8083, workers: 1, compression: false);
```

The server negotiates the `client_no_context_takeover` / `server_no_context_takeover` flags and the
window-bits bounds that the client offers, falling back to a full 15-bit window otherwise.

> [!NOTE]
> Broadcast frames (see **Channels**) are sent **uncompressed** — a single shared frame cannot carry
> the per-session deflate context that `permessage-deflate` requires. Direct `send()` and handler
> replies to a single client are compressed normally.
