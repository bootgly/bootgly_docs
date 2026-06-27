# WS Client CLI

`Bootgly\WPI\Nodes\WS_Client_CLI` é um cliente WebSocket nativo e sem dependências. Ele roda sobre o
mesmo transporte orientado a eventos do HTTP Client CLI (loop `stream_select`, TLS via stream context)
e é compatível na rede com o **WS Server CLI** — então conversar com um endpoint WebSocket é um punhado
de callbacks `on()`, não um novo runtime.

Ele fala RFC 6455 (handshake, frames de texto/binário mascarados, fragmentação, ping/pong) e RFC 7692
(`permessage-deflate`), sobre `ws://` e `wss://`.

> [!NOTE]
> Pela RFC 6455 §5.1 todo frame do cliente é **mascarado** com uma chave aleatória nova — o `send()`
> faz isso por você. Frames vindos do servidor são esperados **sem máscara**; um frame mascarado do
> servidor é um erro de protocolo e fecha a conexão.

## Conectar a um servidor de eco

O cliente é dirigido por callbacks. O `connect()` monta a requisição de upgrade, disca o servidor e roda
o loop de eventos até a conexão fechar — ou seja, ele **bloqueia**, como executar um app cliente:

```php
use Bootgly\WPI\Nodes\WS_Client_CLI;
use Bootgly\WPI\Nodes\WS_Client_CLI\Events;

$WS = new WS_Client_CLI();
$WS->configure(host: '127.0.0.1', port: 8083);

$WS
   ->on(Events::Connected, function ($Session) {
      $Session->send('hello');           // o 101 foi verificado
   })
   ->on(Events::MessageReceived, function ($Session, $Message) {
      echo $Message->payload;            // a resposta do servidor
      $Session->close();                 // pronto — encerra o loop
   })
   ->on(Events::Disconnected, function ($Session) {
      // o servidor (ou este cliente) fechou a conexão
   });

$WS->connect('/');
```

Em um projeto real isso vive dentro do closure `boot` do projeto (veja `projects/Demo/WS_Client_CLI`).

## Receber e enviar

O `MessageReceived` recebe `($Session, $Message)`:

- `$Message->payload` — os bytes completos da mensagem (remontada e descomprimida).
- `$Message->binary` — `true` para mensagem binária, `false` para texto.

`$Session` é a sua referência para a conexão. Envie texto ou binário a qualquer momento, de qualquer
callback:

```php
->on(Events::Connected, function ($Session) {
   $Session->send('uma mensagem de texto');
   $Session->send($bytes, binary: true);            // binário
   $Session->send($grande, fragment: 16384);        // divide em frames de até 16 KiB
})
```

## Subprotocolos e cabeçalhos

Ofereça subprotocolos e adicione cabeçalhos de upgrade (ex.: `Origin`, `Authorization`) no `connect()`:

```php
$WS->connect(
   '/chat',
   headers: [
      'Origin'        => 'https://app.example',
      'Authorization' => 'Bearer ' . $token,        // auth no handshake
   ],
   subprotocols: ['json', 'chat'],
);

// a escolha do servidor, uma vez Connected:
$Session->subprotocol;   // ex.: 'json', ou '' se nenhum
```

## Compressão (permessage-deflate)

A compressão é **ligada por padrão**: o cliente oferece `permessage-deflate` e, quando o servidor
aceita, as mensagens de saída são deflacionadas e as de entrada infladas automaticamente — seus
handlers sempre veem bytes puros. Verifique o que foi negociado com `$Session->Deflator !== null`.
Desligue a oferta com `compression: false`:

```php
$WS->configure(host: '127.0.0.1', port: 8083, compression: false);
```

## Heartbeat

Defina `heartbeatInterval` (segundos) para o cliente pingar um servidor ocioso e descartar um peer que
não responde ao pong. É `0` (desligado) por padrão — o cliente sempre responde aos pings do servidor
com um pong de qualquer forma:

```php
$WS->configure(host: '127.0.0.1', port: 8083, heartbeatInterval: 20);
```

## Reconexão

Ative `reconnect` para rediscar automaticamente após uma queda **abrupta** (um reset do peer ou erro de
transporte sem frame de close WebSocket). Cada tentativa usa backoff exponencial limitado —
`reconnectDelay` dobrando até `reconnectMaxDelay` — por até `reconnectAttempts` vezes (`0` = ilimitado).
Um close **gracioso** (seu `$Session->close()`, um frame de close do servidor, ou uma falha de
protocolo) **não** reconecta; o loop encerra.

```php
$WS->configure(
   host: '127.0.0.1', port: 8083,
   reconnect: true,
   reconnectAttempts: 0,    // ilimitado
   reconnectDelay: 1,       // 1s, 2s, 4s, ... limitado em reconnectMaxDelay
   reconnectMaxDelay: 30,
);
```

O `Connected` dispara novamente a cada re-handshake bem-sucedido e o `Disconnected` a cada queda; o
backoff reinicia após uma conexão bem-sucedida.

## Clientes concorrentes

O `connect()` conduz **uma** conexão e bloqueia. Para rodar **vários** clientes ao mesmo tempo em um
único processo — um pool pequeno, ou fan-out para múltiplos endpoints — dê a cada um seu próprio
`WS_Client_CLI`, chame `open()` em cada (não bloqueante) e rode o loop compartilhado uma vez com o
`WS_Client_CLI::run()` estático:

```php
use Bootgly\WPI\Nodes\WS_Client_CLI;
use Bootgly\WPI\Nodes\WS_Client_CLI\Events;

$Clients = [];
foreach (['/rooms/a', '/rooms/b', '/rooms/c'] as $path) {
   $WS = new WS_Client_CLI();
   $WS->configure(host: '127.0.0.1', port: 8083);
   $WS
      ->on(Events::Connected, fn ($Session) => $Session->send('hi'))
      ->on(Events::MessageReceived, function ($Session, $Message) {
         echo $Message->payload;
      });

   $WS->open($path);          // não bloqueante: disca, NÃO roda o loop
   $Clients[] = $WS;
}

WS_Client_CLI::run();         // um loop compartilhado; retorna quando a ÚLTIMA conexão fechar
```

Cada cliente mantém seus próprios handlers e sua própria `Session`, então eventos nunca cruzam entre
conexões. Construa todos os clientes e chame `open()` em cada um **antes** de chamar `run()`.

> [!NOTE]
> O `reconnect` se aplica apenas ao `connect()` bloqueante. Em modo concorrente uma queda abrupta apenas
> remove aquele cliente do loop compartilhado; o `run()` retorna assim que a última conexão se encerra.

## Seguro (wss://)

Passe um array de stream-context TLS como `secure` para conectar sobre `wss://`. O TLS é estabelecido
antes do handshake WebSocket, então nada mais nos seus handlers muda:

```php
$WS->configure(
   host: 'example.com',
   port: 443,
   secure: [
      'verify_peer' => true,
      // 'peer_name' é definido como host automaticamente
   ],
);
```

---

## Referência

### Eventos

```php
use Bootgly\WPI\Nodes\WS_Client_CLI\Events;
```

`Connected`, `MessageReceived`, `Disconnected`. Registre cada um com `on()`. `Connected`/`Disconnected`
recebem `($Session)`; `MessageReceived` recebe `($Session, $Message)`. O `Connected` dispara somente
após o `101` ser verificado (linha de status + `Sec-WebSocket-Accept`).

### Métodos

```php
new WS_Client_CLI ()
```

Cria o cliente.

```php
configure (
   string $host, int $port, int $workers = 0,
   null|array $secure = null,
   int $heartbeatInterval = 0,
   int $maxFrameSize = 1048576,
   int $maxMessageSize = 8388608,
   bool $compression = true,
   bool $reconnect = false,
   int $reconnectAttempts = 0,
   int $reconnectDelay = 1,
   int $reconnectMaxDelay = 30
): self
```

Define o destino e a política por conexão. `heartbeatInterval` é a cadência de ping do cliente em
segundos (`0` desliga). `maxFrameSize` (1 MiB) e `maxMessageSize` (8 MiB) limitam um único frame de
entrada e uma mensagem remontada — exceder qualquer um fecha com `1009`. `compression` alterna a oferta
de `permessage-deflate`. `secure` é um array de stream-context TLS para `wss://` (o `peer_name` assume
o `host` por padrão). `reconnect` rediscar após uma queda abrupta com backoff exponencial limitado
(`reconnectDelay` → `reconnectMaxDelay`, até `reconnectAttempts`, `0` = ilimitado); closes graciosos não
reconectam.

```php
on (Event&BackedEnum $Event, Closure $Callback): self
```

Registra um handler para um caso de `WS_Client_CLI\Events`. Encadeável. Registrar o mesmo evento duas
vezes lança exceção.

```php
connect (string $URI = '/', array $headers = [], array $subprotocols = [])
```

Gera o `Sec-WebSocket-Key`, envia o `GET` de upgrade (com `$headers` e quaisquer `$subprotocols`
oferecidos) e roda o loop de eventos até a conexão fechar. Bloqueante.

```php
open (string $URI = '/', array $headers = [], array $subprotocols = [])
```

Como `connect()`, mas **não bloqueante**: disca e retorna sem rodar o loop de eventos, para que vários
clientes possam ser abertos e então conduzidos juntos pelo `run()`. O reconnect não se aplica neste
modo. Retorna o socket, ou `false` em caso de falha ao discar.

```php
WS_Client_CLI::run (): void
```

Roda o loop de eventos compartilhado até toda conexão aberta com `open()` fechar. Estático — chame uma
vez, após abrir todos os clientes.

```php
Session->send (string $payload, bool $binary = false, int $fragment = 0): bool
```

Envia uma mensagem — texto por padrão, binário quando `$binary` é `true`. Mascarada automaticamente;
comprimida quando a sessão negociou `permessage-deflate`. Passe `$fragment` > 0 para dividir o payload
(pós-compressão) em frames de no máximo essa quantidade de bytes.

```php
Session->ping (string $payload = ''): bool
```

Envia um frame de controle ping; o pong do servidor limpa o timer de liveness.

```php
Session->close (int $code = 1000, string $reason = ''): bool
```

Envia um frame de close e derruba a conexão (dispara `Disconnected`, encerra o loop).

### Propriedades da Session

`subprotocol` (negociado, ou `''`), `Deflator` (não-`null` quando `permessage-deflate` está ativo),
`established` (bool), `key` (o `Sec-WebSocket-Key` enviado).

### Propriedades da Message

`payload` (string — remontada e descomprimida), `binary` (bool), `opcode` (int).
