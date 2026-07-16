# Server-Sent Events (SSE)

O Bootgly transmite push ao vivo do servidor para navegadores sobre HTTP puro com o
resource de resposta `SSE` — o protocolo `text/event-stream` consumido nativamente pelo
`EventSource`. Sem handshake WebSocket, sem biblioteca no cliente: uma resposta de longa
duração, eventos sempre que o servidor tiver algo a dizer, reconexão automática do
cliente com resume.

Funciona em HTTP/1.1 (stream chunked em uma conexão dedicada) e HTTP/2 (stream
sustentado — a conexão continua servindo outras requisições) com a mesma API.

## Abra um stream

Pegue o resource `SSE` da Response dentro de qualquer handler de rota, configure e chame
`open()`. O head sai imediatamente; a conexão fica aberta para push:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\SSE;

$Router->route('/events', function (Request $Request, Response $Response): Response {
   $SSE = $Response->SSE;
   $SSE->heartbeat = 15;   // comment keep-alive após 15s de silêncio
   $SSE->retry = 3000;     // atraso de reconexão do cliente (ms)

   $SSE->open(
      Tick: static function (SSE $SSE): void {
         $SSE->send(data: ['time' => date('H:i:s')], event: 'tick');
      },
      interval: 1           // executa o Tick a cada segundo
   );

   return $Response;
}, GET);
```

A closure `Tick` é acionada pelo timer do servidor — uma chamada a cada `interval`
segundos até o stream terminar. Você também pode enviar eventos diretamente depois do
`open()` (ou de onde mantiver o handle `$SSE`) — `send()` escreve direto para o cliente:

```php
$SSE->open();
$SSE->send('deploy started', event: 'status', id: '1');
$SSE->send(['progress' => 42], event: 'status', id: '2');
$SSE->close();
```

Dados não-string são codificados em JSON automaticamente. Strings multilinha viram uma
linha `data:` por linha, exatamente como a spec espera.

## Consuma com EventSource

O lado do navegador são três linhas — reconexão, `Last-Event-ID` e backoff de retry já
vêm embutidos no `EventSource`:

```js
const source = new EventSource('/events');

source.addEventListener('tick', (event) => {
   console.log(JSON.parse(event.data));
});
```

Ou observe o stream raw com curl:

```bash :toolbar="true";
curl -N http://localhost:8082/events
```

```text
retry: 3000

event: tick
data: {"time":"14:07:31"}

: ← comment keep-alive após 15s de silêncio
```

## Resume com Last-Event-ID

Quando a conexão cai, o `EventSource` reconecta automaticamente e reenvia o último id de
evento visto no header `Last-Event-ID`. O resource o expõe como `$SSE->last` — use para
retomar o stream em vez de começar do zero:

```php
$Router->route('/events', function (Request $Request, Response $Response): Response {
   $SSE = $Response->SSE;

   $count = (int) $SSE->last;   // '' na primeira conexão

   $SSE->open(
      Tick: static function (SSE $SSE) use (&$count): void {
         $count++;
         $SSE->send(data: "message #{$count}", id: (string) $count);
      },
      interval: 2
   );

   return $Response;
}, GET);
```

Defina `id:` em todo evento do qual você possa querer retomar — o framework só transporta
o header; o que "retomar" significa (um offset, um cursor de banco, uma posição de fila)
é decisão da sua aplicação.

## Reaja a desconexões

Passe um hook `Close` ao `open()` — ele roda exatamente uma vez quando o stream termina,
por qualquer caminho: um `close()` gracioso, o cliente indo embora ou a conexão caindo:

```php
$SSE->open(
   Tick: static function (SSE $SSE): void {
      $SSE->send(['tick' => time()]);
   },
   interval: 1,
   Close: static function (SSE $SSE): void {
      // remova do seu registry userland, libere recursos...
   }
);
```

Uma escrita que falha derruba o stream imediatamente; um peer silencioso é detectado pelo
supervisor dentro de uma cadência (poucos segundos). O heartbeat keep-alive (`heartbeat`,
default 15s) impede que intermediários — nginx, load balancers — ceifem um stream ocioso;
use `0` para desativar.

## Push de outros pontos do worker

O `send()` não fica confinado ao `Tick` — guarde o handle e faça push quando algo
acontecer (o handler de outra requisição, um timer, um consumer de fila no mesmo worker):

```php
// um registry userland de streams abertos (por worker)
$Streams = [];

$Router->route('/events', function (Request $Request, Response $Response) use (&$Streams): Response {
   $SSE = $Response->SSE;
   $Streams[] = $SSE->open(Close: static function (SSE $SSE) use (&$Streams): void {
      $Streams = array_filter($Streams, static fn (SSE $Open): bool => $Open !== $SSE);
   });

   return $Response;
}, GET);

$Router->route('/notify', function (Request $Request, Response $Response) use (&$Streams): Response {
   foreach ($Streams as $SSE) {
      $SSE->send($Request->input, event: 'notice');
   }

   return $Response->send('delivered to ' . count($Streams) . ' stream(s)');
}, POST);
```

Fan-out entre workers (broadcast para streams mantidos por outros processos worker) ainda
não vem embutido — escale leituras com um worker por porta de streams, ou faça relay pelo
seu próprio pub/sub por enquanto.

## O que a v1 não faz

- **Broadcast entre workers** — push apenas no mesmo worker (veja acima).
- **Armazenamento de replay de eventos** — o `Last-Event-ID` é exposto; persistência é
  userland.
- **Compressão em streams** — os frames de evento saem sem compressão.
- **Pós-processamento por middleware** — o head está no fio quando `open()` retorna;
  defina CORS ou headers customizados na Response *antes* de chamar `open()`.

## Reference

```php
public function open (null|Closure $Tick = null, int $interval = 1, null|Closure $Close = null): self
```

Abre o event stream: escreve o head `text/event-stream` (preservando headers já definidos
na Response), marca a Response como deferred e instala o supervisor. `$Tick` roda a cada
`$interval` segundos (segundos inteiros — a granularidade do timer do servidor); `$Close`
roda exatamente uma vez no teardown. Idempotente: uma segunda chamada retorna o mesmo
resource sem alterações. Em requisições HTTP/1.0 recusa com `505` (respostas
interim/streams sem tamanho são HTTP/1.1+).

```php
public function send (mixed $data, null|string $event = null, null|string $id = null): bool
```

Envia um evento. `$data` não-string é codificado em JSON; dados multilinha viram uma
linha `data:` por linha. `$event` nomeia o tipo do evento (`addEventListener` no
cliente); `$id` define o `Last-Event-ID` do cliente. Retorna `false` depois que o stream
foi fechado ou o transporte se foi.

```php
public function ping (string $comment = ''): bool
```

Envia uma linha de comment (`: <comment>`) — invisível ao `EventSource`, apenas mantém a
conexão aquecida. O supervisor a chama automaticamente conforme a config `heartbeat`.

```php
public function close (): void
```

Encerra o stream graciosamente: a conexão HTTP/1.1 envia seu chunk terminal e fecha; o
stream HTTP/2 termina com `END_STREAM` enquanto a conexão continua servindo outros
streams. Dispara o hook `Close`.

```php
public function disconnect (): void
```

Apenas teardown — nenhuma escrita no fio. Invocado automaticamente em qualquer caminho de
fechamento da conexão; idempotente. Prefira `close()` para um encerramento gracioso.

### Propriedades de configuração

```php
public int $heartbeat = 15;
```

Segundos de silêncio de escrita antes de um comment keep-alive sair. `0` desativa o
heartbeat.

```php
public int $retry = 0;
```

Atraso de reconexão do cliente em milissegundos, enviado uma vez logo após o `open()`
como um campo `retry:`. `0` omite (navegadores usam então o próprio default, ~3s).

```php
public private(set) string $last;
```

O header `Last-Event-ID` da requisição — o ponto de resume do cliente; string vazia na
primeira conexão.

```php
public private(set) bool $opened;
public private(set) bool $closed;
```

Estado do stream, legível a qualquer momento.
