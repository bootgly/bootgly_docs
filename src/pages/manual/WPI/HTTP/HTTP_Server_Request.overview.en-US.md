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

### HTTP Basic Authentication

`username`: The username provided in basic authentication.

```php
$Request->username; // 'bootgly'
```

`password`: The password provided in basic authentication.

```php
$Request->password; // 'example123'
```

### HTTP Content Negotiation

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

### HTTP Caching Specification

`fresh`: Flag indicating if the request is to be considered fresh.

```php
$Request->fresh; // true
```

`stale`: Flag indicating if the request is to be considered stale.

```php
$Request->stale; // false
```

These accessible properties are integral to the behavior of the HTTP Request class and provide a robust API for the convenient development of web applications.
