# HTTP Request Class Documentation

This class represents an HTTP request made to a web server. It provides a concise structure to access common request parameters such as headers, URI, query strings, and body content. This documentation outlines the accessible properties within the class, providing PHP examples for each.

This page is formatted to show the Code API of the Request class.

## Address

`address`: The IP address from which the request originated.

```php
$Request->address; // '127.0.0.1'
```

## Port

`port`: The port number through which the request was transmitted.

```php
$Request->port; // '52252'
```

## Scheme

`scheme`: The protocol scheme, either `http` or `https`.

```php
$Request->scheme; // 'https'
```

## HTTP

### raw

`raw`: The raw HTTP request data.

```php
$Request->raw; // HTTP request data as string
```

### method

`method`: The HTTP method used for the request.

```php
$Request->method; // 'GET'
```

### URI

`URI`: The Uniform Resource Identifier of the request. In the context of an HTTP Server, a URI will always have a scheme `http` or `https`, the domain and port will always be the same for the same Virtual Host (VHost). Therefore, a URI (identifier) in Bootgly is always everything that comes after the `domain:port` without the anchor/fragment (#):

```php
$Request->URI; // '/test/foo?query=abc&query2=xyz'
```

- Query

`query`: The query string portion of the URI.

```php
$Request->query; // 'query=abc&query2=xyz'
```

`queries`: An associative array of the parsed query string.

```php
$Request->queries; // Array ( [query] => abc [query2] => xyz )
```

#### URL

`URL`: The URL (Uniform Resource Locator) path part of the URI. Still based on the above context of a URI on HTTP Servers in Bootgly and as a URL is a subset of a URI, in Bootgly a URL (locator) is the path where the resource is located, without the query string:

```php
$Request->URL; // '/test/foo'
```

#### URN

`URN`: The URN (Uniform Resource Name) last path part of the URL. Based on the above context of a URL, a URN (name) is the last part (node) of a URL path and identifies the name of the resource. Obviously, this semantics only remains if its use in practice follows this same pattern.

```php
$Request->URN; // 'foo'
```

### protocol

`protocol`: The protocol version used in the request, usually HTTP/1.1.

```php
$Request->protocol; // 'HTTP/1.1'
```

## HTTP Header

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

`Header`: The Header class.

```php
$Request->Raw->Header->{'X-Requested-With'}; // Get value of X-Requested-With Header
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

### Basic Authentication

`username`: The username provided in basic authentication.

```php
$Request->username; // 'bootgly'
```

`password`: The password provided in basic authentication.

```php
$Request->password; // 'example123'
```

### Accept-Language

`language`: The preferred language set in the request header.

```php
$Request->language; // 'pt-BR'
```

### Cookies

`cookies`: An array of cookies sent with the request.

```php
$Request->cookies; // Array ( [cookie_name] => cookie_value )
```

## HTTP Content

### Input Data

`input`: The raw input content data from the request.

```php
$Request->input; // Raw input content data as string
```

`inputs`: An associative array of input key-value pairs.

```php
$Request->inputs; // Array ( [input_key] => input_value )
```

### POST Data

`post`: An associative array of POST data

```php
$Request->post; // Array ( [post_key] => post_value )
```

#### Files

`files`: An associative array of files uploaded through the request.

```php
$Request->files; // Array ( [file_name] => file_attributes )
```

## Metadata

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

## Others

`secure`: Indicates if the request was made over HTTPS.

```php
$Request->secure; // true
```

`fresh`: Flag indicating if the request is to be considered fresh.

```php
$Request->fresh; // true
```

`stale`: Flag indicating if the request is to be considered stale.

```php
$Request->stale; // false
```

These accessible properties are integral to the behavior of the HTTP Request class and provide a robust API for the convenient development of web applications.
