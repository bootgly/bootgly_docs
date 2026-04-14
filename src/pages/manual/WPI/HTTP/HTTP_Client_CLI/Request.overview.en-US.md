# HTTP Client CLI — Request

The `Request` object represents an outgoing HTTP request in the HTTP Client CLI. It is created internally when you call `$Client->request()` and holds all request data (method, URI, headers, body) along with transport state.

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request;
```

## HTTP

`method`: The HTTP method for the request.

```php
$Request->method; // 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
```

`URI`: The request URI (path + optional query string).

```php
$Request->URI; // '/api/users?page=1'
```

`protocol`: The HTTP protocol version.

```php
$Request->protocol; // 'HTTP/1.1'
```

## Headers

Access request headers through the `Header` sub-object or via the `headers` property hook:

```php
// @ Get all headers as array
$Request->headers; // ['Content-Type' => 'application/json', ...]

// @ Set a header
$Request->Header->set('Authorization', 'Bearer token123');

// @ Get a header value
$Request->Header->get('Content-Type'); // 'application/json'

// @ Append to a header (multi-value)
$Request->Header->append('Accept', 'text/html');
$Request->Header->append('Accept', 'application/json');

// @ Remove a header
$Request->Header->remove('Authorization');

// @ Build raw header string
$Request->Header->build(); // "Content-Type: application/json\r\nAccept: text/html\r\nAccept: application/json\r\n"
```

### Header API

| Method | Signature | Description |
|---|---|---|
| `set` | `set(string $name, string $value): void` | Set a header (replaces existing). |
| `get` | `get(string $name): ?string` | Get a header value (comma-joined if multi-value). |
| `append` | `append(string $name, string $value): void` | Append a value to a header. |
| `remove` | `remove(string $name): void` | Remove a header. |
| `build` | `build(): string` | Build the raw header string from fields. |

Header names and values are validated against HTTP grammar (RFC 9110). Invalid names or values containing CR/LF (CRLF injection) will throw `InvalidArgumentException`.

## Body

Access and encode the request body through the `Body` sub-object or via the `body` property hook:

```php
// @ Get body as string
$Request->body; // '{"name":"Bootgly"}'

// @ Encode raw string body
$Request->Body->encode('Hello World');

// @ Encode JSON body
$Request->Body->encode(['name' => 'Bootgly'], 'json');

// @ Encode form-urlencoded body
$Request->Body->encode(['user' => 'admin', 'pass' => 'secret'], 'form');

// @ Body metadata
$Request->Body->length; // 18 (byte length)
```

### Body Encoding Types

| Type | Input | Output |
|---|---|---|
| `'raw'` (default) | `string` | Raw string as-is |
| `'json'` | `array` | JSON-encoded string |
| `'form'` | `array` | URL-encoded query string (`key=value&key2=value2`) |

When using `$Client->request()` with a `body` parameter, the content type is auto-detected:

| Body Type | Auto Content-Type |
|---|---|
| `string` | `text/plain` |
| `array` | `application/json` |

## Invocable

The Request is invocable — you can configure it by calling it directly:

```php
$Request = new Request;
$Request('POST', '/api/users', ['Accept' => 'application/json'], ['name' => 'Bootgly']);
```

Signature:

```php
$Request(
   string $method = 'GET',
   string $URI = '/',
   array $headers = [],
   mixed $body = null
): self
```

## Transport State

These properties track the request's lifecycle during transport:

| Property | Type | Description |
|---|---|---|
| `connectionState` | `string` | `'idle'`, `'waiting'`, `'waiting-100-continue'`, `'redirect'` |
| `completed` | `bool` | Whether the response has been fully received. |
| `pendingBuffer` | `string` | Accumulated bytes not yet processed. |
| `bytesReceived` | `int` | Total bytes received for this request. |
| `sentAt` | `float` | Timestamp (microtime) when the request was sent. |
| `redirectCount` | `int` | Number of redirects followed so far. |
| `retryCount` | `int` | Number of retries attempted. |

## Response

Each Request holds a reference to its paired Response:

```php
$Request->Response->code;      // 200
$Request->Response->body;      // 'Hello World'
$Request->Response->headers;   // ['content-type' => 'text/plain', ...]
```

See the [Response documentation](Response.overview.en-US.md) for full details.

## Reset

Reset the request to its default state for reuse:

```php
$Request->reset();
// @ All properties are restored to defaults.
// @ The paired Response is also reset.
```
