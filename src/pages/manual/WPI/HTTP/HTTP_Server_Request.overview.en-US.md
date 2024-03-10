# HTTP Request Class Documentation

This class represents an HTTP request made to a web server. It provides a concise structure to access common request parameters such as headers, URI, query strings, and body content. This documentation outlines the accessible properties within the class, providing PHP examples for each.

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
