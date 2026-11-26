# Resolver

`Resolver` turns a host name into its IP addresses through the system's own resolver — the
same lookup PHP performs when it dials a name. It is synchronous: a call blocks until the system
answers. Bootgly's synchronous dials that must check where they connect before connecting — the
ACME client of Auto TLS and the remote JWKS fetch of JWT authentication — resolve through it.

It only resolves. Deciding whether an address may be dialed (loopback, private or reserved
ranges) stays with the caller.

## Resolve a host

```php
use Bootgly\ABI\IO\Resolver;

$Resolver = new Resolver;

$Resolver->resolve('localhost');        // ['::1', '127.0.0.1'] on a typical Linux host
$Resolver->resolve('::ffff:127.0.0.1'); // ['127.0.0.1']
$Resolver->resolve('2001:DB8:0:0::1');  // ['2001:db8::1']
```

The addresses come back canonical, in the order the system resolver gave them, each once. An IP
literal needs no lookup: it is returned as its canonical form, and an IPv4-mapped IPv6 address
(`::ffff:a.b.c.d`) as the IPv4 address it carries. Pass an IPv6 literal without its brackets.

A name with a terminal dot (`api.example.com.`) is absolute: the system's search domains are not
appended to it.

## Tell "no answer" from "a bad answer"

`resolve()` has two failure results, and they mean different things:

```php
$addresses = $Resolver->resolve($host);

if ($addresses === null) {
   // An answer was not an IP address: the lookup itself is not trustworthy
}
else if ($addresses === []) {
   // Nothing resolved: the name does not exist, or the resolver did not answer
}
```

- `[]` — nothing resolved. A host that no resolver should be asked about resolves to `[]`
  without a lookup: an empty name, a name longer than 253 characters, or one holding a NUL byte,
  `%`, `[` or `]`.
- `null` — the lookup is void: one of the answers is not an IP address. None of the other
  answers is returned.

## Without ext-sockets

With ext-sockets loaded, a name goes to `getaddrinfo()` (`socket_addrinfo_lookup()`), and its
answer is final — a failed lookup is not retried another way. Without ext-sockets, `Resolver`
asks:

1. the system's IPv4 answers (`gethostbynamel()`, the hosts file included), then
2. the name's DNS AAAA records (`dns_get_record()`), asked for the absolute name — never for
   `localhost` or a `*.localhost` name, which stay local.

## Dial what you resolved

When you vet the addresses before connecting, dial the vetted address itself — never the name
again, or a second DNS answer could point the connection elsewhere — and keep the name for the
HTTP `Host` header and the TLS peer name:

```php
$addresses = $Resolver->resolve('api.example.com');
if ($addresses === null || $addresses === []) {
   throw new RuntimeException('api.example.com could not be resolved.');
}

$IP = $addresses[0];
$literal = str_contains($IP, ':') ? "[{$IP}]" : $IP;

$Context = stream_context_create([
   'ssl' => ['peer_name' => 'api.example.com'],
]);
$Socket = stream_socket_client("tls://{$literal}:443", $code, $message, 5, STREAM_CLIENT_CONNECT, $Context);
```

## Answer from a test

Each source of the resolver can be replaced by a closure standing in for the PHP function it
names, so a test models DNS answers without the network:

```php
$Resolver = new Resolver(
   Lookup: false, // no getaddrinfo(): resolve as without ext-sockets
   List: static fn (string $host): array => ['192.0.2.10'],
   Query: static fn (string $name): array => [['type' => 'AAAA', 'ipv6' => '2001:db8::10']],
);

$Resolver->resolve('api.example.test'); // ['192.0.2.10', '2001:db8::10']
```

`Query` receives the absolute name (`api.example.test.`). A `Lookup` closure stands in for
`getaddrinfo()` and returns its answers in `socket_addrinfo_explain()`'s shape:

```php
$Resolver = new Resolver(
   Lookup: static fn (string $host): array => [
      ['ai_addr' => ['sin6_addr' => '2001:db8::10']],
      ['ai_addr' => ['sin_addr' => '192.0.2.10']],
   ],
);
```

## Reference

```php
public function __construct (false|null|Closure $Lookup = null, null|Closure $List = null, null|Closure $Query = null)
```

Creates a resolver of the system's resolver. Each argument replaces one source, `null` keeping
the real one: `$Lookup` stands in for `getaddrinfo()` — `fn (string $host): false|array` of
`socket_addrinfo_explain()` arrays — and `false` resolves as without ext-sockets; `$List` for
`gethostbynamel()` — `fn (string $host): false|array` of IPv4 strings; `$Query` for
`dns_get_record($name, DNS_AAAA)` — `fn (string $name): false|array` of records. With `$Lookup`
`null`, the real `getaddrinfo()` is used when ext-sockets is loaded, and the fallback otherwise.

```php
public function resolve (string $host): null|array
```

Resolves `$host` — a name, or an IP literal (IPv6 without brackets) — to its canonical IP
addresses, blocking until the system answers. An IP literal is returned canonical without a
lookup. Returns the addresses in resolver order, each once; `[]` when nothing resolves (or the
host is empty, longer than 253 characters, or holds a NUL byte, `%`, `[` or `]`, refused without
a lookup); `null` when an answer is not an IP address.

```php
public static function normalize (string $IP): null|string
```

Returns the canonical form of an IP literal — an IPv4 dotted quad, or the shortest IPv6 form,
with an IPv4-mapped IPv6 address turned into its IPv4 address — or `null` when `$IP` is not an
IP literal (a name, brackets, a zone, a legacy numeric form such as `010.1.1.1`, a NUL byte).
