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
| `allowInsecureRedirect` | `bool` | `false` | Seguir um redirect que rebaixa de `https` para `http`. |
| `connectTimeout` | `int\|float` | `30` | Timeout de conexão em segundos, por tentativa de discagem. Em um reactor adotado, a discagem e o handshake TLS fazem park em vez de bloquear o loop do host (0 = sem timeout). |
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

### O que uma perna de redirect carrega

Cada perna é discada com a configuração TLS que você passou para `configure()`. `verify_peer`, o bundle da CA, um certificado de cliente, um `peer_fingerprint` fixado e a lista de cifras sobrevivem ao salto — apenas `peer_name` é reapontado para o novo host.

Credenciais pertencem à origem que as emitiu. Quando um salto muda host, porta ou esquema, `Authorization`, `Cookie` e `Proxy-Authorization` são removidos antes do envio da perna — a mesma regra que curl, `requests` do Python e `net/http` do Go aplicam. Um redirect que permanece na mesma origem os mantém.

Um salto que rebaixa de `https` para `http` é recusado: a requisição falha com código `0` e status `'Insecure Redirect'`, e nada é discado. Como 307 e 308 reenviam os headers e o body originais, seguir esse salto os colocaria em texto claro na rede. Opte por permitir quando realmente precisar:

```php
$Client->allowInsecureRedirect = true;
```

Uma cadeia de redirects nunca re-aponta o cliente. Onde quer que a cadeia termine — em outra origem, ou em uma perna que não pôde ser discada — o host, a porta, as opções TLS e a contagem de workers que você configurou são restaurados e o pool de conexões é reconstruído para a sua própria origem, de modo que a próxima requisição vai para onde você a mandou. Uma perna que não pode ser discada falha com código `0` e status `'Redirect Failed'`, e nunca é repetida: repetir enviaria o caminho do alvo do redirect para o seu host original.

## Um cliente, uma origem

Um cliente fica ligado à origem que você passa em `configure()`, e as instâncias não interferem entre si: dois clientes no mesmo processo mantêm cada um o seu host, porta, opções TLS e pool. Nada é global ao processo — cada instância tem o seu próprio reactor, os seus próprios hooks de `on()`, os seus próprios contadores e o seu próprio pool, então qualquer número de clientes pode rodar lado a lado em um processo.

O modo event-driven também é por instância, e é exclusivo com a adoção de reactor: um cliente que adotou o reactor de um host via `react()` não pode entrar no modo event-driven — `on()` recusa, e `start()` recusa rodar. O modo event-driven é dono de um loop; um cliente de reactor adotado apenas pega um emprestado. Escolha um modelo de posse por cliente.

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

`code === 0` sempre significa que nenhuma resposta HTTP foi produzida, e `status` diz o motivo: `'Timeout'`, `'Connection Failed'`, `'Connection Lost'`, `'Connection Closed'`, `'Truncated Response'`, `'Response Too Large'`, `'Request Header Fields Too Large'`, ou `'Invalid Chunked Encoding'` quando o framing de uma resposta chunked não é HTTP válido (uma linha de chunk-size que não é hexadecimal, grande demais para ser real, ou dados de chunk que não terminam em CRLF como a RFC 9112 §7.1 exige).

Os dois timeouts limitam fases diferentes. `connectTimeout` limita cada **tentativa de discagem** — o connect TCP e o handshake TLS juntos; ele é gasto de novo a cada tentativa (um retry, uma perna de redirect, um replay). `timeout` arma apenas a **janela de resposta**, e só depois que a conexão está de pé e a requisição foi despachada.

Essa separação importa em um reactor adotado (veja [Modo Embedded](#modo-embedded)): um peer que aceita a conexão TCP mas nunca negocia mantém a Fiber deferida parkeada até `connectTimeout` expirar. Com `connectTimeout = 0` não há deadline de discagem nenhum, e a Fiber fica parkeada até a geração da deferral ser cancelada.

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

## Modo Embedded

Um cliente pode rodar **dentro** de outro runtime em vez de conduzir um loop próprio. No modo embedded ele adota o reactor do host — tipicamente o de um worker do HTTP Server — e toda espera faz park da Fiber chamadora em vez de bombear um event loop privado. O worker continua servindo as outras conexões enquanto o upstream responde.

A receita feita à mão, dentro de uma resposta deferida, são quatro chamadas nesta ordem:

```php
use Bootgly\WPI\Interfaces\TCP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Client_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;


return $Response->defer(function (Response $Response) {
   $Client = new HTTP_Client_CLI(HTTP_Client_CLI::MODE_EMBEDDED);
   $Client->react(TCP_Server_CLI::$Event);
   $Client->schedule(fn (mixed $value = null): Response => $Response->wait($value));
   $Client->configure(host: '127.0.0.1', port: 8080);

   $Upstream = $Client->request(method: 'GET', URI: '/users/1');

   $Response->JSON->send(['code' => $Upstream->code]);
});
```

- `MODE_EMBEDDED` — o cliente roda dentro do runtime de outro processo: sem lock de estado de processo, sem Commands/Terminal, sem broadcast de sinal de shutdown e sem sobrescrever as vars de debugging. O host é dono de tudo isso.
- `react()` — adota o reactor do host. O cliente deixa de ser dono do seu loop: `halt()` libera apenas a sua própria contabilidade e nunca destrói o reactor do host, e `start()` lança exceção. Precisa ser chamado antes de qualquer conexão ser aberta.
- `schedule()` — injeta a bridge de espera. `$Response->wait()` faz park da Fiber deferida sobre um readiness (ou um resource, ou `null`), e o cliente usa essa bridge para toda espera que ele passaria dentro de um loop.
- `configure()` — a mesma configuração de origem de qualquer outro cliente.

### O que faz park

`request()` faz park da Fiber deferida até a `Response` estar completa. `batch()` + `drain()` fazem park dela até toda requisição em batch se resolver — aqui `drain()` não roda um loop, ele faz park.

A discagem também faz park: abrir a conexão faz park sobre readiness de escrita e o handshake TLS faz park sobre readiness de leitura, em fatias de 1 segundo limitadas pelo deadline de discagem. Assim, um upstream inalcançável ou silencioso não custa nada ao worker além de um socket discando — o reactor continua ticando e as outras conexões continuam sendo servidas.

### Uma Fiber é dona de um cliente

Um cliente embedded é conduzido por exatamente **uma** Fiber. Código rodando na pilha do reactor — um callback de timer, o handler de outra conexão — nunca disca: ele enfileira a requisição e acorda a Fiber dona, que atende a fila entre os parks. Campanhas de retry seguem a mesma regra: o timer de backoff dispara na pilha do reactor do host e apenas entrega o re-dispatch; quem o executa é a Fiber dona.

Não compartilhe um cliente embedded entre contextos deferidos, e não chame `request()` de dentro de um callback do reactor.

### Leia a requisição dentro da Fiber

Dentro da Fiber deferida, leia o estado da requisição de entrada a partir de `WPI->Request` — nunca de um `$Request` capturado por `use ()`:

```php
return $Response->defer(function (Response $Response) {
   $URI = WPI->Request->URI;  // ✅ a requisição admitida desta própria deferral
   // ...
});
```

`defer()` clona a requisição admitida para dentro da deferral e a instala como `WPI->Request` em cada segmento de execução daquela Fiber. Já o objeto `$Request` vivo pertence à troca que o worker está decodificando no momento — quando a Fiber retomar, ele pode já estar carregando outra requisição, intercalada.

### Falha, abort e o episódio parkeado

Todo terminal de falha resolve o episódio parkeado: a Fiber retoma exatamente uma vez, com `code === 0` e um `status` nomeado — o mesmo contrato que o cliente standalone honra. Isso inclui as duas falhas exclusivas deste modo:

- Uma rejeição por orçamento de fds pelo reactor do host (*selector admission*) falha o conjunto em voo de forma determinística em vez de pendurar a Fiber para sempre.
- Inanição de capacidade — um deadline silencioso inteiro expirou e a fila ainda não pôde ser pareada com uma conexão enquanto nada está em voo — falha a fila em alto e bom som em vez de parkear indefinidamente.

`abort()` abandona tudo de uma vez: requisições enfileiradas, em voo e em retry terminalizam com código `0` (`'Connection Failed'`, ou `'Truncated Response'` quando bytes já tinham chegado), e **toda** conexão é fechada — inclusive as keep-alive ociosas, porque elas também seguram registros no reactor. O cliente continua utilizável e o próximo `request()` disca do zero, mas o piso do pool (`pool['min']`) não é reaquecido: o warm-up é por configuração, e o pool se reenche sob demanda até `pool['max']`. Um episódio de drain parkeado, se houver um aberto, é acordado para observar a quiescência.

`unpark()` é o companheiro para um contexto que **nunca** vai retomar — uma Fiber despejada cuja geração já foi resolvida. Ele aposenta o notificador daquele episódio. Nunca o chame enquanto a Fiber parkeada ainda puder retomar: o reactor ainda segura a ponta de leitura. `$parked` diz se existe um episódio aberto.

### Prefira o response resource

Tudo acima é o que o response resource HTTP built-in já faz por você. Registre-o uma vez e chame-o de dentro do `defer()`:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\HTTP;


$HTTP_Server_CLI->configure(responseResources: [
   'Upstream' => static fn (object $Context): HTTP => new HTTP(host: 'api.example.com', secure: [])
]);

$Response->defer(function (Response $Response) {
   $Upstream = $Response->Upstream->request(method: 'GET', URI: '/users/1');
   $Response->JSON->send(['code' => $Upstream->code]);
});
```

Ele monta `MODE_EMBEDDED`, `react()` e `schedule()` por você, e libera o cliente quando a deferral se resolve. Recorra à receita feita à mão apenas quando você precisar de um cliente que o resource não dá. Veja a página [Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/).

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

| Camada | Componente |
|---|---|
| **TCP** | `TCP_Client_CLI` + Connections + Packages |
| **HTTP** | `HTTP_Client_CLI` + Request + Response + Encoders/Decoders |

Cada instância de cliente é dona de um reactor `Select` próprio — a mesma classe de reactor que alimenta o HTTP Server — ou adota o de um host via `react()` (veja [Modo Embedded](#modo-embedded)). O gerenciamento de conexões e o modelo de I/O non-blocking são compartilhados com o server de todo modo.

## Referência

### `Bootgly\WPI\Nodes\HTTP_Client_CLI`

`react()`, `schedule()`, `$Event`, `$owned`, `$Wait` e `MODE_EMBEDDED` são herdados sem alteração de [`TCP_Client_CLI`](/manual/WPI/TCP/TCP_Client_CLI/) e não são repetidos abaixo.

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

Envia uma requisição HTTP. `method` deve ser um token HTTP e `URI` deve usar origin-form (`/caminho?query`), ou `*` com `OPTIONS`; espaços raw, controles, barras invertidas e fragments são rejeitados com `InvalidArgumentException` antes de qualquer conexão ser aberta. No modo sync, bloqueia até a `Response` estar completa (seguindo redirects e executando retries). No modo batch, retorna imediatamente uma referência de `Response` — populada depois pelo `drain()`. No modo event-driven, retorna `self`. Em um reactor adotado, a Fiber deferida faz park até a `Response` estar completa.

```php
public function batch (): void
```

Entra no modo batch: chamadas subsequentes de `request()` são adiadas até `drain()` ser chamado, permitindo execução concorrente. Requisições além do `max` do pool entram na fila e são promovidas conforme capacidade é liberada; sobre HTTP/2 elas multiplexam como streams em uma conexão.

```php
public function drain (): void
```

Executa o event loop até todas as requisições pendentes completarem e, então, sai do modo batch. Em um reactor adotado, ele faz park da Fiber chamadora até toda requisição pendente completar, em vez de rodar um loop.

```php
public function abort (): void
```

Abandona toda requisição enfileirada, em voo e em retry e fecha toda conexão — inclusive as keep-alive do pool. O cliente continua utilizável: o próximo `request()` disca do zero. O piso do pool (`pool['min']`) não é reaquecido — o warm-up é por configuração, e o pool se reenche sob demanda até `pool['max']`. As requisições abandonadas terminalizam com código `0` (`'Connection Failed'`, ou `'Truncated Response'` quando bytes já tinham chegado), e um episódio de drain parkeado, se houver um aberto, é acordado para observar a quiescência — seu notificador é fechado pela própria Fiber parkeada quando ela retoma; `unpark()` é para uma que nunca vai retomar.

```php
public function unpark (): void
```

Aposenta o episódio de drain parkeado de um contexto que nunca vai retomar. O notificador do episódio é o par de descritores do próprio cliente, fechado pela Fiber parkeada quando ela retoma; uma Fiber despejada (com a geração já resolvida) nunca retoma, então o caminho resolvido aposenta o par ele mesmo. Nunca o chame enquanto a Fiber parkeada ainda puder retomar — o reactor ainda segura a ponta de leitura.

```php
public bool $parked { get; }
```

Se há um episódio de drain atualmente parkeado neste cliente.

```php
public null|bool $enableHTTP2 = null;
```

Modo de negociação HTTP/2. `null` (padrão): oferece `h2,http/1.1` via TLS-ALPN quando `secure` está definido — cleartext permanece HTTP/1.1. `true`: também fala h2c prior knowledge em conexões cleartext. `false`: nunca negocia HTTP/2.

```php
public int $maxResponseBytes = 0;
```

Máximo de bytes raw da resposta (headers + body). `0` = ilimitado. Exceder o limite falha a requisição com code `0` e status `'Response Too Large'`. Aplicado tanto em HTTP/1.1 quanto em HTTP/2. Respostas chunked também falham rápido: um chunk cujo tamanho declarado empurraria o body decodificado além do limite falha a requisição imediatamente, antes de baixar os dados do chunk.

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
