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

### Render a view

```php
$Response->View->render(string $view, null|array $data = null, null|Closure $callback = null): Response;
```

**Description:**

Renders a project view through the built-in `View` response resource and appends it to the
response body.

**Parameters:**

- `$view` (string): The view to render.
- `$data` (array|null, optional): Data to pass to the view.
- `$callback` (Closure|null, optional): An additional callback executed after rendering the view.

**Example:**

```php
return $Response->View->render('welcome', ['title' => 'Welcome Page']);
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

### Deferred I/O resources

Use `defer()` for response work that must wait for external I/O. Response Resources loaded
with `responseResources` can bridge that I/O to the response scheduler, but the response is
still finalized with the normal `send()` flow.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return $Response->defer(function (Response $Response): void {
   $Database = $Response->Database;
   $Result = $Database->fetch('SELECT 1 AS ok');

   $Response->JSON->send([
      'rows' => $Result->rows,
   ]);
});
```

See **[Response Resources](./Resources/)** for built-in resources and the DBAL bridge.

### Upload files

```php
public function upload (string $file, int $offset = 0, null|int $length = null, bool $close = true) : self;
```

**Description:**

Upload a file to the HTTP client.

**Parameters:**

- `$file` (string): The file path to upload.
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

**Byte ranges:**

A client `Range` header overrides `$offset` / `$length`. The accepted set is coalesced — overlapping and adjacent ranges are merged — and a set larger than [`Request::$maxRanges`](../Request/#byte-range-limit) (16 by default) is rejected with `416 Range Not Satisfiable`. A `Range` value that is not even a ranges-specifier — no `=` separator at all, e.g. `Range: bytes 0-1` — is rejected with `400 Bad Request` (RFC 9110 §14.2 allows a server to ignore or reject it; Bootgly rejects).

**Representation identity:**

`upload()` resolves the path, opens it once and records the identity of what it opened — device, inode, mode, size, modification time and change time — then closes the descriptor. Nothing is kept open while the response waits on a slow client, so the server reopens the file for each chunk it writes and checks that identity again every time, on both HTTP/1 and HTTP/2.

If the file no longer matches, the response is refused rather than completed with the wrong bytes: on HTTP/1 the connection is closed (there is no way to retract a `Content-Length` already sent), and on HTTP/2 the stream is reset. A warning naming the path and the field that changed is logged.

Two consequences are yours to plan for:

- **Do not serve a file while it is being written.** Any change — an append, a rewrite, an atomic redeploy, even a `chmod` or `chown` that only moves the change time — aborts a transfer already in flight. `stat` cannot tell a harmless append from a substitution, so the check cannot make an exception for one. Snapshot the file first:

  ```php
  $Router->route('/logs/download', function ($Request, $Response) {
     $snapshot = 'storage/snapshots/' . bin2hex(random_bytes(8)) . '.log';
     copy(BOOTGLY_PROJECT->path . 'storage/logs/app.log', BOOTGLY_PROJECT->path . $snapshot);

     return $Response->upload($snapshot);
  });
  ```

- **Serve from a filesystem with stable inodes.** Mounts that regenerate `st_dev` / `st_ino` between two opens of the same path — some FUSE-backed remote filesystems, an overlay copy-up triggered mid-transfer — are indistinguishable from a substitution and will abort. Local filesystems (ext4, XFS, Btrfs, tmpfs) are fine.

Symbolic links are supported: the link is resolved once, while the path is being checked against the project jail, and the file it pointed to at that moment is what gets served. Repointing the link afterwards does not redirect a response already under way.

**The jail confines paths, not inodes:**

`upload()` rejects any path that resolves outside `BOOTGLY_PROJECT->path`. That check is about *names*. A hard link has no target to resolve — it is simply a second name for one inode — so a hard link created inside the served tree resolves to a path inside the jail and is served, whatever the file's other name points at:

```sh
ln /srv/app/.env  /srv/app/public/uploads/notes.txt   # now servable
```

Linux blocks the interesting half of this by default: with `fs.protected_hardlinks=1` (the default on current kernels) you may only hard-link a file you own or can already read, so this cannot be used to reach a file you were denied. What remains is a change of *exposure* — code running as the application can turn a file it could already read locally into one the world can fetch.

So: **do not let less-trusted code write into a served tree.** A directory that accepts uploads should not be the same directory a route serves back, and neither should sit next to application secrets. If you cannot separate them, serve uploads through a handler that reads and returns the bytes itself, rather than through `upload()`.

### HTTP Authentication

```php
public function authenticate (Authentication $Method) : self
```

**Description:**

Sends an authentication challenge to the client, typically in response to a protected resource being accessed without proper credentials.

**Parameters:**

- `$Method` (Authentication): A HTTP Authentication Method. Supported method: Basic.

**Basic example:**

```php
use Bootgly\WPI\Modules\HTTP\Server\Response\Authentication;

return $Response
   ->authenticate(new Authentication\Basic(realm: "Bootgly Protected Area"));
```

Bearer challenges are emitted by `Router\Middlewares\Authentication\Bearer` and `Router\Middlewares\Authentication\JWT`. See [Authentication](../Authentication/) for middleware guards and challenge details.

### Redirect to new URI

```php
public function redirect (string $URI, int|null $code = null, bool $allowExternal = false) : self;
```

**Description:**

Redirects the client to a new URI.

By default, **external URLs are blocked** to prevent open redirect vulnerabilities. If the `$URI` starts with `http://`, `https://`, or `//`, it is replaced with `/` unless `$allowExternal` is explicitly set to `true`.

**Parameters:**

- `$URI` (string): The URI to redirect to.
- `$code` (int|null, optional): HTTP status code for the redirection. Defaults to 307 for GET or 303 for POST redirects.
- `$allowExternal` (bool, default `false`): Whether to allow redirects to external URLs. When `false`, absolute URLs with a scheme are rejected and replaced with `/`.

**Examples:**

Internal redirect (relative URI):

```php
return $Response->redirect('/dashboard');
```

Internal redirect with specific status code:

```php
return $Response->redirect('/new-location', 301);
```

External redirect (must opt-in with `allowExternal: true`):

```php
return $Response->redirect('https://docs.bootgly.com/', allowExternal: true);
```

External redirect with specific status code:

```php
return $Response->redirect('https://docs.bootgly.com/', 302, allowExternal: true);
```

> ⚠️ **Security:** Never pass user-supplied input directly to `redirect()` without validation. If the redirect target may be controlled by the user (e.g., a `?next=` parameter), validate that the URI is relative or matches an allowed host before calling `redirect()`.

### Terminate the HTTP Response

```php
public function end (null|int $code = null, null|string $context = null) : self;
```

**Description:**

Definitively terminates the HTTP response. When `$code` is given, it is set as the response status exactly as passed — headers and body already set by the handler are kept as-is.

`416 Range Not Satisfiable` is the one preset code: `end(416, (string) $size)` cleans the headers already set, ships a minimal one-space body and — when `$context` is given — emits `Content-Range: bytes */{$context}`.

**Parameters:**

- `$code` (int|null, optional): The status code to send before ending the response.
- `$context` (string|null, optional): Context for preset codes — for `416`, the representation size used to build the `Content-Range` header. Ignored for every other code.

## Deferred Responses (Async)

```php
public function defer (Closure $work, int|float $timeout = 0): Response;
```

Executes `$work` asynchronously via a PHP Fiber, allowing the event loop to handle other connections while this response is being prepared.

Inside `$work()`, call `$Response->wait()` to yield control back to the event loop:

- **Wait with `null`** → the Fiber resumes on the next event loop tick (tick-based scheduling).
- **Wait with a `resource`** → the Fiber resumes when `stream_select()` detects I/O readiness on that resource (I/O-bound scheduling).

The response is sent automatically when `$work()` returns. If an exception is thrown, a `500 Internal Server Error` is returned.

`$timeout` bounds, in seconds, how long the work may stay parked (`0` uses the server-wide `deferredTimeout`, where `0` means unbounded): when it elapses a `Response\Timeout` is thrown at the wait point — catch it to answer yourself, or let it answer `503 Service Unavailable`. A parked deferral is never cut by the connection idle reaper. See *Deferred Response Lifecycle* on the [HTTP Server CLI](/manual/WPI/HTTP/HTTP_Server_CLI) page.

### Tick-based example

Useful for CPU-bound work that should not block other connections:

```php
yield $Router->route('/defer/tick', function ($Request, Response $Response) {
   return $Response->defer(function (Response $Response): void {
      $partial = '';
      for ($i = 1; $i <= 5; $i++) {
         $partial .= "chunk {$i}\n";
         $Response->wait(); // Resume on next tick
      }
      $Response->send($partial);
   });
}, GET);
```

### I/O-aware example

Useful for waiting on external resources (databases, APIs, sockets):

```php
yield $Router->route('/defer/io', function ($Request, Response $Response) {
   return $Response->defer(function (Response $Response): void {
      [$read, $write] = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, STREAM_IPPROTO_IP);
      stream_set_blocking($read, false);

      // Simulate async I/O: write in a non-blocking way
      fwrite($write, 'Hello from async I/O!');
      fclose($write);

      // Suspend until the read socket has data
      $Response->wait($read);

      $data = stream_get_contents($read);
      fclose($read);

      $Response->send($data);
   });
}, GET);
```

### wait()

```php
public function wait (mixed $value = null): Response;
```

Yields control back to the event loop from inside a `defer()` closure. The behavior depends on the value passed:

- **`$Response->wait()`** — tick-based: the Fiber resumes on the next event loop iteration.
- **`$Response->wait($stream)`** — I/O-bound: the Fiber resumes when `stream_select()` detects readiness on the given stream resource.
- **`$Response->wait($Readiness)`** — explicit I/O-bound scheduling through a DBAL or event-loop readiness object.

If called outside of a deferred context (`$this->deferred === false`), the method returns immediately with no effect.

**Parameters:**

- `$value` (Readiness|resource|null, default `null`): A readiness request, PHP stream resource, or `null` for tick-based scheduling.
