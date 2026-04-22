# HTTP Client CLI — Response

O objeto `Response` contém os dados recebidos de um servidor HTTP após a conclusão de uma requisição. Cada `Request` possui uma `Response` pareada que é automaticamente populada durante a decodificação da resposta.

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request\Response;
```

## HTTP

`protocol`: A versão do protocolo HTTP da resposta.

```php
$Response->protocol; // 'HTTP/1.1'
```

`code`: O código de status HTTP.

```php
$Response->code; // 200
```

`status`: A frase de razão do status HTTP.

```php
$Response->status; // 'OK'
```

### Valores de status especiais

| `code` | `status` | Significado |
|---|---|---|
| `0` | `'Timeout'` | A requisição expirou antes de receber uma resposta. |
| `0` | `''` | Falha de conexão — a requisição nunca foi enviada. |

## Headers

Acesse os headers da resposta através do sub-objeto `Header` ou via property hook `headers`:

```php
// @ Obter todos os headers como array (chaves em lowercase)
$Response->headers;
// ['content-type' => 'application/json', 'x-request-id' => 'abc123', ...]

// @ Obter o valor de um header
$Response->Header->get('Content-Type'); // 'application/json'

// @ Obter um header (case-insensitive)
$Response->Header->get('content-type'); // 'application/json'

// @ Obter todos os valores de um header multi-valor (ex: Set-Cookie)
$Response->Header->getAll('Set-Cookie');
// ['session=abc; Path=/', 'theme=dark; Path=/']
```

### API do Header

| Método | Assinatura | Descrição |
|---|---|---|
| `get` | `get(string $name): ?string` | Obtém o valor de um header. Retorna string concatenada por vírgula para headers multi-valor. Case-insensitive. |
| `getAll` | `getAll(string $name): array` | Obtém todos os valores de um header como array. Use para headers como `Set-Cookie` que não devem ser combinados. |

### Headers multi-valor

Headers que aparecem múltiplas vezes na resposta (ex: `Set-Cookie`) são armazenados como arrays:

```php
// @ Se a resposta contém:
// Set-Cookie: session=abc; Path=/
// Set-Cookie: theme=dark; Path=/

$Response->Header->get('Set-Cookie');
// 'session=abc; Path=/, theme=dark; Path=/'

$Response->Header->getAll('Set-Cookie');
// ['session=abc; Path=/', 'theme=dark; Path=/']
```

### Trimming de OWS

Valores de headers da resposta são limpos de espaço em branco opcional (SP/HTAB) conforme RFC 9110:

```php
// @ Header raw: "Content-Type:   application/json  "
$Response->Header->get('Content-Type'); // 'application/json'
```

## Body

Acesse o body da resposta através do sub-objeto `Body` ou via property hook `body`:

```php
// @ Obter body como string raw
$Response->body; // '{"id":1,"name":"Bootgly"}'

// @ Metadados do body
$Response->Body->length;      // 25 (tamanho do conteúdo em bytes)
$Response->Body->downloaded;  // 25 (bytes baixados até o momento)
$Response->Body->waiting;     // false (true enquanto o body está incompleto)
```

### Decodificação

Decodifique o body da resposta em dados estruturados:

```php
// @ Decodificar body JSON
$data = $Response->Body->decode('json');
// ['id' => 1, 'name' => 'Bootgly']

// @ Decodificar JSON como objeto
$data = $Response->Body->decode('json', associative: false);
// stdClass { id: 1, name: 'Bootgly' }

// @ Padrão (retorna string raw)
$raw = $Response->Body->decode('raw');
// '{"id":1,"name":"Bootgly"}'
```

| Tipo | Retorno | Descrição |
|---|---|---|
| `'json'` | `mixed` | Valor decodificado de JSON. Retorna `null` se o body estiver vazio ou JSON inválido. |
| `default` | `string` | String raw do body. |

## Estado da Conexão

`closeConnection`: Se o servidor indicou que a conexão deve ser fechada.

```php
$Response->closeConnection; // false (keep-alive) ou true (Connection: close)
```

## Transfer Encoding

O cliente trata automaticamente diferentes codificações de transferência:

| Codificação | Detecção | Comportamento |
|---|---|---|
| **Chunked** | `Transfer-Encoding: chunked` | Decodifica chunks, monta body final, trata trailers. |
| **Content-Length** | `Content-Length: N` | Lê exatamente N bytes para o body. |
| **Close-delimited** | Sem Content-Length, sem chunked | Lê até a conexão fechar. |

Toda decodificação é transparente — `$Response->body` sempre contém o body final e decodificado, independente da codificação de transferência.

## Reset

Reseta a resposta para seu estado padrão para reutilização:

```php
$Response->reset();
// protocol = 'HTTP/1.1'
// code = 0
// status = ''
// closeConnection = false
// Headers e Body também são resetados.
```

## Exemplo Completo

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;


$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, secure: []);

$Response = $Client->request(
   method: 'GET',
   URI: '/users/1',
   headers: ['Accept' => 'application/json']
);

// ? Verificar status
if ($Response->code === 200) {
   // ? Ler headers
   $contentType = $Response->Header->get('Content-Type');
   $requestId = $Response->Header->get('X-Request-Id');

   // ? Decodificar body
   $user = $Response->Body->decode('json');
   echo $user['name']; // 'Bootgly'
}
else if ($Response->code === 0) {
   echo "Requisição falhou: {$Response->status}"; // 'Timeout' ou ''
}
else {
   echo "Erro: {$Response->code} {$Response->status}";
}
```
