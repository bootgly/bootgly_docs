# HTTP Client CLI — Request

O objeto `Request` representa uma requisição HTTP de saída no HTTP Client CLI. Ele é criado internamente quando você chama `$Client->request()` e contém todos os dados da requisição (método, URI, headers, body) junto com o estado de transporte.

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request;
```

## HTTP

`method`: O método HTTP da requisição.

```php
$Request->method; // 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
```

`URI`: A URI da requisição (caminho + query string opcional).

```php
$Request->URI; // '/api/users?page=1'
```

`protocol`: A versão do protocolo HTTP.

```php
$Request->protocol; // 'HTTP/1.1'
```

## Headers

Acesse os headers da requisição através do sub-objeto `Header` ou via property hook `headers`:

```php
// @ Obter todos os headers como array
$Request->headers; // ['Content-Type' => 'application/json', ...]

// @ Definir um header
$Request->Header->set('Authorization', 'Bearer token123');

// @ Obter o valor de um header
$Request->Header->get('Content-Type'); // 'application/json'

// @ Adicionar valor a um header (multi-valor)
$Request->Header->append('Accept', 'text/html');
$Request->Header->append('Accept', 'application/json');

// @ Remover um header
$Request->Header->remove('Authorization');

// @ Construir string raw do header
$Request->Header->build(); // "Content-Type: application/json\r\nAccept: text/html\r\nAccept: application/json\r\n"
```

### API do Header

| Método | Assinatura | Descrição |
|---|---|---|
| `set` | `set(string $name, string $value): void` | Define um header (substitui existente). |
| `get` | `get(string $name): ?string` | Obtém o valor de um header (concatenado por vírgula se multi-valor). |
| `append` | `append(string $name, string $value): void` | Adiciona um valor a um header. |
| `remove` | `remove(string $name): void` | Remove um header. |
| `build` | `build(): string` | Constrói a string raw do header a partir dos campos. |

Nomes e valores de headers são validados contra a gramática HTTP (RFC 9110). Nomes inválidos ou valores contendo CR/LF (injeção CRLF) lançarão `InvalidArgumentException`.

## Body

Acesse e codifique o body da requisição através do sub-objeto `Body` ou via property hook `body`:

```php
// @ Obter body como string
$Request->body; // '{"name":"Bootgly"}'

// @ Codificar body string raw
$Request->Body->encode('Hello World');

// @ Codificar body JSON
$Request->Body->encode(['name' => 'Bootgly'], 'json');

// @ Codificar body form-urlencoded
$Request->Body->encode(['user' => 'admin', 'pass' => 'secret'], 'form');

// @ Metadados do body
$Request->Body->length; // 18 (tamanho em bytes)
```

### Tipos de Codificação do Body

| Tipo | Entrada | Saída |
|---|---|---|
| `'raw'` (padrão) | `string` | String raw sem alteração |
| `'json'` | `array` | String codificada em JSON |
| `'form'` | `array` | Query string URL-encoded (`key=value&key2=value2`) |

Ao usar `$Client->request()` com o parâmetro `body`, o content type é auto-detectado:

| Tipo do Body | Content-Type Automático |
|---|---|
| `string` | `text/plain` |
| `array` | `application/json` |

## Invocável

O Request é invocável — você pode configurá-lo chamando-o diretamente:

```php
$Request = new Request;
$Request('POST', '/api/users', ['Accept' => 'application/json'], ['name' => 'Bootgly']);
```

Assinatura:

```php
$Request(
   string $method = 'GET',
   string $URI = '/',
   array $headers = [],
   mixed $body = null
): self
```

## Estado de Transporte

Essas propriedades rastreiam o ciclo de vida da requisição durante o transporte:

| Propriedade | Tipo | Descrição |
|---|---|---|
| `connectionState` | `string` | `'idle'`, `'waiting'`, `'waiting-100-continue'`, `'redirect'` |
| `completed` | `bool` | Se a resposta foi completamente recebida. |
| `pendingBuffer` | `string` | Bytes acumulados ainda não processados. |
| `bytesReceived` | `int` | Total de bytes recebidos para esta requisição. |
| `sentAt` | `float` | Timestamp (microtime) de quando a requisição foi enviada. |
| `redirectCount` | `int` | Número de redirects seguidos até o momento. |
| `retryCount` | `int` | Número de retries tentados. |

## Response

Cada Request possui uma referência à sua Response pareada:

```php
$Request->Response->code;      // 200
$Request->Response->body;      // 'Hello World'
$Request->Response->headers;   // ['content-type' => 'text/plain', ...]
```

Veja a [documentação da Response](Response.overview.pt-BR.md) para detalhes completos.

## Reset

Reseta a requisição para seu estado padrão para reutilização:

```php
$Request->reset();
// @ Todas as propriedades são restauradas para os valores padrão.
// @ A Response pareada também é resetada.
```
