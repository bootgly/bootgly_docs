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

Um arquivo de projeto (ex: `HTTP_Server_CLI.project.php`) retorna uma instância de `Project`:

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

```bash
bootgly project Demo/HTTP_Server_CLI start
```

Modo interativo:

```bash
bootgly project Demo/HTTP_Server_CLI start -i
```

Modo monitor:

```bash
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

```php :filename="HTTP_Server_CLI.project.php";
$Server->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'));
```

Dentro da pasta:

- **`router/router.index.php`** — um manifesto listando os nomes dos route sets ativos. Cada nome resolve para `router/routes/<Name>.php`. Liste mais de um para compor vários sets em um único handler.
- **`router/routes/<Name>.php`** — um route set: uma generator-closure `(Request, Response, Router): Generator` que faz `yield` das suas rotas.

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

Um único set é retornado diretamente; múltiplos sets são compostos (`yield from` em cada) num só handler. A pasta também é a casa do router — reservada para um futuro arquivo `router.config.php` de defaults.

```php
Router::load (string $path): Closure
```

Lê `$path/router.index.php` (um manifesto de nomes de route sets), resolve cada nome para `$path/routes/<Name>.php`, e retorna um único handler closure (compondo múltiplos sets com `yield from`). Lança `InvalidArgumentException` quando o index ou um set nomeado não existe, ou quando um set não retorna um `Closure`.

### serverStarted

Disparado no processo **master** após todos os workers terem sido criados via fork e o socket do servidor estar vinculado. Use para exibir informações de inicialização, registrar timers ou configurar estado no lado do master.

Propriedades do `$Server` disponíveis no callback:

| Propriedade | Tipo | Descrição |
|---|---|---|
| `$Server->host` | `string` | Endereço de host vinculado. |
| `$Server->port` | `int` | Número da porta vinculada. |
| `$Server->socket` | `string` | Prefixo do esquema — `http://` ou `https://`. |

```php
use const Bootgly\CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server->on(
   Events::ServerStarted,
   function ($Server) {
      $Output = CLI->Terminal->Output;

      $protocol = $Server->socket ?? 'http://';
      $host     = $Server->host   ?? '0.0.0.0';
      $port     = $Server->port   ?? 0;

      $Output->render('@.;@#green:✓ HTTP Server iniciado@;@.;');
      $Output->render('  Escutando em @#cyan:' . $protocol . $host . ':' . $port . '@;@.;');
      $Output->render('  @#green:● Pronto para conexões@;@..;');
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
Booting → Configuring → Starting → Running → Pausing / Paused → Stopping
```

- **Booting**: Inicialização interna (logger, conexões, event loop, gerenciador de processos).
- **Configuring**: Host, port, workers e SSL são armazenados.
- **Starting**: O SAPI é iniciado, sinais POSIX são instalados, workers são criados via fork.
- **Running**: Workers estão processando requisições no event loop.
- **Pausing / Paused**: O socket do servidor é removido do event loop — novas conexões não são aceitas. Conexões existentes continuam.
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
