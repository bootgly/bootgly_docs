# HTTP Client CLI

O HTTP Client CLI é o cliente HTTP nativo do Bootgly PHP Framework. Ele é construído sobre a infraestrutura do TCP Client CLI com uma arquitetura totalmente event-driven e non-blocking — 100% PHP puro, sem cURL, sem extensões.

## Recursos

| Recurso | Descrição |
|---|---|
| **Métodos HTTP** | GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS |
| **Decodificação RFC 9112** | Chunked transfer-encoding, content-length, close-delimited |
| **100-Continue** | Requisição em duas fases: headers primeiro, body após aceitação do servidor |
| **1xx Informacional** | Tratamento completo de respostas informacionais |
| **Codificação do Body** | Raw, JSON, form-urlencoded |
| **Headers** | Headers de resposta multi-valor, trimming de OWS por RFC 7230 |
| **Keep-Alive** | Reutilização automática de conexão (`Connection: keep-alive`) |
| **Pool de Conexões** | Pool por origem com limites `min`/`max`, reuso keep-alive, re-dial de conexões stale |
| **HTTP/2** | Negociação TLS-ALPN, h2c prior knowledge, streams multiplexados em batch |
| **Pipelining** | Enfileirar múltiplas requisições por conexão |
| **Modo Batch** | `batch()` + múltiplos `request()` + `drain()` |
| **Event-Driven** | Modo async via hooks `on()` com rastreamento de requisição por socket |
| **SSL/TLS** | Suporte completo a HTTPS |
| **Redirects** | Seguimento automático até limite configurável |
| **Timeouts** | Timeout de conexão e de resposta |
| **Retries** | Backoff exponencial com jitter, retry HTTP opt-in honrando `Retry-After` |
| **Multi-Worker** | Geração de carga baseada em fork para benchmarking |

## Início Rápido

### Requisição GET Simples

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;


$Client = new HTTP_Client_CLI;
$Client->configure(host: 'example.com', port: 80);

$Response = $Client->request(method: 'GET', URI: '/');

echo $Response->code;   // 200
echo $Response->body;   // '<!doctype html>...'
```

### POST com Body JSON

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;


$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, secure: []);

$Response = $Client->request(
   method: 'POST',
   URI: '/users',
   headers: ['Accept' => 'application/json'],
   body: ['name' => 'Bootgly', 'role' => 'framework']
);

echo $Response->code;                       // 201
$data = $Response->Body->decode('json');     // ['id' => 1, ...]
```

### POST com Dados de Formulário

```php
$Response = $Client->request(
   method: 'POST',
   URI: '/login',
   headers: ['Content-Type' => 'application/x-www-form-urlencoded'],
   body: 'username=admin&password=secret'
);
```

## Configuração

O método `configure()` aceita os seguintes parâmetros:

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Host alvo para conexão. |
| `port` | `int` | — | Porta alvo. |
| `workers` | `int` | `0` | Número de processos worker (para benchmarking). |
| `secure` | `array\|null` | `null` | Opções de contexto seguro SSL/TLS. Use `[]` para TLS padrão. Auto-configura `peer_name` para verificação de hostname. |
| `pool` | `array\|null` | `null` | Limites do pool de conexões: `['min' => N, 'max' => N]`. Padrões: min `0`, max `1`. |
| `enableHTTP2` | `bool\|null` | `null` | Negociação HTTP/2: `null` = ALPN quando `secure` está definido; `true` = também h2c em cleartext; `false` = nunca. |

### Propriedades do Client

| Propriedade | Tipo | Padrão | Descrição |
|---|---|---|---|
| `maxRedirects` | `int` | `10` | Máximo de redirects a seguir (0 = desabilitado). |
| `connectTimeout` | `int\|float` | `30` | Timeout de conexão em segundos. |
| `timeout` | `int\|float` | `30` | Timeout de resposta em segundos. |
| `maxResponseBytes` | `int` | `0` | Máximo de bytes raw da resposta — headers + body (0 = ilimitado). |
| `maxRetries` | `int` | `0` | Máximo de retries em falha (0 = desabilitado). |
| `retryDelay` | `int\|float` | `1.0` | Delay base de backoff em segundos — dobra a cada tentativa. |
| `retryMaxDelay` | `int\|float` | `30.0` | Teto do delay de backoff em segundos. |
| `retryTimeout` | `int\|float` | `60.0` | Orçamento wall-clock da campanha de retry por requisição em segundos (0 = ilimitado). |
| `retryJitter` | `float` | `0.25` | Fração de jitter proporcional aplicada a cada delay de backoff. |
| `retryOn` | `array` | `[]` | Status codes de retry HTTP opt-in (ex.: `[429, 503]`). |
| `enableHTTP2` | `bool\|null` | `null` | Modo de negociação HTTP/2 (veja a seção HTTP/2). |

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, secure: []);

// ? Configure
$Client->maxRedirects = 5;
$Client->timeout = 10;
$Client->maxRetries = 3;
$Client->retryDelay = 0.5;
```

## SSL/TLS (HTTPS)

Ative HTTPS passando o parâmetro `secure` para `configure()`:

```php
// @ Configurações TLS padrão (verificação automática de peer_name)
$Client->configure(host: 'secure.example.com', port: 443, secure: []);

// @ Opções SSL customizadas
$Client->configure(host: 'secure.example.com', port: 443, secure: [
   'peer_name' => 'secure.example.com',
   'verify_peer' => true,
   'verify_peer_name' => true,
]);
```

Quando `secure` não é `null` e `peer_name` não está definido, o cliente automaticamente usa o parâmetro `host` para verificação de hostname.

## Pool de Conexões

O cliente mantém um pool de conexões por origem nos modos sync/batch. Conexões keep-alive ficam estacionadas entre requisições e são reutilizadas de forma transparente, em vez de discar uma nova conexão por requisição:

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;


$Client = new HTTP_Client_CLI;
$Client->configure(
   host: 'api.example.com',
   port: 443,
   secure: [],
   pool: ['min' => 2, 'max' => 8]
);

// @ A primeira requisição pré-disca o pool até `min` (2 conexões), de forma lazy
$Response1 = $Client->request(method: 'GET', URI: '/users');

// @ Requisições seguintes reutilizam as conexões keep-alive estacionadas
$Response2 = $Client->request(method: 'GET', URI: '/posts');
```

Combinado com o modo batch, `max` limita a concorrência — requisições excedentes entram na fila e são promovidas conforme conexões são liberadas:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, secure: [], pool: ['max' => 4]);

$Client->batch();

$Responses = [];
for ($id = 1; $id <= 10; $id++) {
   $Responses[] = $Client->request(method: 'GET', URI: "/users/{$id}");
}

$Client->drain();
// @ 10 requisições sobre no máximo 4 conexões — o excedente enfileirou e foi promovido
```

Regras do pool:

- Os padrões são `min` = `0` e `max` = `1`; `max` tem teto de 1000 (limite do backend de eventos Select) e `min` é limitado por `max`.
- `min` pré-disca de forma lazy na primeira requisição — as conexões aquecidas estacionam idle no pool.
- Uma resposta keep-alive devolve a conexão ao pool; uma resposta `Connection: close` a descarta.
- Conexões stale estacionadas são tratadas de forma transparente: uma sondagem de liveness não-consumidora descarta sockets mortos na aquisição, e uma requisição despachada em uma conexão reutilizada que morre antes de **qualquer** byte de resposta é reenviada uma vez em uma conexão nova (qualquer método — ela comprovadamente nunca foi processada — e não consome `maxRetries`).
- O pool é por origem por construção: reconfigurar para outro host/porta aposenta todas as conexões do pool da origem anterior. Quando `configure()` é chamado novamente sem o argumento `pool`, os limites anteriores são mantidos.

Conexões idle podem ser expiradas com o `expiration` do pool (segundos; `0` = nunca expirar):

```php
$Client->Pool->expiration = 60;  // expira conexões estacionadas há mais de 60s
```

O estado do pool é publicamente legível para observabilidade:

```php
echo $Client->Pool->created;       // conexões vivas no pool
echo count($Client->Pool->idle);   // conexões estacionadas
echo count($Client->Pool->busy);   // conexões em voo
```

## HTTP/2

O cliente fala HTTP/2 com três modos de negociação, controlados por `enableHTTP2` (parâmetro do `configure()` ou propriedade pública):

| `enableHTTP2` | Comportamento |
|---|---|
| `null` (padrão) | Oferece `h2,http/1.1` via TLS-ALPN quando `secure` está definido. Cleartext permanece HTTP/1.1. |
| `true` | Adicionalmente fala h2c **prior knowledge** em conexões cleartext (opt-in explícito). |
| `false` | Nunca negocia HTTP/2. |

### h2 via TLS-ALPN

Com TLS, nenhum opt-in é necessário — o ALPN negocia o protocolo e o cliente faz fallback transparente para HTTP/1.1 quando o servidor recusa h2:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: 'http2.example.com', port: 443, secure: []);
// @ TLS-ALPN oferece `h2,http/1.1` — o servidor escolhe o protocolo

$Response = $Client->request(method: 'GET', URI: '/');

echo $Response->protocol;  // 'HTTP/2' (ou 'HTTP/1.1' quando o servidor recusou h2)
```

### h2c prior knowledge (cleartext)

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: '127.0.0.1', port: 8080, enableHTTP2: true);
// @ h2c cleartext com prior knowledge — sem handshake de Upgrade

$Response = $Client->request(method: 'GET', URI: '/');

echo $Response->protocol;  // 'HTTP/2'
```

### Desabilitando HTTP/2

```php
$Client->configure(host: 'example.com', port: 443, secure: [], enableHTTP2: false);
// @ h2 não é oferecido via ALPN — a conexão permanece HTTP/1.1
```

### Multiplexação no modo batch

Sobre HTTP/2, requisições em batch multiplexam como streams concorrentes sobre **uma** conexão:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: 'http2.example.com', port: 443, secure: []);

$Client->batch();

$R1 = $Client->request(method: 'GET', URI: '/a');
$R2 = $Client->request(method: 'GET', URI: '/b');
$R3 = $Client->request(method: 'GET', URI: '/c');

$Client->drain();
// @ As três requisições rodaram como streams em uma única conexão h2
```

Notas de HTTP/2:

- `$Response->protocol` reporta `'HTTP/2'`; `$Response->status` fica vazio — HTTP/2 não tem reason-phrase, use `$Response->code`.
- Redirects, timeouts e `maxResponseBytes` funcionam sobre h2 exatamente como sobre HTTP/1.1.
- `Expect: 100-continue` é exclusivo do HTTP/1.1: headers específicos de conexão são removidos no h2 (RFC 9113 §8.2.2) e o body é enviado imediatamente.
- O pool co-localiza aquisições extras em conexões com capacidade de multiplexação antes de discar novas — uma conexão h2 anuncia sua capacidade de streams ao pool.

## Tratamento de Redirects

O cliente segue automaticamente redirects HTTP (301, 302, 303, 307, 308) até `maxRedirects`:

```php
$Client->maxRedirects = 5;  // padrão: 10

$Response = $Client->request(method: 'GET', URI: '/old-page');
// @ Segue automaticamente o header Location
echo $Response->code;  // 200 (do destino final)
```

### Comportamento de redirect por RFC 7231

| Código | Mudança de Método | Body Preservado |
|---|---|---|
| 301, 302, 303 | Muda para GET (exceto HEAD) | Não (body limpo) |
| 307, 308 | Preservado | Sim |

## Timeouts

```php
// ? Timeout de conexão
$Client->connectTimeout = 5;  // 5 segundos

// ? Timeout de resposta
$Client->timeout = 10;        // 10 segundos

$Response = $Client->request(method: 'GET', URI: '/slow-endpoint');

if ($Response->code === 0) {
   echo $Response->status;  // 'Timeout'
}
```

## Retries & Backoff

Retry automático em falha de conexão ou timeout, com backoff exponencial limitado e jitter:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, secure: []);

$Client->maxRetries = 3;        // 0 = desabilitado (padrão)
$Client->retryDelay = 0.5;      // delay base: ~0.5s, ~1s, ~2s, ...
$Client->retryMaxDelay = 10.0;  // teto do backoff em segundos
$Client->retryTimeout = 30.0;   // orçamento wall-clock para toda a campanha de retry
$Client->retryJitter = 0.25;    // fração de jitter proporcional (0 = sem jitter)

$Response = $Client->request(method: 'GET', URI: '/unstable-endpoint');
```

### Retry em nível HTTP (`retryOn`)

Retentar com base em status codes de resposta é opt-in via `retryOn`, honrando o header de resposta `Retry-After`:

```php
$Client->maxRetries = 5;        // também orça os retries em nível HTTP
$Client->retryOn = [429, 503];  // retenta nesses status codes

$Response = $Client->request(
   method: 'POST',
   URI: '/jobs',
   body: ['task' => 'render']
);
// @ Em 429/503 o cliente espera (backoff ou Retry-After, o que for
//   maior) e retenta — até maxRetries vezes
```

Regras de retry:

- **Backoff**: `retryDelay` dobra a cada tentativa, limitado por `retryMaxDelay`, mais um jitter proporcional de até `retryJitter` × delay.
- **Orçamento da campanha**: `retryTimeout` (padrão `60.0`; `0` = ilimitado) é um orçamento wall-clock por requisição — um retry cuja espera excederia o orçamento é vetado e a requisição permanece falhada.
- **Retries por falha de rede** (conexão recusada/reset, timeout) aplicam-se apenas a métodos idempotentes: GET, HEAD, PUT, DELETE, OPTIONS. Métodos não-idempotentes (POST, PATCH) só são retentados quando a requisição comprovadamente nunca foi enviada.
- **Retries em nível HTTP** (`retryOn`) são solicitados pelo servidor e aplicam-se a **qualquer** método. `Retry-After` é honrado nas formas delta-seconds e HTTP-date, limitado a 300 segundos (`MAX_RETRY_AFTER`); ele pode estender a espera de backoff computada, nunca encurtá-la.
- `retryOn` exige `maxRetries > 0` — o mesmo orçamento limita os dois tipos de retry.
- O backoff é **agendado no event loop** — esperar pela próxima tentativa nunca bloqueia o processo.

## Modo Batch

Envie múltiplas requisições concorrentes:

```php
$Client->batch();

$Response1 = $Client->request(method: 'GET', URI: '/users');
$Response2 = $Client->request(method: 'GET', URI: '/posts');
$Response3 = $Client->request(method: 'GET', URI: '/comments');

$Client->drain();

// @ Todas as respostas agora estão populadas
echo $Response1->code;  // 200
echo $Response2->code;  // 200
echo $Response3->code;  // 200
```

## Modo Event-Driven

Registre hooks para operação totalmente assíncrona:

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Events;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request\Response;


$Client = new HTTP_Client_CLI;
$Client->configure(host: '127.0.0.1', port: 8080);

$Client->on(
   Events::ResponseReceive,
   function (Request $Request, Response $Response): void {
      echo "Status: {$Response->code}\n";
      echo "Body: {$Response->body}\n";
   }
);

$Client->request(method: 'GET', URI: '/');
$Client->start();
```

### Hooks Disponíveis

| Hook | Assinatura | Descrição |
|---|---|---|
| `Events::WorkerStarted` | `Closure(HTTP_Client_CLI $Client)` | Chamado na inicialização da instância do worker. |
| `Events::ClientConnect` | `Closure($Socket, $Connection)` | Chamado quando uma conexão é estabelecida. |
| `Events::ClientDisconnect` | `Closure($Connection)` | Chamado quando uma conexão é fechada. |
| `Events::DataRead` | `Closure($Socket, $Connection)` | Chamado após a leitura de dados raw da resposta. |
| `Events::DataWrite` | `Closure($Socket, $Connection)` | Chamado após a escrita dos dados da requisição. |
| `Events::ResponseReceive` | `Closure(Request, Response)` | Chamado quando uma resposta HTTP completa é recebida. |

## Suporte a 100-Continue

O cliente trata automaticamente `Expect: 100-continue` para bodies de requisição grandes:

```php
$Response = $Client->request(
   method: 'POST',
   URI: '/upload',
   headers: ['Expect' => '100-continue'],
   body: $largePayload
);
// @ Headers são enviados primeiro.
// @ Body é enviado apenas após o servidor responder com 100 Continue.
```

`Expect: 100-continue` é exclusivo do HTTP/1.1 — em conexões HTTP/2 o header é removido (campos específicos de conexão são proibidos pela RFC 9113 §8.2.2) e o body é enviado imediatamente.

## Arquitetura

O HTTP Client CLI é construído sobre a infraestrutura do TCP Client CLI:

| Camada | Componente | Linhas |
|---|---|---|
| **TCP** | `TCP_Client_CLI` + Connections + Packages | ~1.200 |
| **HTTP** | `HTTP_Client_CLI` + Request + Response + Encoders/Decoders | ~2.500 |
| **Total** | Código-fonte (excluindo testes) | **~3.700** |

O mesmo event loop (`Select`) que alimenta o HTTP Server também alimenta o HTTP Client. Eles compartilham o mesmo gerenciamento de conexões e modelo de I/O non-blocking.

## Referência

### `Bootgly\WPI\Nodes\HTTP_Client_CLI`

```php
public function configure (
   string $host,
   int $port,
   int $workers = 0,
   null|array $secure = null,
   null|array $pool = null,
   null|bool $enableHTTP2 = null
): self
```

Configura o alvo do cliente. `secure` recebe opções de contexto de stream SSL/TLS (`[]` para os padrões; `peer_name` é auto-definido a partir de `host`). `pool` recebe os limites do pool de conexões `['min' => N, 'max' => N]` (padrões: min `0`, max `1`); quando omitido em uma reconfiguração, os limites anteriores são mantidos. `enableHTTP2` seleciona o modo de negociação HTTP/2 (`null` = ALPN quando `secure` está definido; `true` = também h2c prior knowledge em cleartext; `false` = nunca); quando omitido, o valor atual da propriedade é mantido. Reconfigurar aposenta todas as conexões do pool da origem anterior.

```php
public function request (
   string $method = 'GET',
   string $URI = '/',
   array $headers = [],
   mixed $body = null
): self|Response
```

Envia uma requisição HTTP. No modo sync, bloqueia até a `Response` estar completa (seguindo redirects e executando retries). No modo batch, retorna imediatamente uma referência de `Response` — populada depois pelo `drain()`. No modo event-driven, retorna `self`.

```php
public function batch (): void
```

Entra no modo batch: chamadas subsequentes de `request()` são adiadas até `drain()` ser chamado, permitindo execução concorrente. Requisições além do `max` do pool entram na fila e são promovidas conforme capacidade é liberada; sobre HTTP/2 elas multiplexam como streams em uma conexão.

```php
public function drain (): void
```

Executa o event loop até todas as requisições pendentes completarem e, então, sai do modo batch.

```php
public null|bool $enableHTTP2 = null;
```

Modo de negociação HTTP/2. `null` (padrão): oferece `h2,http/1.1` via TLS-ALPN quando `secure` está definido — cleartext permanece HTTP/1.1. `true`: também fala h2c prior knowledge em conexões cleartext. `false`: nunca negocia HTTP/2.

```php
public int $maxResponseBytes = 0;
```

Máximo de bytes raw da resposta (headers + body). `0` = ilimitado. Exceder o limite falha a requisição com code `0` e status `'Response Too Large'`. Aplicado tanto em HTTP/1.1 quanto em HTTP/2.

```php
public int $maxRetries = 0;
```

Número máximo de retries por requisição (`0` = desabilitado). Orça tanto os retries por falha de rede quanto os retries em nível HTTP (`retryOn`).

```php
public int|float $retryDelay = 1.0;
```

Delay base de backoff em segundos — dobra a cada tentativa de retry.

```php
public int|float $retryMaxDelay = 30.0;
```

Teto do delay de backoff em segundos.

```php
public int|float $retryTimeout = 60.0;
```

Orçamento wall-clock da campanha de retry por requisição, em segundos (`0` = ilimitado). Um retry cuja espera excederia o orçamento é vetado.

```php
public float $retryJitter = 0.25;
```

Fração de jitter proporcional aplicada a cada delay de backoff (`0` = sem jitter).

```php
public array $retryOn = [];
```

Status codes de retry em nível HTTP, opt-in (ex.: `[429, 503]`). Exige `maxRetries > 0`. Honra o header de resposta `Retry-After` e aplica-se a qualquer método.

```php
public const int MAX_RETRY_AFTER = 300;
```

Limite, em segundos, aplicado ao header de resposta `Retry-After` (nas formas delta-seconds e HTTP-date).

```php
public protected(set) Pool $Pool;
```

O pool de conexões por origem (modos sync/batch). Publicamente legível para configuração (`expiration`) e observabilidade.

### `Bootgly\WPI\Interfaces\TCP_Client_CLI\Pool`

```php
public int $min;
```

Piso do pool — conexões pré-discadas de forma lazy na primeira requisição. Padrão `0`.

```php
public int $max;
```

Teto do pool — o número máximo de conexões vivas no pool. Padrão `1`, com teto de `1000` (limite do backend de eventos Select). `min` é limitado por `max`.

```php
public int|float $expiration = 0;
```

Idade de expiração de conexões idle em segundos (`0` = nunca expirar). Conexões idle estacionadas por mais tempo que isso são fechadas na próxima aquisição.

```php
public protected(set) array $idle = [];
```

Conexões estacionadas, indexadas por socket ID.

```php
public protected(set) array $busy = [];
```

Conexões em voo, indexadas por socket ID.

```php
public private(set) int $created = 0;
```

Conexões vivas no pool (anexadas menos descartadas).
