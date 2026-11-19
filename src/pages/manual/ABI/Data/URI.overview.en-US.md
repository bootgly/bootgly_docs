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

## Redact credentials

A URL can carry a password or a token in its userinfo (`user:password@`). Before a URL — or any
text that may hold one: a log line, an error message, a report — is shown, written to a log or
printed in a report, pass it through `URI::redact()`. It drops the userinfo and keeps everything
else:

```php
use Bootgly\ABI\Data\URI;

URI::redact('https://user:SYNTH-TOKEN@api.example.com/v1/orders');
// 'https://api.example.com/v1/orders'

URI::redact('redis://:SYNTH-PASSWORD@127.0.0.1:6379/0');
// 'redis://127.0.0.1:6379/0'
```

The input does not have to be a URI. Every URL in the text is covered, wherever it sits, and the
rest of the text is kept as is:

```php
URI::redact('see https://a@h1 and https://b@h2/x');
// 'see https://h1 and https://h2/x'

URI::redact("fatal: could not read Password for 'https://SYNTH-TOKEN@git.example.com'");
// "fatal: could not read Password for 'https://git.example.com'"
```

How it reads the text:

- Each `://` opens an authority that runs to the next `/`; everything up to the **last** `@` in it is
  dropped, so a password that contains `@` goes whole (`https://u:p@ss@example.com/x` →
  `https://example.com/x`).
- Extra slashes after `://` are skipped (`https:///user:SYNTH@host/p` → `https:///host/p`), except in
  a `file:` URL, where the part after its second slash is a path and is never touched
  (`file:///home/shop/user@example.com/data.txt` stays as it is).
- A text with no `@` or no `://` comes back unchanged — an scp-like `git@example.com:shop/app.git`
  has no `://`, so it is not a URL this method sees.
- No regular expression runs: a malformed or hostile text costs one linear pass and can never come
  back unredacted because a pattern gave up.

It errs on the safe side. An `@` after a `?` or a `#` but before the next `/` still cuts, and so does
a later `@` on the same line when no `/` comes in between — the text in between goes with it:

```php
URI::redact('https://h/?a@b');      // 'https://h/?a@b' — the `/` ended the authority
URI::redact('https://h?x@y/z');     // 'https://y/z'
URI::redact('Pulled from https://git.example.com, mail ops@example.com');
// 'Pulled from https://example.com'
```

The result is for display only: it is not a parser or a validator. Never parse it, store it as
configuration or connect with it — keep the original URL for that, and `parse()` it. The framework's
git remote listings and output, and the benchmark run manifests, show URLs through this method.

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
public static function redact (string $text): string
```

Removes the userinfo of every URL in a text, for display: for each `://`, everything up to the last
`@` before the next `/` is dropped (in a `file:` URL, the part after its second slash is a path and
is kept). Lexical and linear, with no regular expression; the text comes back unchanged when it has
no `@` or no `://`. It neither validates nor dials anything — never parse or connect with the result.

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
