# HTTP Response

## Overview

The `Response` interface in the Bootgly PHP Framework is designed to provide an easy-to-use API for managing HTTP responses in your web applications or APIs. It allows you to configure response statuses, headers, and body content, as well as facilitating view rendering, file uploads, user authentication, and redirection.

## Usage

Below are the methods provided by the `Response` interface with examples demonstrating their usage.

### Constructor

```php
public function __construct (int $code = 200, ?array $headers = null, string $body = '');
```

**Parameters:**

- `$code` (int, optional): The HTTP status code. Defaults to 200.
- `$headers` (array|null, optional): An associative array of headers to be set in the response.
- `$body` (string, optional): The initial content of the response body.

**Example:**

```php
$Response = new Response(200, ['Content-Type' => 'application/json'], '{"message": "OK"}');
```

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
public function render (string $view, ?array $data = null, ? \Closure $callback = null) : self;
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
public function upload (string|File $file) : self;
```

```php
public function upload (string|File $file, int $offset = 0, ? int $length = null, bool $close = true) : self;
```

**Description:**

Upload a file to the HTTP client.

**Parameters:**

- `$file` (string|File): The file or file path to upload.
- `$offset` (int): The data offset. (Only in HTTP Server CLI)
- `$length` (int|null): The length of the data to upload. (Only in HTTP Server CLI)
- `$close` (bool): Close the connection after sending. (Only in HTTP Server CLI)

**Example 1:**

```php
return $Response->upload('/path/to/file.pdf');
```

**Example 2 (only if using HTTP Server CLI):**

```php
return $Response('statics/alphanumeric.txt')->upload(offset: 0, length: 2);
```

### HTTP Basic Authentication

```php
public function authenticate (string $realm = 'Protected area') : self;
```

**Description:**

Sends an authentication challenge to the client, typically in response to a protected resource being accessed without proper credentials.

**Parameters:**

- `$realm` (string, optional): A description of the protected area. Defaults to "Protected area".

**Example:**

```php
return $Response->authenticate();
```

### Redirect to new URI

```php
public function redirect (string $URI, ?int $code = null) : self;
```

**Description:**

Redirects the client to a new URI.

**Parameters:**

- `$URI` (string): The URI to redirect to.
- `$code` (int|null, optional): HTTP status code for the redirection. Defaults to 307 for GET or 303 for POST redirects.

**Example:**

```php
return $Response->redirect('https://example.com/newpage', 301);
```

### Terminate the HTTP Response

```php
public function end (int|string|null $status = null) : void;
```

**Description:**

Terminates the HTTP response, optionally setting a response status before ending the response.

**Parameters:**

- `$status` (int|string|null, optional): The status to send before ending the response.
