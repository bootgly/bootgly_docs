# WS Server CLI

`Bootgly\WPI\Nodes\WS_Server_CLI` é um servidor WebSocket nativo e sem dependências. Ele roda sobre
o mesmo transporte orientado a eventos e multi-worker do HTTP Server CLI (framing RFC 6455, loop
`stream_select`, escrita com backpressure) — então uma aplicação realtime é um punhado de callbacks
`on()`, não um novo runtime.

Ele fala RFC 6455 (handshake, mensagens texto/binárias, fragmentação, ping/pong) e RFC 7692
(compressão `permessage-deflate`), com salas para broadcasting e uma etapa opcional de autenticação
no handshake. Os recursos mais profundos têm suas próprias páginas: **Channels**, **Compressão** e
**Authentication**.

> [!NOTE]
> O `broadcast()` faz fan-out **entre workers**: cada worker `SO_REUSEPORT` mantém seu próprio
> conjunto de conexões, e um relay de datagramas por worker (criado antes do fork) republica o frame
> para os workers vizinhos, então todo membro recebe a mensagem independente de qual worker tem a
> conexão — sem precisar de load balancer sticky.
> Envelopes entre workers têm cap de 64 KiB por frame: um broadcast maior ainda chega a todos os
> membros do worker local, mas os workers vizinhos são pulados.

## Inicie um servidor de echo

O servidor é dirigido por callbacks. `MessageReceived` recebe a `Message` decodificada; **retorne
uma string** e ela é enquadrada de volta para o remetente:

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Nodes\WS_Server_CLI;
use Bootgly\WPI\Nodes\WS_Server_CLI\Events;

$WS = new WS_Server_CLI(Mode: Modes::Foreground);
$WS->configure(new WS_Server_CLI\Configs(host: '0.0.0.0', port: 8083, workers: 1));

$WS
   ->on(Events::Connected, function ($Session) {
      // um cliente concluiu o handshake
   })
   ->on(Events::MessageReceived, function ($Session, $Message) {
      return "echo: {$Message->payload}";   // resposta de texto, enquadrada para você
   })
   ->on(Events::Disconnected, function ($Session) {
      // o cliente (ou o servidor) fechou a conexão
   });

$WS->start();
```

> [!IMPORTANT]
> `configure()` é variádico sobre value objects **Configs** — um por concern, aplicados em qualquer
> ordem. Todo Configs aceita **apenas named arguments**: seu primeiro parâmetro é um guard slot que você
> nunca preenche, então um `new WS_Server_CLI\Configs('0.0.0.0', 8083, 1)` posicional levanta um
> `TypeError`. Passar duas instâncias da mesma classe de Configs em uma mesma chamada de `configure()`
> lança `InvalidArgumentException`, e um `configure()` que nunca carregou `host`, `port` e `workers`
> lança `ArgumentCountError`.

Conecte pelo navegador para confirmar:

```js
const ws = new WebSocket('ws://127.0.0.1:8083');
ws.onopen = () => ws.send('hello');
ws.onmessage = (e) => console.log(e.data);   // "echo: hello"
```

Em um projeto real isso fica dentro do closure `boot` do projeto e é iniciado com
`bootgly project <Projeto> start` (veja `projects/Demo/WS_Server_CLI`).

## Receber e responder

O handler `MessageReceived` recebe `($Session, $Message)`:

- `$Message->payload` — os bytes completos da mensagem (remontados e descomprimidos).
- `$Message->binary` — `true` para mensagem binária, `false` para texto.

Retornar uma `string` envia um frame de texto de volta. Para responder com **binário**, ou enviar
mais de um frame, chame `$Session->send()` você mesmo e não retorne nada:

```php
->on(Events::MessageReceived, function ($Session, $Message) {
   $Session->send($Message->payload, binary: true);   // echo como binário
   $Session->send('e um complemento');
})
```

## Enviar a qualquer momento

`$Session` é seu handle para um cliente. Guarde uma referência a ele (ex.: num mapa de presença
indexado por `$Session->id`) e envie para ele quando quiser — frames iniciados pelo servidor passam
pelo mesmo escritor com backpressure:

```php
$Session->send('um push do servidor');
$Session->close(1000, 'tchau');   // código de fechamento + motivo opcional
```

## Heartbeat ping / pong

O servidor mantém as conexões vivas com seu próprio supervisor. Com `heartbeatInterval` (segundos,
padrão `30`), um peer ocioso recebe ping; um peer que perde o pong — ou cujo socket fecha — é
removido e dispara `Disconnected`. Pings de entrada do cliente são respondidos com pong
automaticamente; seu handler nunca vê frames de controle.

```php
$WS->configure(
   new WS_Server_CLI\Configs(host: '0.0.0.0', port: 8083, workers: 1, heartbeatInterval: 20)
);
```

Use `heartbeatInterval: 0` para desativar os pings do servidor e contar com `idleTimeout`.

## Seguro (wss://)

Passe um array de contexto de stream TLS em `secure` para servir `wss://`. O TLS é terminado pelo
transporte antes do handshake WebSocket, então nada nos seus handlers muda:

```php
$WS->configure(
   new WS_Server_CLI\Configs(
      host: '0.0.0.0',
      port: 8443,
      workers: 1,
      secure: [
         'local_cert' => '/path/to/cert.pem',
         'local_pk'   => '/path/to/key.pem',
      ]
   )
);
```

Os clientes então conectam com `new WebSocket('wss://host:8443')`.

---

## Referência

### Eventos

```php
use Bootgly\WPI\Nodes\WS_Server_CLI\Events;
```

`Connected`, `MessageReceived`, `Disconnected`, `ServerAdvertised`, `ServerStarted`, `ServerStopped`.
Registre cada um com `on()`. `Connected`/`Disconnected` recebem `($Session)`; `MessageReceived` recebe
`($Session, $Message)`; `ServerAdvertised`/`ServerStarted`/`ServerStopped` recebem `($Server)` —
`ServerAdvertised` dispara no processo que possui o terminal (no modo Daemon, o launcher):
componha o banner de inicialização ali e chame `$Server->advertise()` para as linhas de endereço.

### Métodos

```php
new WS_Server_CLI (Modes $Mode = Modes::Daemon)
```

Cria o servidor. `Mode` é um de `Foreground`, `Daemon`, `Interactive`, `Monitor`, `Test`
(`Bootgly\API\Endpoints\Server\Modes`).

```php
configure (Configuring ...$Configs): self
```

Aplica um value object **Configs** por concern, em qualquer ordem — no servidor WebSocket, esse é o
`WS_Server_CLI\Configs` (`Configuring` é `Bootgly\ABI\Configs`). Encadeável. A mesma classe de Configs
duas vezes na mesma chamada lança `InvalidArgumentException`; um servidor que nunca recebeu `host`,
`port` e `workers` lança `ArgumentCountError`.

```php
new WS_Server_CLI\Configs (
   Argument $Named = Argument::Undefined, // guard slot — nunca passe
   null|string $host = null, null|int $port = null, null|int $workers = null,
   null|array $secure = null,
   null|string $user = null, null|string $group = null,
   int $heartbeatInterval = 30,
   null|int $idleTimeout = null,
   int $maxFrameSize = 1048576,
   int $maxMessageSize = 8388608,
   array $subprotocols = [],
   bool $compression = true,
   array $Guards = [],
   null|int $maxConnections = null,
   null|int $maxConnectionsPerIP = null,
   null|Closure $Fallback = null
)
```

Faz o bind de host/porta e define a política por conexão — **apenas named arguments** (um guard slot
precede todos os parâmetros, então uma chamada posicional levanta um `TypeError`). `heartbeatInterval`
é a cadência do ping do servidor em segundos (`0` desativa). `idleTimeout` remove peers silenciosos
quando o heartbeat está desligado. `maxFrameSize` (1 MiB) e `maxMessageSize` (8 MiB) limitam um único
frame e uma mensagem remontada — exceder qualquer um fecha com `1009`. `subprotocols` é a lista
ordenada de preferência do servidor. `compression` liga/desliga o `permessage-deflate`. `Guards` é uma
lista de guards de autenticação do handshake. `maxConnections` / `maxConnectionsPerIP` limitam as
conexões estabelecidas por worker e por IP de cliente. `Fallback` responde requisições HTTP simples
(sem upgrade) — por exemplo, servindo a página do cliente na mesma porta. `secure` é um array de
contexto de stream TLS para `wss://`.

`host`, `port` e `workers` têm default `null` apenas porque o guard slot vem antes deles — o PHP
proíbe um parâmetro obrigatório depois de um opcional. Continuam obrigatórios: omitir qualquer um
lança `ArgumentCountError`.

```php
on (Event&BackedEnum $Event, Closure $Callback): self
```

Registra um handler para um case de `WS_Server_CLI\Events`. Encadeável. Registrar o mesmo evento
duas vezes lança exceção.

```php
start (): bool
```

Faz boot, forka os workers e entra no loop de eventos. Bloqueante em `Foreground`/`Monitor`;
desacopla em `Daemon`.

```php
Session->send (string $payload, bool $binary = false, int $fragment = 0): bool
```

Envia uma mensagem a este cliente — texto por padrão, binário quando `$binary` é `true`. Comprimida
automaticamente quando a sessão negociou `permessage-deflate`. Passe `$fragment` > 0 para dividir o
payload (pós-compressão) em frames de no máximo essa quantidade de bytes — um frame inicial seguido
de frames de continuação — em vez de um único frame.

```php
Session->ping (string $payload = ''): bool
```

Envia um frame de controle ping; o pong do cliente zera o timer de liveness.

```php
Session->close (int $code = 1000, string $reason = ''): bool
```

Envia um frame de close e derruba a conexão (dispara `Disconnected`).

### Propriedades da Session

`id` (int, o id da conexão), `ip`, `port`, `subprotocol` (negociado, ou `''`), `identity` (definido
por um guard de autenticação, ou `null`). Os helpers de sala (`join`/`leave`/`broadcast`) estão
documentados na página **Channels**.

### Propriedades da Message

`payload` (string — remontada e descomprimida), `binary` (bool), `opcode` (int).
