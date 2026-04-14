# HTTP Client CLI — Response

The `Response` object holds the data received from an HTTP server after a request is completed. Each `Request` has a paired `Response` that is automatically populated during response decoding.

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request\Response;
```

## HTTP

`protocol`: The HTTP protocol version of the response.

```php
$Response->protocol; // 'HTTP/1.1'
```

`code`: The HTTP status code.

```php
$Response->code; // 200
```

`status`: The HTTP status reason phrase.

```php
$Response->status; // 'OK'
```

### Special status values

| `code` | `status` | Meaning |
|---|---|---|
| `0` | `'Timeout'` | The request timed out before receiving a response. |
| `0` | `''` | Connection failure — the request was never sent. |

## Headers

Access response headers through the `Header` sub-object or via the `headers` property hook:

```php
// @ Get all headers as array (keys are lowercase)
$Response->headers;
// ['content-type' => 'application/json', 'x-request-id' => 'abc123', ...]

// @ Get a single header value
$Response->Header->get('Content-Type'); // 'application/json'

// @ Get a header (case-insensitive)
$Response->Header->get('content-type'); // 'application/json'

// @ Get all values for a multi-value header (e.g. Set-Cookie)
$Response->Header->getAll('Set-Cookie');
// ['session=abc; Path=/', 'theme=dark; Path=/']
```

### Header API

| Method | Signature | Description |
|---|---|---|
| `get` | `get(string $name): ?string` | Get a header value. Returns comma-joined string for multi-value headers. Case-insensitive. |
| `getAll` | `getAll(string $name): array` | Get all values for a header as an array. Use for headers like `Set-Cookie` that should not be combined. |

### Multi-value headers

Headers that appear multiple times in the response (e.g. `Set-Cookie`) are stored as arrays:

```php
// @ If the response contains:
// Set-Cookie: session=abc; Path=/
// Set-Cookie: theme=dark; Path=/

$Response->Header->get('Set-Cookie');
// 'session=abc; Path=/, theme=dark; Path=/'

$Response->Header->getAll('Set-Cookie');
// ['session=abc; Path=/', 'theme=dark; Path=/']
```

### OWS Trimming

Response header values are trimmed of optional whitespace (SP/HTAB) per RFC 9110:

```php
// @ Raw header: "Content-Type:   application/json  "
$Response->Header->get('Content-Type'); // 'application/json'
```

## Body

Access the response body through the `Body` sub-object or via the `body` property hook:

```php
// @ Get body as raw string
$Response->body; // '{"id":1,"name":"Bootgly"}'

// @ Body metadata
$Response->Body->length;      // 25 (content length in bytes)
$Response->Body->downloaded;  // 25 (bytes downloaded so far)
$Response->Body->waiting;     // false (true while body is incomplete)
```

### Decoding

Decode the response body into structured data:

```php
// @ Decode JSON body
$data = $Response->Body->decode('json');
// ['id' => 1, 'name' => 'Bootgly']

// @ Decode JSON as object
$data = $Response->Body->decode('json', associative: false);
// stdClass { id: 1, name: 'Bootgly' }

// @ Default (returns raw string)
$raw = $Response->Body->decode('raw');
// '{"id":1,"name":"Bootgly"}'
```

| Type | Returns | Description |
|---|---|---|
| `'json'` | `mixed` | JSON-decoded value. Returns `null` if body is empty or invalid JSON. |
| `default` | `string` | Raw body string. |

## Connection State

`closeConnection`: Whether the server indicated the connection should be closed.

```php
$Response->closeConnection; // false (keep-alive) or true (Connection: close)
```

## Transfer Encoding

The client automatically handles different transfer encodings:

| Encoding | Detection | Behavior |
|---|---|---|
| **Chunked** | `Transfer-Encoding: chunked` | Decodes chunks, assembles final body, handles trailers. |
| **Content-Length** | `Content-Length: N` | Reads exactly N bytes for the body. |
| **Close-delimited** | No Content-Length, no chunked | Reads until connection closes. |

All decoding is transparent — `$Response->body` always contains the final, decoded body regardless of transfer encoding.

## Reset

Reset the response to its default state for reuse:

```php
$Response->reset();
// protocol = 'HTTP/1.1'
// code = 0
// status = ''
// closeConnection = false
// Headers and Body are also reset.
```

## Complete Example

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;


$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, ssl: []);

$Response = $Client->request(
   method: 'GET',
   URI: '/users/1',
   headers: ['Accept' => 'application/json']
);

// ? Check status
if ($Response->code === 200) {
   // ? Read headers
   $contentType = $Response->Header->get('Content-Type');
   $requestId = $Response->Header->get('X-Request-Id');

   // ? Decode body
   $user = $Response->Body->decode('json');
   echo $user['name']; // 'Bootgly'
}
else if ($Response->code === 0) {
   echo "Request failed: {$Response->status}"; // 'Timeout' or ''
}
else {
   echo "Error: {$Response->code} {$Response->status}";
}
```
