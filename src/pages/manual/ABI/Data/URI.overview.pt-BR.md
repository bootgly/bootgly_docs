# URI

`URI` é o valor de URI RFC 3986 do Bootgly: uma URI absoluta e hierárquica com host —
`esquema://[userinfo@]host[:porta]caminho[?query]` — separada em suas partes, e o único resolvedor
que o framework usa para transformar uma URI-reference em um alvo. O cliente HTTP resolve todo
`Location` de redirect por ele, assim como o buscador de key-set JWT.

## Interpretar uma URI

Entrada não confiável — um header, um endpoint configurado — passa por `parse()`, que responde `null`
para qualquer coisa que não seja uma URI desse formato. O construtor lança um `ValueError` no lugar:

```php
use Bootgly\ABI\Data\URI;

$URI = URI::parse('HTTPS://User@Example.COM:8080/a/./b?q=1#top');

$URI->scheme;    // 'https'        — em minúsculas
$URI->userinfo;  // 'User'         — como enviado, null quando ausente
$URI->host;      // 'example.com'  — em minúsculas
$URI->port;      // 8080           — null quando ausente: vale o padrão do esquema
$URI->path;      // '/a/./b'       — como enviado
$URI->query;     // 'q=1'          — null quando ausente, '' para um '?' sozinho
(string) $URI;   // 'https://User@example.com:8080/a/./b?q=1' — o fragmento é descartado
```

Um literal IPv6 fica canônico e entre colchetes (`[0:0::1]` → `[::1]`). `hostname` é o host na forma
de comparação — sem colchetes, sem ponto final —, então duas URIs nomeiam o mesmo host quando seus
`hostname`s são iguais:

```php
URI::parse('http://[0:0::1]/')->hostname;       // '::1'
URI::parse('http://Example.COM./x')->hostname;  // 'example.com'
```

`parse()` recusa:

- uma string sem esquema ou sem autoridade (`/x`, `//h/x`, `mailto:a@b`, `file:///x`);
- bytes de controle, espaços, DEL e barras invertidas em qualquer lugar;
- um host vazio ou não ASCII, um identificador de zona IPv6, IPvFuture ou um IPv4 entre colchetes;
- uma porta fora de 1–65535.

O esquema em si não é julgado: `gopher://h/x` é uma URI válida. Sobre quais esquemas agir é política
de quem chama.

## Resolver uma referência

`resolve()` aplica a RFC 3986 §5.2 a uma URI-reference — um header `Location`, um link — e retorna uma
nova `URI`; a base nunca muda. Caminhos relativos são mesclados e seus dot-segments removidos, e uma
referência de rede (`//host/caminho`) assume a autoridade que nomeia:

```php
$Base = new URI('https://api.example.com/v1/users/7');

(string) $Base->resolve('../orders?page=2');    // 'https://api.example.com/v1/orders?page=2'
(string) $Base->resolve('//cdn.example.com/a'); // 'https://cdn.example.com/a'
(string) $Base->resolve('HTTPS://Other.com/');  // 'https://other.com/'
```

Ele responde `null` quando o resultado não é uma URI absoluta e hierárquica com host — não há o que
discar:

```php
$Base->resolve('javascript:alert(1)'); // null
$Base->resolve('https:foo');           // null — um esquema sem autoridade
$Base->resolve("/a\r\nSet-Cookie: x"); // null — bytes de controle
```

Duas diferenças deliberadas em relação aos exemplos da RFC 3986 §5.4: um resultado opaco ou sem
autoridade (`g:h`, `http:g`) é recusado em vez de devolvido, e fragmentos são descartados, já que
nunca viajam em uma requisição.

## Referência

```php
public function __construct (string $URI)
```

Interpreta uma URI absoluta e hierárquica com host. Lança `ValueError` quando a string não é uma; a
mensagem nunca ecoa a entrada.

```php
public static function parse (string $URI): null|self
```

Interpreta uma URI absoluta e hierárquica com host, ou responde `null` — a forma para entrada não
confiável.

```php
public function resolve (string $reference): null|self
```

Resolve uma URI-reference contra esta URI (RFC 3986 §5.2.2, parser estrito; remoção de dot-segments
da §5.2.4) e retorna o alvo, ou `null` quando ele não é uma URI absoluta e hierárquica com host.

```php
public function __toString (): string
```

A URI recomposta (RFC 3986 §5.3), sem fragmento.

```php
public private(set) string $scheme;
```

O esquema, em minúsculas (`https`).

```php
public private(set) null|string $userinfo;
```

A informação de usuário antes do `@`, como enviada; `null` quando ausente.

```php
public private(set) string $host;
```

O host, em minúsculas e nunca vazio; um literal IPv6 canônico e entre colchetes (`[::1]`).

```php
public private(set) null|int $port;
```

A porta como escrita (1–65535); `null` quando ausente ou vazia — vale o padrão do esquema.

```php
public private(set) string $path;
```

O caminho como enviado: vazio ou começando com `/`.

```php
public private(set) null|string $query;
```

A query depois do `?`, como enviada; `null` quando ausente, `''` quando presente e vazia.

```php
public string $authority { get; }
```

`[userinfo@]host[:porta]`.

```php
public string $hostname { get; }
```

O host na forma de comparação: um literal IPv6 sem colchetes, um nome totalmente qualificado sem o
ponto final.
