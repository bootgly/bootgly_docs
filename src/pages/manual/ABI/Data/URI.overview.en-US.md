# URI

`URI` is Bootgly's RFC 3986 URI value: one absolute, hierarchical URI with a host —
`scheme://[userinfo@]host[:port]path[?query]` — split into its parts, and the one resolver the
framework uses to turn a URI-reference into a target. The HTTP client resolves every redirect
`Location` through it, and so does the JWT key-set fetcher.

## Parse a URI

Untrusted input — a header, a configured endpoint — goes through `parse()`, which answers `null`
for anything that is not a URI of that shape. The constructor throws a `ValueError` instead:

```php
use Bootgly\ABI\Data\URI;

$URI = URI::parse('HTTPS://User@Example.COM:8080/a/./b?q=1#top');

$URI->scheme;    // 'https'        — lowercased
$URI->userinfo;  // 'User'         — as sent, null when absent
$URI->host;      // 'example.com'  — lowercased
$URI->port;      // 8080           — null when absent: the scheme default applies
$URI->path;      // '/a/./b'       — as sent
$URI->query;     // 'q=1'          — null when absent, '' for a bare '?'
(string) $URI;   // 'https://User@example.com:8080/a/./b?q=1' — the fragment is dropped
```

An IPv6 literal is canonical and bracketed (`[0:0::1]` → `[::1]`). `hostname` is the host in
comparison form — no brackets, no trailing dot — so two URIs name the same host when their
`hostname`s are equal:

```php
URI::parse('http://[0:0::1]/')->hostname;       // '::1'
URI::parse('http://Example.COM./x')->hostname;  // 'example.com'
```

`parse()` refuses:

- a string without a scheme or without an authority (`/x`, `//h/x`, `mailto:a@b`, `file:///x`);
- control bytes, spaces, DEL and backslashes anywhere;
- an empty or non-ASCII host, an IPv6 zone identifier, IPvFuture or a bracketed IPv4;
- a port outside 1–65535.

The scheme itself is not judged: `gopher://h/x` is a valid URI. Which schemes to act on is the
caller's policy.

## Resolve a reference

`resolve()` applies RFC 3986 §5.2 to a URI-reference — a `Location` header, a link — and returns a
new `URI`; the base is never changed. Relative paths are merged and their dot-segments removed,
and a network-path reference (`//host/path`) takes the authority it names:

```php
$Base = new URI('https://api.example.com/v1/users/7');

(string) $Base->resolve('../orders?page=2');    // 'https://api.example.com/v1/orders?page=2'
(string) $Base->resolve('//cdn.example.com/a'); // 'https://cdn.example.com/a'
(string) $Base->resolve('HTTPS://Other.com/');  // 'https://other.com/'
```

It answers `null` when the result is not an absolute hierarchical URI with a host — there is
nothing to dial:

```php
$Base->resolve('javascript:alert(1)'); // null
$Base->resolve('https:foo');           // null — a scheme without an authority
$Base->resolve("/a\r\nSet-Cookie: x"); // null — control bytes
```

Two deliberate differences from the RFC 3986 §5.4 examples: an opaque or authority-less result
(`g:h`, `http:g`) is refused instead of returned, and fragments are dropped, since they never
travel in a request.

## Reference

```php
public function __construct (string $URI)
```

Parses one absolute hierarchical URI with a host. Throws `ValueError` when the string is not one;
the message never echoes the input.

```php
public static function parse (string $URI): null|self
```

Parses one absolute hierarchical URI with a host, or answers `null` — the form for untrusted input.

```php
public function resolve (string $reference): null|self
```

Resolves a URI-reference against this URI (RFC 3986 §5.2.2, strict parser; §5.2.4 dot-segment
removal) and returns the target, or `null` when it is not an absolute hierarchical URI with a host.

```php
public function __toString (): string
```

The URI recomposed (RFC 3986 §5.3), without a fragment.

```php
public private(set) string $scheme;
```

The scheme, lowercased (`https`).

```php
public private(set) null|string $userinfo;
```

The user information before the `@`, as sent; `null` when absent.

```php
public private(set) string $host;
```

The host, lowercased and never empty; an IPv6 literal canonical and bracketed (`[::1]`).

```php
public private(set) null|int $port;
```

The port as written (1–65535); `null` when absent or empty — the scheme default applies.

```php
public private(set) string $path;
```

The path as sent: empty or starting with `/`.

```php
public private(set) null|string $query;
```

The query after the `?`, as sent; `null` when absent, `''` when present and empty.

```php
public string $authority { get; }
```

`[userinfo@]host[:port]`.

```php
public string $hostname { get; }
```

The host in comparison form: an IPv6 literal without brackets, a fully-qualified name without its
trailing dot.
