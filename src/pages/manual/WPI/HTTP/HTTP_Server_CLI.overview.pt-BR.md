# HTTP Server CLI

O HTTP Server CLI é o servidor HTTP nativo do Bootgly PHP Framework. Ele é um servidor event-driven, multi-worker, construído sobre uma infraestrutura TCP non-blocking com suporte a PHP Fibers para respostas assíncronas.

## Recursos

| Recurso | Descrição |
|---|---|
| **Modos de Operação** | Daemon (background), Interactive (REPL), Monitor (hot-reload) e Test (automatizado) |
| **Multi-Worker** | Workers via fork com `SO_REUSEPORT`; master reinicia workers automaticamente em caso de falha |
| **PHP Fibers** | Respostas assíncronas adiadas via `$Response->defer()`, integradas ao event loop `stream_select` |
| **Event-Driven** | Event loop baseado em `stream_select`; I/O non-blocking, zero CPU em idle |
| **Roteamento** | Rotas estáticas e dinâmicas com restrições de parâmetros tipadas; cache de warmup único |
| **Middleware** | Pipeline por grupo via `intercept()`; execução em modelo onion |
| **SSL/TLS** | HTTPS completo via stream context do PHP; certificados autoassinados incluídos para desenvolvimento local |
| **HTTP/2** | h2 nativo (TLS-ALPN) e prior knowledge em texto claro — HPACK, multiplexação, controle de fluxo, proteção rapid-reset |
| **Compressão de Resposta** | gzip, deflate e compress via `$Response->compress()` |
| **Respostas Chunked** | `Transfer-Encoding: chunked` para respostas em streaming |
| **Autenticação** | Desafio HTTP Basic auth via `$Response->authenticate()` |
| **Keep-Alive** | Reutilização automática de conexões HTTP/1.1 |
| **Limites de Corpo** | Limites configuráveis para campos multipart, partes de arquivo e corpo não-multipart |
| **Rebaixamento de Privilégio** | Demoção POSIX de usuário/grupo após bind do socket para operação segura em portas privilegiadas |
| **Bootstrap por Projeto** | Ciclo de vida do servidor gerenciado por arquivos de Projeto Bootgly, não por comandos do framework |

## Bootstrapping com Projects

No Bootgly, servidores são iniciados por Projetos — não por comandos do framework. Cada projeto define sua própria lógica de boot, incluindo instanciação do servidor, configuração e registro do handler.

Um arquivo de projeto (ex: `HTTP_Server_CLI.Project.php`) retorna uma instância de `Project`:

```php
use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;


return new Project(
   name: 'HTTP Server CLI',
   description: 'Demonstração do servidor HTTP com roteamento e captura de 404',
   version: '0.1.0',
   author: 'Seu Nome',
   exportable: true,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new HTTP_Server_CLI(Mode: match (true) {
         isSet($options['i']) => Modes::Interactive,
         isSet($options['m']) => Modes::Monitor,
         default              => Modes::Daemon
      });
      $Server->configure(
         host: '0.0.0.0',
         port: 8082,
         workers: 4
      );
      $Server->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'));
      $Server->start();
   }
);
```

Para iniciar o servidor, execute:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start
```

Modo interativo:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start -i
```

Modo monitor:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start -m
```

## Modos de Operação

O servidor suporta múltiplos modos de operação, selecionados ao construir a instância de `HTTP_Server_CLI`:

| Modo | Descrição |
|---|---|
| `Modes::Daemon` | Faz fork para segundo plano. O processo master se torna líder de sessão, despacha sinais e gerencia workers. Modo padrão. |
| `Modes::Interactive` | Loop REPL aceitando comandos CLI (`stop`, `help`, `monitor`). |
| `Modes::Monitor` | Modo hot-reload. Verifica mudanças nos arquivos a cada 2 segundos e envia sinais de reload para os workers. Exibe um dashboard de status em tempo real. |
| `Modes::Test` | Cria um cliente TCP, carrega a suíte de testes, envia requisições HTTP e valida as respostas. Usado internamente para testes automatizados. |

## Configuração

O método `configure()` aceita os seguintes parâmetros:

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Endereço de bind. Use `'0.0.0.0'` para escutar em todas as interfaces. Quando definido como `'0.0.0.0'`, o domínio padrão é `localhost`. |
| `port` | `int` | — | Porta de escuta. |
| `workers` | `int` | — | Número de processos filhos criados via fork. Cada worker cria seu próprio socket via `SO_REUSEPORT`. |
| `secure` | `?array` | `null` | Opções de contexto seguro SSL/TLS. Quando fornecido, o esquema muda para `https://`. |
| `user` | `?string` | `null` | Nome do usuário POSIX para rebaixar o processo após o bind. |
| `group` | `?string` | `null` | Nome do grupo POSIX para rebaixar o processo após o bind. |
| `requestMaxFileSize` | `?int` | `null` | Tamanho máximo em bytes por parte de arquivo em requisições multipart. Padrão: `500 MB`. |
| `requestMaxBodySize` | `?int` | `null` | Tamanho máximo total do corpo em bytes para requisições não-multipart. Padrão: `10 MB`. |
| `requestMaxMultipartFieldSize` | `?int` | `null` | Tamanho máximo em bytes do valor de um campo de texto multipart. Padrão: `1 MB`. |
| `requestMaxMultipartHeaderSize` | `?int` | `null` | Tamanho máximo em bytes do bloco de headers de uma parte multipart. Padrão: `8 KB`. |
| `requestMaxMultipartFields` | `?int` | `null` | Número máximo de campos de texto aceitos em uma requisição multipart. Padrão: `1024`. |
| `requestMaxMultipartFiles` | `?int` | `null` | Número máximo de partes de arquivo aceitas em uma requisição multipart. Padrão: `1024`. |
| `maxConnections` | `?int` | `null` | Número máximo de conexões estabelecidas simultaneamente **por worker**. Conexões aceitas além desse teto são imediatamente descartadas (aceitas e então fechadas) para limitar o uso de file descriptors e memória sob um DoS de inundação de conexões. Padrão: `10000`; `0` desativa o limite. Avaliado uma vez por accept — nunca no hot path por requisição. |
| `maxConnectionsPerIP` | `?int` | `null` | Número máximo de conexões estabelecidas simultaneamente **de um único IP de origem**. Opcional: padrão `0` (ilimitado), porque um proxy reverso concentra todos os clientes em um único IP de origem — habilite apenas quando o IP do par é o cliente real. |
| `connectionIdleTimeout` | `?int` | `null` | Segundos que uma conexão estabelecida pode ficar em silêncio — sem escrita concluída desde o tick anterior do supervisor e sem trabalho pendente retido nela — antes de o worker fechá-la. Uma resposta deferred estacionada conta como trabalho pendente, então nunca é ceifada como ociosa. Padrão: `15`; `0` desativa o reaper. Segundos inteiros: o supervisor roda na roda de timers de um segundo, então o corte cai entre `N` e `N+1` segundos após o último tick com atividade. |
| `deferredTimeout` | `?int\|float` | `null` | Segundos que uma resposta deferred (`$Response->defer()`) pode ficar estacionada no reactor antes de um `Response\Timeout` ser entregue no ponto de espera. Padrão: `0` (sem teto). Um `defer($work, timeout:)` por chamada tem precedência. Um timeout que escapa do trabalho sempre registra um warning; se nenhum middleware `Recovering` o tratar, ele responde `503 Service Unavailable`. |

```php
$Server->configure(
   host: '0.0.0.0',
   port: 8082,
   workers: 4,
   secure: null,
   user: null,
   group: null,
   requestMaxFileSize: 500 * 1024 * 1024,         // 500 MB (padrão) — tamanho máximo por parte de arquivo
   requestMaxBodySize: 10 * 1024 * 1024,          // 10 MB (padrão) — corpo total não-multipart
   requestMaxMultipartFieldSize: 1 * 1024 * 1024, // 1 MB (padrão) — tamanho máximo por campo de texto
   requestMaxMultipartHeaderSize: 8 * 1024,        // 8 KB (padrão) — tamanho máximo dos headers de uma parte
   requestMaxMultipartFields: 1024,                // 1024 (padrão) — número máximo de campos de texto
   requestMaxMultipartFiles: 1024,                 // 1024 (padrão) — número máximo de partes de arquivo
   maxConnections: 10000,                          // 10000 (padrão) — teto global de conexões simultâneas por worker (0 = ilimitado)
   maxConnectionsPerIP: 0,                          // 0 (padrão, opcional) — teto de conexões simultâneas por IP
   connectionIdleTimeout: 15,                      // 15 (padrão) — reaper de ociosidade em segundos; um defer() estacionado conta como atividade (0 = desativado)
   deferredTimeout: 0,                             // 0 (padrão, sem teto) — orçamento em segundos para um defer() estacionado; o timeout por chamada vence
);
```

### Limites de conexão

`maxConnections` e `maxConnectionsPerIP` protegem cada worker contra um DoS de exaustão de
conexões: um cliente que abre conexões até o limite de file descriptors do sistema operacional
pode, de outra forma, esgotar os FDs e a memória por conexão de um worker de event loop de
thread única.

O teto é verificado uma vez por conexão aceita (não no hot path por requisição), então não tem
efeito sobre a vazão das conexões keep-alive já estabelecidas. Quando um worker já está em
`maxConnections`, a próxima conexão é aceita e imediatamente fechada.

Deixe `maxConnectionsPerIP` em `0` quando o servidor estiver atrás de um proxy reverso ou
balanceador de carga — toda requisição chega do IP do proxy, e um limite por IP estrangularia
todo o tráfego legítimo. Habilite-o (com um valor confortavelmente acima da concorrência real
por cliente) apenas quando os clientes se conectam diretamente ao servidor.

```php
// Worker direto para a internet: limita a concorrência total e por cliente.
$Server->configure(
   host: '0.0.0.0',
   port: 8080,
   workers: 8,
   maxConnections: 20000,    // por worker
   maxConnectionsPerIP: 200, // por IP de origem (seguro apenas sem um proxy à frente)
);
```

#### Rejeições de protocolo

Uma requisição que o decoder não pode aceitar (head malformado, headers grandes
demais, versão não suportada, `Host` negado, violações de framing chunked, …) é
respondida com uma status line pura — `400`, `408`, `413`, `414`, `417`, `431`,
`501`, `503` ou `505` — e a conexão é fechada. Os bytes do erro viajam pelo mesmo
writer ordenado de qualquer outra resposta: se um corpo de resposta ainda está sendo
descarregado para um cliente lento, o erro drena **atrás** dos bytes devidos em vez
de se intercalar neles, a conexão para de ler input adicional, e o fechamento só
acontece depois da drenagem — limitado pelo orçamento de saída pendente do worker e
pelo deadline de stall de escrita. No HTTP/2 a mesma ordenação vale para o frame
`GOAWAY` de encerramento, que sempre chega em uma fronteira limpa de frame.

### Conexões ociosas

Toda conexão estabelecida é supervisionada pelo reaper de ociosidade do transporte. Uma vez a cada
`connectionIdleTimeout` segundos ele faz duas perguntas: o *servidor* concluiu alguma escrita desde o
tick anterior, e a conexão ainda carrega trabalho pendente? Qualquer resposta positiva renova o lease
por mais `connectionIdleTimeout`; o primeiro tick silencioso depois do último tick com atividade — ou
depois do estabelecimento, para uma conexão que nunca escreveu — fecha a conexão.

Bytes de entrada nunca renovam o lease: só uma escrita concluída pelo servidor, trabalho pendente retido
ou um protocolo que o renove por conta própria (heartbeats do SSE, o supervisor do WebSocket). Um corpo de
requisição que demore mais que `connectionIdleTimeout` para chegar é, portanto, fechado no meio do upload
— aumente o knob (ou encerre uploads lentos num proxy) quando corpos grandes em links lentos forem
esperados.

**Trabalho pendente** é uma resposta deferred estacionada no reactor — um `defer()` esperando um banco,
uma chamada upstream ou qualquer `$Response->wait()`. Ela não escreve nada enquanto espera, mas sua
geração fica anexada à conexão (veja *Posse de teardown* abaixo), então o reaper a poupa enquanto
estiver estacionada. O lease não é permanente: assim que o deferral responde, a conexão volta à regra
comum de keep-alive e é ceifada depois da próxima janela de silêncio.

Duas consequências que valem saber:

- O reaper nunca limita uma resposta deferred. Use `deferredTimeout` — ou o `defer($work, timeout:)`
  por chamada — para isso; veja *Deadlines* em *Ciclo de vida da resposta deferred*. Um deferral que
  estaciona sem deadline próprio (`Readiness::read($socket)` não tem nenhum por padrão) e sem orçamento
  segura a conexão e a Fiber até o cliente ir embora — limite-o, ou conte com `maxConnections`.
- A janela é grosseira por desenho: o supervisor roda no alarme de um segundo do worker, então o corte
  cai entre `N` e `N+1` segundos após o último tick com atividade (até `2N` a `2N+1` quando a escrita
  cai logo depois de um tick).

Protocolos de vida longa se comportam de outro jeito. Uma sessão WebSocket **substitui** o reaper pelo
seu supervisor de ping/pong logo depois do upgrade, então `connectionIdleTimeout` deixa de se aplicar a
ela. Um stream Server-Sent Events, em vez disso, **renova** o lease a partir do próprio supervisor, que
roda a cada `min(10, interval, heartbeat)` segundos e nunca mais devagar que a expiração da própria
conexão — então um `connectionIdleTimeout` curto só faz esse supervisor bater mais vezes.
`connectionIdleTimeout: 0` desativa o reaper por completo — só faça isso atrás de um proxy que imponha
o próprio timeout de ociosidade.

### SSL/TLS

Passe um array `secure` com opções de contexto de stream do PHP para habilitar HTTPS. O servidor muda automaticamente o esquema para `https://`:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 4,
   secure: [
      'local_cert'  => '/caminho/para/certificado.pem',
      'local_pk'    => '/caminho/para/chave-privada.pem',
      'verify_peer' => false,
   ],
);
```

Para desenvolvimento local, o Bootgly inclui certificados auto-assinados em `@/certificates/`:

```php
secure: [
   'local_cert' => BOOTGLY_ROOT_DIR . '@/certificates/localhost.cert.pem',
   'local_pk'   => BOOTGLY_ROOT_DIR . '@/certificates/localhost.key.pem',
   'verify_peer' => false,
],
```

> [!NOTE]
> Para produção, use certificados de uma CA confiável como o Let's Encrypt.

### HTTP/2

O servidor fala HTTP/2 nativamente na mesma porta e rotas. Com `secure` definido, o ALPN
anuncia `h2,http/1.1` automaticamente; em texto claro, clientes conectam com prior
knowledge — sem configuração alguma (desligue o HTTP/2 por completo com
`enableHTTP2: false`):

```bash
curl -s --http2-prior-knowledge http://127.0.0.1:8080/ -w '%{http_version}\n'
# 2
```

Os handlers não mudam — `$Request->protocol` reporta `'HTTP/2'`. Modos de negociação,
HPACK, multiplexação, controle de fluxo, limites embutidos e ressalvas atuais estão na
página **[HTTP/2](/manual/WPI/HTTP/HTTP_Server_CLI/HTTP2/)**.

### Rebaixamento de Privilégios

Ao fazer bind em portas privilegiadas (< 1024), o processo precisa iniciar como root. Use `user` e `group` para rebaixar para uma identidade sem privilégios imediatamente após o socket ser vinculado:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 4,
   secure: [ /* ... */ ],
   user: 'www-data',
   group: 'www-data',
);
```

> [!WARNING]
> Tanto `user` quanto `group` requerem a extensão PHP `posix` e o processo deve ser iniciado como root.

## Eventos

O método `on()` registra callbacks para o ciclo de vida do servidor e o tratamento de requisições:

| Evento | Callback | Descrição |
|---|---|---|
| `Events::RequestReceived` | `callable` | Obrigatório — trata cada requisição HTTP recebida. |
| `Events::ServerAdvertised` | `?callable` | Opcional — banner de inicialização; disparado no processo que possui o terminal (no modo Daemon, o launcher). |
| `Events::ServerStarted` | `?callable` | Opcional — disparado após todos os workers estarem ativos. |
| `Events::ServerStopped` | `?callable` | Opcional — disparado após todos os workers serem encerrados. |

### `Events::RequestReceived`

Chamado por cada processo **worker** para cada requisição HTTP recebida. Recebe os objetos `$Request` e `$Response`.

```php
$Server->on(
   Events::RequestReceived,
   function ($Request, $Response) {
      return $Response(body: 'Hello, World!');
   }
);
```

Para aplicações maiores, carregue as rotas da pasta `router/` do projeto com `Router::load()`:

```php
$Server->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'));
```

> [!IMPORTANT]
> O handler `Events::RequestReceived` executa dentro de cada processo **worker**. O estado não é compartilhado entre workers — use memória compartilhada ou armazenamentos externos (Redis, DB) para comunicação entre workers.

### Carregando rotas

`Router::load()` é a forma canônica de registrar rotas. Aponta para a pasta `router/` do projeto e retorna o handler de requisição passado para `Events::RequestReceived`:

```php :filename="HTTP_Server_CLI.Project.php";
$Server->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'));
```

Dentro da pasta:

- **`router/router.index.php`** — um manifesto listando os nomes dos route sets ativos. Cada nome resolve para `router/routes/<Name>.routes.php`. Liste mais de um para compor vários sets em um único handler.
- **`router/routes/<Name>.routes.php`** — um route set: uma generator-closure `(Request, Response, Router): Generator` que faz `yield` das suas rotas.

```php :group="router-load"; :tab="router.index.php"; :breadcrumb="router > router.index.php";
// Manifesto dos nomes dos route sets ativos
return [
   'Database',           // ativo
   // 'Authentication',  // descomente para também carregar (sets são compostos na ordem)
];
```

```php :group="router-load"; :tab="Database.php"; :breadcrumb="router > routes > Database.php";
// Um route set (generator-closure)
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;

return static function (Request $Request, Response $Response, Router $Router): Generator {
   yield $Router->route('/users', fn (Request $Request, Response $Response) =>
      $Response->JSON->send(['ok' => true]), GET);
};
```

Um único set é retornado diretamente; múltiplos sets são compostos (`yield from` em cada) num só handler. A pasta também é a casa do router — reservada para um futuro arquivo `router.Config.php` de defaults.

```php
Router::load (string $path): Closure
```

Lê `$path/router.index.php` (um manifesto de nomes de route sets), resolve cada nome para `$path/routes/<Name>.routes.php`, e retorna um único handler closure (compondo múltiplos sets com `yield from`). Lança `InvalidArgumentException` quando o index ou um set nomeado não existe, ou quando um set não retorna um `Closure`.

### serverAdvertised

Disparado uma vez na inicialização, no processo que **possui o terminal** — no modo Daemon, o launcher (então o banner sobrevive ao detach); nos outros modos, o master logo antes do seu loop. Componha o banner de inicialização do projeto aqui e chame `advertise()` para as linhas de endereço:

```php
use const Bootgly\CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server->on(
   Events::ServerAdvertised,
   function ($Server) {
      CLI->Terminal->Output->render('@.;@#green:✓ Meu projeto iniciado@;@.;');
      $Server->advertise();
   }
);
```

`advertise()` imprime o endpoint vinculado: `Local:` sempre e `Network:` quando o bind cobre interfaces externas — o primeiro IPv4 não-loopback da máquina, também exposto como `$Server->network`. Fica mudo no runner de testes e com a saída totalmente silenciada.

### serverStarted

Disparado no processo **master** após todos os workers terem sido criados via fork e o socket do servidor estar vinculado. Use para registrar timers ou configurar estado no lado do master. No modo Daemon o terminal do master já está desconectado — renderize o banner de inicialização em `serverAdvertised`.

Propriedades do `$Server` disponíveis no callback:

| Propriedade | Tipo | Descrição |
|---|---|---|
| `$Server->host` | `string` | Endereço de host vinculado. |
| `$Server->port` | `int` | Número da porta vinculada. |
| `$Server->socket` | `string` | Prefixo do esquema — `http://` ou `https://`. |
| `$Server->network` | `null\|string` | Primeiro IPv4 não-loopback da máquina — `null` quando nenhum é resolvível. |

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server->on(
   Events::ServerStarted,
   function ($Server) {
      // Configuração no lado do master — timers, schedulers, registries...
   }
);
```

### serverStopped

Disparado no processo **master** após todos os workers serem encerrados. Use para limpeza ou saída final.

```php
use const Bootgly\CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server->on(
   Events::ServerStopped,
   function ($Server) {
      $Output = CLI->Terminal->Output;
      $Output->render('@.;@#yellow:■ HTTP Server encerrado@;@.;');
   }
);
```

### Exemplo Completo

```php
use const Bootgly\CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server
   ->on(Events::RequestReceived, fn ($Request, $Response) => $Response(body: 'Hello, World!'))
   ->on(Events::ServerStarted, function ($Server) {
      $Output = CLI->Terminal->Output;

      $protocol = $Server->socket ?? 'http://';
      $host     = $Server->host   ?? '0.0.0.0';
      $port     = $Server->port   ?? 0;

      $Output->render('@.;@#green:✓ HTTP Server iniciado@;@.;');
      $Output->render('  Escutando em @#cyan:' . $protocol . $host . ':' . $port . '@;@.;');
      $Output->render('  @#green:● Pronto para conexões@;@..;');
   })
   ->on(Events::ServerStopped, function ($Server) {
      $Output = CLI->Terminal->Output;
      $Output->render('@.;@#yellow:■ HTTP Server encerrado@;@.;');
   });
```

## Ciclo de Vida do Servidor

O servidor segue um ciclo de vida de status bem definido:

```
Booting → Configuring → Starting → Running → Paused → Stopping
```

- **Booting**: Inicialização interna (logger, conexões, event loop, gerenciador de processos).
- **Configuring**: Host, port, workers e SSL são armazenados.
- **Starting**: O SAPI é iniciado, sinais POSIX são instalados, workers são criados via fork.
- **Running**: Workers estão processando requisições no event loop.
- **Paused**: O socket do servidor é removido do event loop — novas conexões não são aceitas. Conexões existentes continuam.
- **Stopping**: Workers são encerrados, arquivos PID/lock são removidos.

## Arquitetura Master/Worker

O servidor utiliza uma arquitetura **multi-processo** com `fork()`:

- O processo **master** gerencia o ciclo de vida: tratamento de sinais, recuperação de workers e coordenação.
- Cada processo **worker** cria seu próprio socket de servidor usando `SO_REUSEPORT`, de forma que todos fazem bind independentemente na mesma porta. Isso evita contenção em um socket compartilhado.
- Quando um worker morre inesperadamente, o master automaticamente cria um substituto no mesmo índice via tratamento do `SIGCHLD`.
- Opções de socket por worker: `backlog: 102400`, `SO_KEEPALIVE`, `TCP_NODELAY`.

```
Processo Master
├── fork() → Worker 1: socket bind → event loop
├── fork() → Worker 2: socket bind → event loop
├── ...
└── fork() → Worker N: socket bind → event loop
```

## Event Loop

Cada worker executa um event loop baseado em `stream_select()` que lida com:

- **Conexões de entrada**: Aceitas e registradas para monitoramento de leitura.
- **Leitura de requisições**: Dados TCP brutos são decodificados em requisições HTTP.
- **Escrita de respostas**: Respostas HTTP codificadas são escritas nos sockets dos clientes.
- **PHP Fibers**: O event loop se integra com PHP Fibers para suportar respostas deferred (assíncronas). Veja `$Response->defer()` para detalhes.

O event loop suporta aproximadamente 1000 file descriptors simultâneos (limite do `stream_select()`). Quando Fibers estão ativas, o loop opera em modo non-blocking (polling); caso contrário, ele bloqueia até que I/O esteja disponível, garantindo zero uso de CPU em idle.

## Ciclo de vida da resposta deferred

Uma resposta deferred (`$Response->defer()`) sobrevive ao handler que a criou: o cliente pode sumir, o worker pode desligar e a conexão pode ser reaproveitada para a próxima requisição enquanto o trabalho deferido ainda está estacionado. Três peças colaboram para que isso seja seguro.

Trabalho deferido que chama um upstream por um response resource (`$Response->Upstream->request()`, veja [Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/)) estaciona do mesmo jeito: o dial, o handshake TLS e a espera pela resposta suspendem a Fiber no reactor do worker, então o worker continua atendendo as outras conexões — e quando o deferral termina, normalmente ou porque o cliente foi embora, o resource libera todas as conexões upstream que abriu.

As três são **pay-for-use**. Uma requisição síncrona que ninguém observa não aloca nenhuma delas — sem exchange, sem token, sem weak map.

### O exchange: o dono terminal de uma requisição

Um `Exchange` só é aberto quando algo observa a admissão da requisição — por exemplo, ao subir a `Telemetry`. Ele chega ao estado terminal exatamente uma vez, tendo a requisição terminado com resposta ou sido cancelada:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Exchange;

$Exchange->observe(static function (Exchange $Exchange, null|int $code): void {
   // $code é o status code final — ou null quando o exchange foi cancelado.
});
```

- **Terminal exatamente uma vez.** Um finish reentrante ou repetido é no-op.
- **Um observador tardio ainda dispara**, imediatamente, com o resultado retido — registrar depois da transição não é um no-op silencioso.
- **Os observadores são contidos.** Um que lance exceção não suprime outro nem quebra o teardown.
- **O exchange retém só o status code**, nunca a `Response` terminal. Segurar a resposta prenderia a requisição, o corpo e os recursos dela enquanto qualquer listener mantivesse o token.

### Cancelamento não é um status

Quando o transporte ou o scheduler derruba o trabalho antes que uma resposta se tornasse observável, o exchange finaliza com `$code === null`.

O Bootgly **não** inventa uma classe de status para esse caso — não existe um `499` sintético. Um exchange cancelado fecha sua contabilidade central (conta como requisição, tem a duração observada, sai do gauge de in-flight) e não contribui em nada para os contadores de resposta por classe. Veja o guia de [Observabilidade](/observability) para como isso aparece nas métricas.

### Capacidade do scheduler

Deferir um exchange **observado** exige que o reactor implemente `Bootgly\ACI\Events\Cancelling`, um marcador sobre `Contextualizing` que não adiciona métodos:

```php
use Bootgly\ACI\Events\Cancelling;
use Bootgly\ACI\Events\Contextualizing;

interface Cancelling extends Contextualizing {}
```

O marcador existe porque um exchange observado precisa ser fechado *deterministicamente* quando seu trabalho é cancelado — um scheduler incapaz de garantir isso deixaria a contabilidade de in-flight presa para sempre. O reactor `Select` do próprio Bootgly o implementa, então isso só te afeta se você substituir o reactor: um scheduler customizado que implemente apenas `Contextualizing` faz um `defer()` observado falhar cedo, antes de a requisição ser clonada ou de arquivos enviados serem movidos.

O contrato base `Scheduler` também carrega `interrupt()` — o meio pelo qual um deadline alcança uma Fiber estacionada (veja *Deadlines* e a Referência). Um scheduler customizado precisa implementá-lo.

### Posse de teardown

`Ownership` vincula donos de teardown a um escopo de transporte ou protocolo — uma conexão, uma stream HTTP/2 — sem adicionar métodos públicos a essas classes não-finais:

```php
use Bootgly\WPI\Endpoints\Servers\Ownership;

Ownership::attach($Connection, $Owner);   // $Owner implementa Disconnecting
Ownership::detach($Connection, $Owner);   // o trabalho dele terminou normalmente
Ownership::close($Connection);            // notifica cada dono anexado exatamente uma vez
```

- **Exatamente uma vez, sempre.** Anexar a um escopo *já fechado* notifica o dono imediatamente, e um segundo attach do mesmo dono não faz nada — inclusive um attach reentrante de dentro do próprio `disconnect()` dele.
- **Fechar não custa nada quando ninguém anexou**, que é o caso comum de toda conexão e toda stream HTTP/2: o escopo guarda apenas um marcador terminal e nenhuma coleção.
- **Um escopo fechado nunca reabre.** `detach()` nele é ignorado, então um attach tardio nunca pode ser notificado duas vezes.

### Deadlines

Um deferral estacionado é limitado por um **orçamento**, em segundos: o `deferredTimeout` global passado
ao `configure()` (padrão `0` = sem teto) ou, com precedência, o `timeout` por chamada do `defer()`. O
orçamento só é armado quando o trabalho de fato estaciona, e é desarmado no instante em que a geração
termina — normalmente, por um handoff aninhado ou por teardown — então um deferral concluído nunca deixa
um deadline velho para a Fiber que será reaproveitada em seguida.

Quando ele estoura, o reactor entrega um `Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Timeout` no
ponto de suspensão da Fiber — **antes** de o exchange terminar. O trabalho deferido o vê exatamente como
qualquer outra exceção lançada de `$Response->wait()` (ou de uma chamada de resource construída sobre
ele): seus `catch` e `finally` rodam, e ele ainda pode escolher a própria resposta:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Timeout;

yield $Router->route('/report', function ($Request, Response $Response) {
   return $Response->defer(function (Response $Response): void {
      try {
         // 'Upstream' é um HTTP response resource registrado em responseResources
         $Upstream = $Response->Upstream->request('GET', '/report');
         $Response->JSON->send(['code' => $Upstream->code]);
      }
      catch (Timeout $Timeout) {
         $Response(code: 504, body: "O upstream demorou mais que {$Timeout->timeout}s.");
      }
   }, timeout: 2.5);
}, GET);
```

Sem tratamento pelo trabalho, o `Timeout` é oferecido aos middlewares `Recovering` da rota, depois aos do
pipeline global (veja *Fronteiras de Erro e Trabalho Deferred* na página
[Middlewares](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares)); sem tratamento por eles também, é respondido
com um `503 Service Unavailable` limpo — a página de erro do ambiente, sem trace de throwable. Um warning
é registrado com a linha da requisição e o orçamento em qualquer dos casos. O mesmo orçamento limita um
middleware `Recovering` que estaciona dentro de `recover()` — um orçamento re-armado para a caminhada das
fronteiras, depois o `503` limpo. O
exchange termina com esse `503`, então a telemetria conta uma resposta `5xx`, não um cancelamento. Um
orçamento por geração: um deferral que captura o `Timeout` e estaciona de novo não é rearmado.

### Quando o cliente vai embora

Se a conexão — ou a stream HTTP/2 — fecha enquanto o deferral ainda está estacionado, a geração dele é
cancelada e a Fiber **nunca é retomada**: nenhum bloco `catch` roda, porque nada é lançado dentro dela —
e nenhum middleware `Recovering` é consultado: nada foi lançado, e não há mais ninguém para responder.
Em vez disso o reactor libera a Fiber no seu próximo safe point, fora de qualquer varredura de fila, e
o PHP a desenrola — todo `finally` pendente roda na hora, antes de o worker voltar a esperar I/O.
Coloque no `finally` a limpeza que não pode esperar — soltar um lock, fechar um arquivo, devolver um
handle ao pool — e lembre de duas regras:

- Não chame `wait()` nem um resource de dentro desse `finally`. O `wait()` não vai estacionar ali — a
  capacidade de esperar da geração é revogada no instante do cancelamento, então ele devolve o
  `Response` na hora e seu código segue como se tivesse esperado; nunca use isso para detectar o
  desenrolar. Um resource recusa: o resource HTTP lança `LogicException` ("must be used inside a live
  deferred context") e, sem captura, o resto do bloco é pulado.
- Use o `$Response` entregue à sua closure, não o `WPI->Response` ambiente: o contexto do segmento de
  execução não é religado durante o desenrolar. O mesmo vale para o request: leia o snapshot que a
  closure recebeu (o segundo argumento dela, o mesmo objeto que `$Response->Request`) — nunca o
  `$Request` da rota, que o servidor já esvaziou e reutilizou. Depois de um cancelamento os uploads e os
  fields do snapshot também já foram liberados: leia o que precisa antes de estacionar.

Um `Fiber::getCurrent()` guardado numa variável através de um `wait()` prende a Fiber à própria pilha e
anula a liberação imediata — leia, use, `unset()`.

### Referência

```php
public function observe (Closure $Observer): bool
```

Registra um observador terminal em um `Exchange`. A closure recebe `(Exchange $Exchange, null|int $code)`. Retorna `true` quando o observador foi enfileirado e `false` quando o exchange já havia finalizado e o observador rodou imediatamente.

```php
public function check (): bool
```

Se este exchange já alcançou sua transição terminal.

```php
public function finish (null|Response $Response): bool
```

Finaliza o exchange exatamente uma vez, retendo somente `$Response->code`. Passe `null` para cancelamento de transporte ou scheduler. Retorna `false` se ele já era terminal.

```php
public static function fetch (object $Owner): null|self
```

O exchange carregado por um alias `Request` ativo ou por um snapshot fraco retido.

```php
public static function attach (object $Scope, Disconnecting $Owner): void
```

Anexa um dono de teardown a um escopo. Se o escopo já estiver fechado, o `disconnect()` do dono é invocado imediatamente — uma vez por dono, para sempre.

```php
public static function detach (object $Scope, Disconnecting $Owner): void
```

Remove um dono cujo trabalho terminou normalmente. Ignorado em escopo fechado, cujas identidades notificadas ficam retidas como marcadores terminais.

```php
public static function close (object $Scope): void
```

Fecha um escopo e invoca `disconnect()` em cada dono anexado exatamente uma vez. Refechar é no-op.

```php
public static function check (object $Scope): bool
```

Se um escopo vivo ainda carrega pelo menos um dono anexado — a pergunta do reaper de ociosidade. `false` para um escopo fechado, um desconhecido ou um storage esvaziado por `detach()`.

```php
public function defer (Closure $work, int|float $timeout = 0): Response
```

Roda `$work` numa Fiber do pool que pode estacionar no reactor do worker. `$timeout` é o orçamento, em segundos, antes de um `Response\Timeout` ser entregue no ponto de espera; `0` usa `Response::$deferredTimeout`, onde `0` significa sem teto.

```php
public function interrupt (Fiber $Fiber, Throwable $Throwable): bool
```

(`Bootgly\ACI\Events\Scheduler`) Entrega `$Throwable` no ponto de suspensão de uma Fiber que este scheduler estacionou: a Fiber sai de todo assento de espera, é retomada com `Fiber::throw()` dentro do seu binding de segmento de execução, e o que ela suspender em seguida é enfileirado de novo — a geração dela fica intocada. Retorna `false` quando a Fiber não está estacionada neste scheduler (rodando, terminada, desanexada ou ligada a uma geração terminal, que é despejada em vez disso).

```php
final class Timeout extends RuntimeException
```

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Timeout` — entregue no ponto de suspensão de uma resposta deferred quando o orçamento dela estourou. `$timeout` (readonly, segundos) é o orçamento que estourou.
