# DNS Client CLI

`DNS_Client_CLI` resolves host names and asks DNS for records without stopping a server worker.
Inside a worker, a lookup made from deferred work parks on the worker's event loop while its query
is in flight: the worker keeps answering other requests. Anywhere else — a command, a script, a
test — the same call simply blocks until it has an answer.

It reads the system's settings the way glibc's `getaddrinfo()` does: `/etc/resolv.conf`,
`/etc/hosts`, `/etc/nsswitch.conf` and the `LOCALDOMAIN` / `RES_OPTIONS` environment variables.

## Resolve a host

```php
use Bootgly\WPI\Nodes\DNS_Client_CLI;

$DNS = new DNS_Client_CLI;

$DNS->resolve('api.example.com'); // e.g. ['2001:db8::10', '192.0.2.10']
$DNS->resolve('[2001:db8::1]');   // ['2001:db8::1']
$DNS->resolve('no.such.name');    // []
```

`resolve()` returns the canonical addresses a dialer should try, in order: addresses of a family
the machine can reach (it has a global source address of that family) come first, IPv6 before
IPv4; loopback addresses are always reachable. At most 32 addresses of each family come back. An
empty list means the name did not resolve. An IP literal — IPv6 bare or in brackets — comes back
canonical, without a lookup.

Outside a worker, `resolve()` asks the system resolver (`getaddrinfo()`), so the answer is the one
any other program on the machine would get.

## Resolve from a request handler

Pass the response's wait bridge from inside `defer()`: the lookup parks instead of blocking the
worker.

```php
use Bootgly\WPI\Nodes\DNS_Client_CLI;

$Router->route('/weather', function (Request $Request, Response $Response) {
   return $Response->defer(function (Response $Response) {
      $DNS = new DNS_Client_CLI;
      $addresses = $DNS->resolve('api.weather.example', fn ($value = null) => $Response->wait($value));

      $Response->JSON->send(['address' => $addresses[0] ?? null]);
   });
}, GET);
```

While the query is in flight, the worker serves other connections. Lookups of the same name made
at the same time share one query: ten requests asking for `api.weather.example` send one A and one
AAAA question, and all ten wake with the answer.

On a worker, a name is asked over DNS directly — A and AAAA at once — following the search list the
way glibc's `res_search()` does. A name that does not resolve over DNS is not asked again through
the system resolver: that call would block the worker.

Creating an instance per request costs nothing. Every instance in a process shares one state per
configuration — the cache, the queries in flight, the hosts table, the settings — and a forked
process starts with its own.

## What resolves without a query

Before any query, `resolve()` answers from:

1. **IP literals** — returned canonical.
2. **`invalid` and `*.invalid`** — nothing: these names never resolve, not even from the hosts
   file.
3. **The hosts file** — when `files` is listed in `nsswitch.conf` (it is by default). A name in
   `/etc/hosts` never reaches DNS.
4. **`localhost` and `*.localhost`** — `::1` and `127.0.0.1`.

Some names belong to the system resolver even on a worker, so they are asked there (blocking):

- `*.local` names, when an mDNS source (`mdns*`, or `resolve`) comes before `dns` in
  `nsswitch.conf`; otherwise they are plain DNS names.
- The machine's own host name, `_gateway` and `_outbound`, when `myhostname` (or `resolve`) comes
  before `dns`.
- Numeric host forms such as `127.1` or `0x7f.1`.

These answers are kept for 5 seconds.

## The search list

A name with fewer dots than `ndots` (1 by default) is tried with each search domain first, then as
it is; a name with at least `ndots` dots is tried as it is first. A name ending in a dot is
absolute: only that name is asked.

Moving through the search list follows glibc:

- an answer ends the lookup;
- "no such name", "no data of that type" and a server failure (`SERVFAIL`) try the next domain;
- a timeout, a refusal or any other error stops the list, and the name is still asked as it is;
- when no nameserver listens at all, the lookup ends at once.

## Ask for other records

`query()` asks DNS for one record type at an absolute name — no search list, no hosts file, no
system resolver. `invalid` and `*.invalid` are `Absent` without a query; `local` and `*.local` are
`Failed` without a query when an mDNS source comes before `dns` in `nsswitch.conf` (they are never
asked over unicast DNS then):

```php
use Bootgly\ABI\Data\DNS;
use Bootgly\WPI\Nodes\DNS_Client_CLI;
use Bootgly\WPI\Nodes\DNS_Client_CLI\Answer\Outcomes;

$DNS = new DNS_Client_CLI;
$Answer = $DNS->query('example.com', DNS::TYPE_MX);

if ($Answer->Outcome === Outcomes::Answered) {
   foreach ($Answer->Records as $Record) {
      echo "{$Record->data['exchange']} ({$Record->data['preference']})\n";
   }
}
```

The `Answer` carries:

- `Outcome` — `Answered` (records came back), `Absent` (the name does not exist), `Empty` (the
  name exists without records of that type) or `Failed` (no usable answer: timeouts, server
  failures, a broken CNAME chain);
- `name` — the canonical name, at the end of any CNAME chain;
- `Records` — the records of the type asked, as `Bootgly\ABI\Data\DNS\Message\Record` (copies:
  changing one never changes the cached answer);
- `TTL` — seconds the answer stays valid.

`query()` takes the same wait bridge as `resolve()`.

## Answers you can trust

Every reply is checked before it is used: it must carry the id of a question in flight, answer that
exact question (name, type and class) and fit the size the query advertised. Anything else is
dropped, and the query keeps waiting for the real answer.

A truncated reply is asked again over TCP, once, at the same nameserver; it is never used itself. A
CNAME chain is followed for up to 8 hops; a loop, or two CNAMEs at one name, fails the answer. A
chain's target is always a DNS name, even when it looks like an address.

## The cache

Answers are kept for their TTL, between 5 seconds and 1 hour. A missing name or missing data is
kept for the zone's negative TTL, between 5 and 60 seconds (5 when the reply carries none). A
lookup that timed out or was refused is kept 5 seconds, so a dead nameserver is not asked again by
every request; a server failure (`SERVFAIL`) is not kept.

When a lookup fails — fresh, or kept as a failure from the last 5 seconds — an expired answer from
the last 5 minutes is returned instead, with a TTL of 0. Each worker holds at most 1024 answers and
about 4 MiB, shared by every configuration (each one sees only its own answers); an answer larger
than 8 KiB is returned but never kept.

## Bounds

- Each try waits `timeout` seconds; every nameserver gets `attempts` tries. The whole lookup ends
  by `timeout × (attempts × nameservers + 1)`.
- At most 64 queries are in flight in a worker, every configuration together; past that, a lookup
  on the worker is unresolved at once, and nothing is cached.
- A wait bridge that does not suspend (one that returns at once) is noticed after a few wakes, and
  the lookup ends unresolved instead of spinning.
- A name is refused without a lookup when it is empty, longer than 253 characters, holds a NUL
  byte, `%` or a stray bracket, or has an empty label or one longer than 63 characters.

## Configure

Without `configure()`, the system's files apply. A value given in `Configs` wins over the
system's:

```php
use Bootgly\WPI\Nodes\DNS_Client_CLI;
use Bootgly\WPI\Nodes\DNS_Client_CLI\Configs;

$DNS = new DNS_Client_CLI;
$DNS->configure(new Configs(
   nameservers: ['192.0.2.53', '2001:db8::53'],
   search: ['corp.example'],
   timeout: 2,
   attempts: 2,
   hosts: null, // no hosts file
));
```

From `resolv.conf` and `RES_OPTIONS`, the resolver honours `nameserver` (up to 3), `domain`,
`search` and the options `ndots`, `timeout`, `attempts`, `rotate` and `edns0`. `LOCALDOMAIN`
replaces the search list. A search domain that is not a domain name (an empty label, one longer than
63 characters, a character outside letters, digits, `-` and `_`) is skipped. The options `use-vc`, `no-aaaa`, `single-request` and `sortlist`, and the
`HOSTALIASES` variable, are ignored.

Lookups share their state per configuration: equal values, and the same `Resolver` and `Probe`
objects. Build a `Configs` carrying either of them once and reuse it — a new object per request
is a new state per request.

## Reference

```php
public function configure (Configuring ...$Configs): self
```

Applies one `DNS_Client_CLI\Configs` (`Configuring` is the `Bootgly\ABI\Configs` interface). Returns the node.

```php
public function resolve (string $host, null|Closure $Wait = null): array
```

Resolves `$host` — a name (a trailing dot skips the search list) or an IP literal (IPv6 bare or
in brackets) — to the canonical addresses a dialer should try, in order, at most 32 per family.
With `$Wait` — the caller's wait bridge, `fn ($value = null) => $Response->wait($value)` —
inside a Fiber on a server worker, the lookup parks instead of blocking. Returns `[]` when the name
does not resolve or is refused.

```php
public function query (string $name, int $type, null|Closure $Wait = null): Answer
```

Asks DNS for the records of `$type` (`DNS::TYPE_MX`, `DNS::TYPE_TXT`, …) at the absolute name
`$name` (a trailing dot is optional). Fresh answers come from the cache; a failed lookup (or a
cached failure) returns an expired answer from the last 5 minutes when there is one. `invalid` and
`*.invalid` are `Absent`, and `*.local` with an mDNS source configured is `Failed`, without a
query. `$Wait` as in `resolve()`. Returns an
`Answer`; a refused name or a type outside `1`–`65535` is `Failed` at once.

```php
public null|(Events & Loops & Scheduler) $Reactor
```

The worker's event loop lookups park on; `null` outside a server worker. Read-only.

```php
new Configs(
   null|array $nameservers = null,
   int $port = 53,
   null|array $search = null,
   null|int $ndots = null,
   null|int|float $timeout = null,
   null|int $attempts = null,
   null|bool $rotate = null,
   null|bool $EDNS = null,
   null|string $resolv = '/etc/resolv.conf',
   null|string $hosts = '/etc/hosts',
   null|string $nsswitch = '/etc/nsswitch.conf',
   null|array $environment = null,
   null|string $hostname = null,
   null|Resolver $Resolver = null,
   null|Closure $Probe = null
)
```

Named arguments only. `null` takes the system's value. `nameservers`: 1 to 3 IP literals (an IPv6
link-local one may carry a zone id). `search`: up to 6 domain names (labels of 1 to 63 characters, at most 253 characters, one optional trailing dot); `.` alone (the root) searches nothing. `ndots`: 0–15. `timeout`: seconds
per try, above 0 and at most 30. `attempts`: 1–5. `rotate`: start each query at the next
nameserver. `EDNS`: advertise EDNS(0) with a 1232-byte payload. `resolv`, `hosts`, `nsswitch`: the
files to read, `null` for none (`nsswitch` `null` means `files dns`). `environment`: the
`LOCALDOMAIN` / `RES_OPTIONS` values, `null` for the process environment. `hostname`: the
machine's name, `null` for `gethostname()`. `Resolver`: the system resolver used where a lookup
blocks (an `ABI\IO\Resolver`). `Probe`: `fn (int $family): null|string` returning the local source
address for a global destination of family `4` or `6`, `null` when there is none. Throws
`InvalidArgumentException` on a value out of range.
