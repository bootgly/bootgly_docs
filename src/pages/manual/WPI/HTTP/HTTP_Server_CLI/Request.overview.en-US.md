# HTTP Server CLI — Request

The `Request` object is automatically available in every route handler of the HTTP Server CLI. It provides a concise structure to access common request parameters such as headers, URI, query strings, and body content.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
```

## Connection

`address`: The IP address from which the request originated.

```php
$Request->address; // '127.0.0.1'
```

`port`: The port number through which the request was transmitted.

```php
$Request->port; // '52252'
```

`scheme`: The protocol scheme, either `http` or `https`.

```php
$Request->scheme; // 'https'
```

## HTTP

`method`: The HTTP method used for the request.

```php
$Request->method; // 'GET'
```

`URI`: The Uniform Resource Identifier of the request. In the context of an HTTP Server, a URI will always have a scheme `http` or `https`, the domain and port will always be the same for the same Virtual Host (VHost). Therefore, a URI (identifier) in Bootgly is always everything that comes after the `domain:port` without the anchor/fragment (#):

```php
$Request->URI; // '/test/foo?query=abc&query2=xyz'
```

`protocol`: The protocol version used in the request, usually HTTP/1.1.

```php
$Request->protocol; // 'HTTP/1.1'
```

### Resource

`URL`: The URL (Uniform Resource Locator) path part of the URI. Still based on the above context of a URI on HTTP Servers in Bootgly and as a URL is a subset of a URI, in Bootgly a URL (locator) is the path where the resource is located, without the query string:

```php
$Request->URL; // '/test/foo'
```

`URN`: The URN (Uniform Resource Name) last path part of the URL. Based on the above context of a URL, a URN (name) is the last part (node) of a URL path and identifies the name of the resource. Obviously, this semantics only remains if its use in practice follows this same pattern.

```php
$Request->URN; // 'foo'
```

### Query

`query`: The query string portion of the URI.

```php
$Request->query; // 'query=abc&query2=xyz'
```

`queries`: An associative array of the parsed query string.

```php
$Request->queries; // Array ( [query] => abc [query2] => xyz )
```

## HTTP Header

`Header`: The Header class.

```php
$Request->Header->get('X-Requested-With'); // Get value of X-Requested-With Header
```

`headers`: The HTTP Headers in array.

```php
$Request->headers;
/*
Array (
  User-Agent] => BootglyHTTPClient/1.0
  [Accept] => */*,
  [Set-Cookie] => Array (
    [0] => user_id=123; Expires=Wed, 21 Oct 2024 07:28:00 GMT
    [1] => session_token=abc; HttpOnly
  )
)
*/
```

### Host Information

`host`: The fully qualified domain name of the server.

```php
$Request->host; // 'v1.docs.bootgly.com'
```

`domain`: The domain part of the host.

```php
$Request->domain; // 'bootgly.com'
```

`subdomain`: The subdomain part of the host.

```php
$Request->subdomain; // 'v1.docs'
```

`subdomains`: An array containing individual subdomain components.

```php
$Request->subdomains; // Array ( [0] => 'docs' [1] => 'v1' )
```

### Cookies

`Cookies`: The class that represents the HTTP Header Cookies of the request.

```php
$Request->Header->Cookies;
```

`cookies`: An array of cookies sent with the request.

```php
$Request->cookies; // Array ( [cookie_name] => cookie_value )
```

## HTTP Body

`Body`: The class that represents the HTTP Body of the request.

```php
$Request->Body;
```

### Input

`input`: The raw input content data from the request.

```php
$Request->input; // Raw input content data as string
```

`inputs`: An associative array of input key-value pairs.

```php
$Request->inputs; // Array ( [input_key] => input_value )
```

### POST

`post`: An associative array of POST data

```php
$Request->post; // Array ( [post_key] => post_value )
```

### Files

`files`: An associative array of files uploaded through the request.

```php
$Request->files; // Array ( [file_name] => file_attributes )
```

## Metadata

`raw`: The raw HTTP request data.

```php
$Request->raw; // HTTP request data as string
```

`on`: The date on which the request was created.

```php
$Request->on; // '2020-03-10'
```

`at`: The time at which the request was created.

```php
$Request->at; // '17:16:18'
```

`time`: A Unix timestamp representing the time of request.

```php
$Request->time; // 1586496524
```

`secure`: Indicates if the request was made over HTTPS.

```php
$Request->secure; // true
```

## HTTP Basic Authentication

```php
public function authenticate () : object|null;
```

This method is responsible for extracting and decoding authorization credentials from an HTTP Request. It checks if the credentials are provided in the Basic Authentication format and, if so, extracts the username and password.

### Example of use

```php
$Credentials = $Request->authenticate();

if ($Credentials !== null) {
    $username = $Credentials->username;
    $password = $Credentials->password;

    // Use the username and password to authenticate the client
    // ...
}
```

### Generated metadata

`username`: The username provided in basic authentication.

```php
$Request->username; // 'bootgly'
```

`password`: The password provided in basic authentication.

```php
$Request->password; // 'example123'
```

## HTTP Content Negotiation

```php
public function negotiate (int $with = self::ACCEPTS_TYPES) : array;
```

The negotiate method is responsible for parsing the client's HTTP request headers and negotiating preferences regarding media types, languages, charsets, and encodings.

The negotiate method checks the relevant HTTP request header (such as `Accept`, `Accept-Language`, `Accept-Charset`, or `Accept-Encoding`) to retrieve the client's preferences. It then parses the values using regular expressions to extract the items and their respective qualities (if specified). The results are sorted by quality and returned as an array.

If the request header is empty or cannot be parsed, the method returns an empty array.

### Example of use

```php
// Assume a client makes a request to the server
// and the server receives the request object

// Negotiate the client's preferred language
$preferred_languages = $Request->negotiate(Request::ACCEPTS_LANGUAGES);

// Determine the best language to use based on server-supported languages
$available_languages = ['en', 'fr', 'de']; // Assume these are the languages the server supports

$selected_language = '';
foreach ($preferred_languages as $language => $quality) {
  if ( in_array($language, $available_languages) ) {
    $selected_language = $language;
    break;
  }
}

// Set the response language
if ( ! empty($selected_language) ) {
  // Set the response headers to indicate the selected language
  $Response->Header->set('Content-Language', $selected_language);
}

// Now, the server can generate a response in the selected language
// and send it back to the client
// ...
```

### Parameters

#### $with (opcional)

An integer indicating the type of negotiation to be performed. Possible values are:

- `self::ACCEPTS_TYPES`: Negotiate media types (default).
- `self::ACCEPTS_LANGUAGES`: Negotiate languages.
- `self::ACCEPTS_CHARSETS`: Negotiate charsets.
- `self::ACCEPTS_ENCODINGS`: Negotiate encodings.

### Generated / availables metadata

`types`: The MIME type preferred by the HTTP Client in order of relevance.

```php
$Request->types; // Array ( [0] => 'text/html' [1] => 'text/plain' )
```

`type`: The MIME type most preferred by the HTTP Client.

```php
$Request->type; // 'text/html'
```

`languages`: The languages preferred by the HTTP Client in order of relevance.

```php
$Request->languages; // Array ( [0] => 'en-US' [1] => 'pt-BR' )
```

`language`: The language most preferred by the HTTP Client.

```php
$Request->language; // 'en-US'
```

`charsets`: The charsets preferred by the HTTP Client in order of relevance.

```php
$Request->charsets; // Array ( [0] => 'UTF-8' [1] => 'ISO-8859-15' )
```

`charset`: The charset most preferred by the HTTP Client.

```php
$Request->charset; // 'UTF-8'
```

`encodings`: The encodings preferred by the HTTP Client in order of relevance.

```php
$Request->encodings; // Array ( [0] => 'gzip' [1] => 'deflate' )
```

`encoding`: The encoding most preferred by the HTTP Client.

```php
$Request->encoding; // 'gzip'
```

### Notes

- This method is useful for servers that wish to provide content tailored to the client's preferences, such as sending the correct version of an image file based on the format accepted by the user's browser.
- Make sure to use the return values of this method according to your application's business logic, such as selecting the best response format based on the client's preferences.

## HTTP Caching

```php
public function freshen () : bool;
```

The freshen() method is responsible for determining whether a client request is considered "fresh" or not, based on certain headers and cache settings. This is useful for deciding whether to provide a completely new response or if a cached response can be used.

### Return

- Returns true if the request is considered fresh and can be served with a `cached` response.
- Returns false if the request is not considered fresh, and a `new response` should be generated.

### Evaluation Criteria

- The request must be of type `GET` or `HEAD`. Other request types are not considered fresh.
- The `Cache-Control` header should not contain the `no-cache` directive, indicating that the response should not be served from the cache.
- The `If-None-Match` (ETag) header is checked against the ETag of the cached response. If the ETags match, the cached response is considered valid.
- The `If-Modified-Since` header is compared with the `Last-Modified` header of the cached response. If the modification date of the response is more recent than the date specified in the `If-Modified-Since` header, the cached response is considered valid.

### Example with Last-Modified

```php
// Suppose the HTTP client request arrives like this...:

/*
GET / HTTP/1.1
Host: lab.bootgly.com:8080
User-Agent: insomnia/2023.4.0
If-Modified-Since: Fri, 14 Jul 2023 09:00:00 GMT
Accept: text/html

...
*/

$Response->Header->set('Last-Modified', 'Fri, 14 Jul 2023 08:00:00 GMT');

if ($Request->fresh) {
   return $Response(code: 304); // First onward is here
}
else {
   return $Response(body: 'test')->send(); // First Response here
}
```

### Metadados gerados

`fresh`: Flag indicating if the request is to be considered fresh.

```php
$Request->fresh; // true
```

`stale`: Flag indicating if the request is to be considered stale.

```php
$Request->stale; // false
```

## Security Configuration

### Host Allowlist

```php
public static array $allowedHosts = [];
```

When non-empty, any request whose `Host` header (case-insensitive, port-agnostic) does not match an entry in the list is rejected with `400 Bad Request` at decode time — before any handler or middleware runs.

This blocks Host-header spoofing attacks such as cache poisoning and password-reset poisoning in multi-tenant applications (RFC 9112 §3.2 / §7.2).

Each entry is a **lowercase hostname without port**. Wildcard prefix `*.example.com` matches any single-label subdomain (`api.example.com`) but NOT the apex domain itself (`example.com`) and NOT multi-label subdomains (`a.b.example.com`). An empty list (the default) disables enforcement for backward compatibility — zero overhead on the hot path.

#### Example

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;

// ? Allow only known hosts
Request::$allowedHosts = [
   'example.com',
   '*.example.com',  // matches api.example.com, app.example.com, etc.
   'localhost',
];
// @ Any request with a Host header not in this list receives 400 Bad Request
```

#### IPv6 support

IPv6 bracketed literals are handled correctly — the port portion after the closing `]` is stripped before matching:

```php
Request::$allowedHosts = [
   '[::1]',
   'localhost',
];
```

#### Disabling enforcement

```php
// : Reset to default — no enforcement
Request::$allowedHosts = [];
```

> **Note:** Set `$allowedHosts` before the server starts (e.g. in your bootstrap or project file). The value is inherited by all worker processes.

## Session

`Session`: The session object, lazy-initialized and file-based.

```php
$Request->Session; // Session object
```

## Request Validation

Bootgly ships a fluent validation system for verifying request data before your handler runs. It revolves around three pieces:

- `Validation` — runs a set of rules against an array of input data, accumulating errors per field.
- `Validators\*` — built-in rule classes (`Required`, `Email`, `Integer`, `Minimum`, `Maximum`, `Regex`, `Size`, `MIME`, `Extension`).
- `Validator` middleware — applies validation to one Request source and fails fast (default `422 Unprocessable Entity`) if invalid. See [Middlewares → Validator](../Middlewares/#validator).

### Standalone Validation

Run validation directly on any associative array — useful in CLI scripts, jobs, or when you need access to the validation result inside a handler:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Email;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Integer;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Maximum;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Minimum;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Required;

$Validation = new Validation(
   source: $Request->fields,
   rules: [
      'email' => [new Required, new Email],
      'age'   => [new Required, new Integer, new Minimum(18), new Maximum(120)],
   ]
);

$Validation->valid;  // true | false
$Validation->errors; // ['email' => ['email must be a valid email address.'], ...]
```

Errors are stored as `array<field, array<string>>` — a single field can accumulate multiple messages (one per failed rule).

### Available Sources

The `Sources` enum identifies which Request property the `Validator` middleware reads:

| Source | Request property | Description |
|---|---|---|
| `Sources::Fields` | `$Request->fields` | Parsed form fields / decoded body |
| `Sources::Queries` | `$Request->queries` | Query-string parameters |
| `Sources::Headers` | `$Request->headers` | HTTP request headers |
| `Sources::Cookies` | `$Request->cookies` | Request cookies |
| `Sources::Files` | `$Request->files` | Uploaded file structures |

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Sources;
```

### Built-in Validators

All built-in rules live in `Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators`. Each accepts an optional `string $message` constructor argument to override the default error message.

---

#### Required

Rejects `null`, empty strings (after `trim`), and empty arrays. Implicit — runs even when the field is missing.

```php
new Required;
new Required('Name cannot be empty.');
```

Default message: `"{field} is required."`

---

#### Email

Validates with PHP's `filter_var($value, FILTER_VALIDATE_EMAIL)`.

```php
new Email;
```

Default message: `"{field} must be a valid email address."`

---

#### Integer

Accepts native `int` or strings matching `/\A[-+]?\d+\z/`.

```php
new Integer;
```

Default message: `"{field} must be an integer."`

---

#### Minimum

Lower-bound rule. Compares numeric values by value, non-numeric strings by `strlen`, and arrays by `count`.

```php
new Minimum(18);
new Minimum(8, 'Password must be at least 8 characters.');
```

Default message: `"{field} must be at least {limit}."`

---

#### Maximum

Upper-bound counterpart of `Minimum`, with the same dispatch (numeric, string length, or array count).

```php
new Maximum(120);
new Maximum(500, 'Bio cannot exceed 500 characters.');
```

Default message: `"{field} must be at most {limit}."`

---

#### Regex

Matches the value against a PCRE pattern. Throws `InvalidArgumentException` at construction time if the pattern is invalid.

```php
new Regex('/\A[a-z0-9_-]+\z/');
new Regex('/\A[a-z0-9_]{3,}\z/', 'Username must be alphanumeric, 3+ chars.');
```

Default message: `"{field} has an invalid format."`

---

#### Size

Validates upload structures (`['name', 'type', 'size', 'error', 'tmp_name']`). Passes when `error === 0` and `size <= $limit` (bytes).

```php
new Size(2 * 1024 * 1024); // 2 MB
```

Default message: `"{field} must be at most {limit} bytes."`

---

#### MIME

Validates upload structures against an allowlist of MIME types (case-sensitive).

```php
new MIME('application/pdf');
new MIME(['image/jpeg', 'image/png']);
```

Default message: `"{field} must have an allowed MIME type."`

---

#### Extension

Validates upload structures against an allowlist of file extensions (case-insensitive; a leading `.` is accepted and stripped).

```php
new Extension('zip');
new Extension(['jpg', 'jpeg', 'png']);
```

Default message: `"{field} must have an allowed extension."`

---

### Custom Rules

Extend `Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Condition` to add your own rule. Implement `validate()` (returns `true` if valid) and `format()` (returns the error message).

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Condition;

$InviteCode = new class extends Condition {
   /**
    * @param array<string,mixed> $data  Full source array — useful for cross-field rules.
    */
   public function validate (string $field, mixed $value, array $data): bool
   {
      return is_string($value) && $value === 'bootgly';
   }

   public function format (string $field): string
   {
      return "{$field} must match the demo invite code.";
   }
};
```

Set `$implicit = true` in your subclass when the rule must run even for missing/blank fields (the way `Required` does).

### Validator Middleware

To plug validation directly into a route, use the `Validator` middleware. The handler is skipped if any rule fails:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Sources;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Email;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\BodyParser;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;

yield $Router->route('/users', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['created' => true, 'user' => $Request->fields]);
}, POST, middlewares: [
   new BodyParser,
   new Validator(rules: [
      'email' => [new Required, new Email],
   ], Source: Sources::Fields),
]);
```

See [Middlewares → Validator](../Middlewares/#validator) for the full middleware reference (status code, fallback closure).

### End-to-End Example

A complete router showcasing all validation modes — body, query string, file upload, custom rule, and a custom failure response:

```php
use function is_string;

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Sources;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Email;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Extension;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Integer;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Maximum;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\MIME;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Minimum;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Regex;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Size;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\BodyParser;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;

$Custom = new class extends Validators {
   public function validate (string $field, mixed $value, array $data): bool
   {
      return is_string($value) && $value === 'bootgly';
   }
   public function format (string $field): string
   {
      return "{$field} must match the demo invite code.";
   }
};

// Fail-closed body validation
yield $Router->route('/validation/middleware', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['created' => true, 'fields' => $Request->fields]);
}, POST, middlewares: [
   new BodyParser,
   new Validator(rules: [
      'email' => [new Required, new Email],
      'age'   => [new Required, new Integer, new Minimum(18), new Maximum(120)],
   ], Source: Sources::Fields),
]);

// Custom failure response
yield $Router->route('/validation/fallback', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['created' => true]);
}, POST, middlewares: [
   new BodyParser,
   new Validator(
      rules: ['email' => [new Required, new Email]],
      Source: Sources::Fields,
      fallback: function (Request $Request, Response $Response, Validation $Validation): Response {
         $Response->code(400);
         return $Response->JSON->send([
            'created' => false,
            'fields'  => $Request->fields,
            'errors'  => $Validation->errors,
         ]);
      }
   ),
]);

// Query validation
yield $Router->route('/validation/query', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['queries' => $Request->queries]);
}, GET, middlewares: [
   new Validator(rules: [
      'page'   => [new Integer, new Minimum(1)],
      'filter' => [new Regex('/\A[a-z0-9_-]+\z/')],
   ], Source: Sources::Queries),
]);

// File upload validation
yield $Router->route('/validation/files', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['files' => $Request->files]);
}, POST, middlewares: [
   new BodyParser,
   new Validator(rules: [
      'avatar' => [
         new Required,
         new Size(2 * 1024 * 1024),
         new MIME(['image/jpeg', 'image/png']),
         new Extension(['jpg', 'jpeg', 'png']),
      ],
   ], Source: Sources::Files),
]);

// Custom rule
yield $Router->route('/validation/custom', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['accepted' => true]);
}, POST, middlewares: [
   new BodyParser,
   new Validator(rules: [
      'code' => [new Required, $Custom],
   ], Source: Sources::Fields),
]);
```
