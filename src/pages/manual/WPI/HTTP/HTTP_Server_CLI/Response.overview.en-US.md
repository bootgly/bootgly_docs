# HTTP Server CLI — Response

## Overview

The `Response` object is automatically available in every route handler of the HTTP Server CLI. It provides an easy-to-use API for managing HTTP responses — configuring statuses, headers, and body content, as well as facilitating view rendering, file uploads, authentication, and redirection.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
```

## Usage

Below are the methods provided by the `Response` object with examples demonstrating their usage.

### Invocation

```php
public function __invoke (int $code = 200, array $headers = [], string $body = '') : self;
```

**Description:**

This magic method allows the Response object to be invoked as a function, resetting the response with the provided parameters.

**Example:**

```php
return $Response(404, ['Content-Type' => 'text/plain'], 'Not Found');
```

### Append body

```php
public function append ($body);
```

**Description:**

Appends data to the response body.

**Parameters:**

- `$body` (mixed): Data to append to the response.

**Example:**

```php
return $Response->append('Additional information');
```

### Render a simple view

```php
public function render (string $view, ? array $data = null, ? \Closure $callback = null) : self;
```

**Description:**

Renders a view and appends it to the response body.

**Parameters:**

- `$view` (string): The view to render.
- `$data` (array|null, optional): Data to pass to the view.
- `$callback` (Closure|null, optional): An additional callback executed after rendering the view.

**Example:**

```php
return $Response->render('welcome', ['title' => 'Welcome Page']);
```

### Send content

```php
public function send ($body = null, ...$options) : self;
```

**Description:**

Finalizes the response by setting the body content and sending the response to the client.

**Parameters:**

- `$body` (mixed|null, optional): Optional body content to send.
- `...$options` (mixed): Additional options that may be passed, specifics depend on implementation.

**Examples:**

```php
return $Response->send('{"status":"success"}');
```

```php
return $Response->JSON->send(['Hello' => 'World!']);
```

### Upload files

```php
public function upload (string|File $file, int $offset = 0, ? int $length = null) : self;
```

```php
public function upload (string|File $file, int $offset = 0, ? int $length = null, bool $close = true) : self;
```

**Description:**

Upload a file to the HTTP client.

**Parameters:**

- `$file` (string|File): The file or file path to upload.
- `$offset` (int): The data offset.
- `$length` (int|null): The length of the data to upload.
- `$close` (bool): Close the connection after sending.

**Example 1:**

```php
return $Response->upload('/path/to/file.pdf');
```

**Example 2:**

```php
return $Response('statics/alphanumeric.txt')->upload(offset: 0, length: 2);
```

### HTTP Basic Authentication

```php
public function authenticate (Authentication $Method) : self
```

**Description:**

Sends an authentication challenge to the client, typically in response to a protected resource being accessed without proper credentials.

**Parameters:**

- `$Method` (Authentication): A HTTP Authentication Method. For now only accepts "Basic" (see example).

**Example:**

```php
use Bootgly\WPI\Modules\HTTP\Server\Response\Authentication;

return $Response
   ->authenticate(new Authentication\Basic(realm: "Bootgly Protected Area"));
```

### Redirect to new URI

```php
public function redirect (string $URI, ? int $code = null) : self;
```

**Description:**

Redirects the client to a new URI.

**Parameters:**

- `$URI` (string): The URI to redirect to.
- `$code` (int|null, optional): HTTP status code for the redirection. Defaults to 307 for GET or 303 for POST redirects.

**Example:**

```php
return $Response->redirect('https://example.com/newpage?query1=value1#anchor1', 301);
```

### Terminate the HTTP Response

```php
public function end (? int $code = null) : void;
public function end (? int $code = null) : self;
```

**Description:**

Terminates the HTTP response, optionally setting a response status code before ending the response.

**Parameters:**

- `$code` (int|null, optional): The status code to send before ending the response.

## Deferred Responses (Async)

```php
public function defer (Closure $work): Response;
```

Executes `$work` asynchronously via a PHP Fiber, allowing the event loop to handle other connections while this response is being prepared.

Inside `$work()`, call `Fiber::suspend()` to yield control back to the event loop:

- **Suspend with `null`** → the Fiber resumes on the next event loop tick (tick-based scheduling).
- **Suspend with a `resource`** → the Fiber resumes when `stream_select()` detects I/O readiness on that resource (I/O-bound scheduling).

The response is sent automatically when `$work()` returns. If an exception is thrown, a `500 Internal Server Error` is returned.

### Tick-based example

Useful for CPU-bound work that should not block other connections:

```php
yield $Router->route('/defer/tick', function ($Request, $Response) {
   return $Response->defer(function () use ($Response) {
      $partial = '';
      for ($i = 1; $i <= 5; $i++) {
         $partial .= "chunk {$i}\n";
         Fiber::suspend(); // Resume on next tick
      }
      $Response->body = $partial;
   });
}, GET);
```

### I/O-aware example

Useful for waiting on external resources (databases, APIs, sockets):

```php
yield $Router->route('/defer/io', function ($Request, $Response) {
   return $Response->defer(function () use ($Response) {
      [$read, $write] = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, STREAM_IPPROTO_IP);
      stream_set_blocking($read, false);

      // Simulate async I/O: write in a non-blocking way
      fwrite($write, 'Hello from async I/O!');
      fclose($write);

      // Suspend until the read socket has data
      Fiber::suspend($read);

      $data = stream_get_contents($read);
      fclose($read);

      $Response->body = $data;
   });
}, GET);
```
