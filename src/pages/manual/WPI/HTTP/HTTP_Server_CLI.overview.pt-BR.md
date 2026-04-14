# HTTP Server CLI

O HTTP Server CLI é o servidor HTTP nativo do Bootgly PHP Framework. Ele é um servidor event-driven, multi-worker, construído sobre uma infraestrutura TCP non-blocking com suporte a PHP Fibers para respostas assíncronas.

## Bootstrapping com Projects

No Bootgly, servidores são iniciados por Projetos — não por comandos do framework. Cada projeto define sua própria lógica de boot, incluindo instanciação do servidor, configuração e registro do handler.

Um arquivo de projeto (ex: `HTTP_Server_CLI.project.php`) retorna uma instância de `Project`:

```php
use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;


return new Project(
   name: 'HTTP Server CLI',
   description: 'Demonstração do servidor HTTP com roteamento e captura de 404',
   version: '0.1.0',
   author: 'Seu Nome',

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
      $Server->on(
         request: require __DIR__ . '/router/routes.php'
      );
      $Server->start();
   }
);
```

Para iniciar o servidor, execute:

```bash
bootgly project Demo start --HTTP_Server_CLI
```

Modo interativo:

```bash
bootgly project Demo start --HTTP_Server_CLI -i
```

Modo monitor:

```bash
bootgly project Demo start --HTTP_Server_CLI -m
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
| `ssl` | `?array` | `null` | Opções de contexto de stream SSL. Quando fornecido, o esquema muda para `https://`. |
| `user` | `?string` | `null` | Nome do usuário POSIX para rebaixar o processo após o bind. |
| `group` | `?string` | `null` | Nome do grupo POSIX para rebaixar o processo após o bind. |
| `requestMaxFileSize` | `?int` | `null` | Tamanho máximo (em bytes) de um arquivo enviado via upload. Padrão: `500 MB`. |
| `requestMaxBodySize` | `?int` | `null` | Tamanho máximo (em bytes) do corpo da requisição. Padrão: `10 MB`. |

```php
$Server->configure(
   host: '0.0.0.0',
   port: 8082,
   workers: 4,
   ssl: null,
   user: null,
   group: null,
   requestMaxFileSize: 500 * 1024 * 1024, // 500 MB (padrão)
   requestMaxBodySize: 10 * 1024 * 1024,  // 10 MB (padrão)
);
```

### SSL/TLS

Passe um array `ssl` com opções de contexto de stream do PHP para habilitar HTTPS. O servidor muda automaticamente o esquema para `https://`:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 4,
   ssl: [
      'local_cert'  => '/caminho/para/certificado.pem',
      'local_pk'    => '/caminho/para/chave-privada.pem',
      'verify_peer' => false,
   ],
);
```

Para desenvolvimento local, o Bootgly inclui certificados auto-assinados em `@/certificates/`:

```php
ssl: [
   'local_cert' => BOOTGLY_ROOT_DIR . '@/certificates/localhost.cert.pem',
   'local_pk'   => BOOTGLY_ROOT_DIR . '@/certificates/localhost.key.pem',
   'verify_peer' => false,
],
```

> [!NOTE]
> Para produção, use certificados de uma CA confiável como o Let's Encrypt.

### Rebaixamento de Privilégios

Ao fazer bind em portas privilegiadas (< 1024), o processo precisa iniciar como root. Use `user` e `group` para rebaixar para uma identidade sem privilégios imediatamente após o socket ser vinculado:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 4,
   ssl: [ /* ... */ ],
   user: 'www-data',
   group: 'www-data',
);
```

> [!WARNING]
> Tanto `user` quanto `group` requerem a extensão PHP `posix` e o processo deve ser iniciado como root.

## Eventos

O método `on()` registra callbacks para o ciclo de vida do servidor e o tratamento de requisições:

```php
$Server->on(
   request: callable,  // Obrigatório — trata cada requisição HTTP recebida
   started: ?callable, // Opcional — disparado após todos os workers estarem ativos
   stopped: ?callable, // Opcional — disparado após todos os workers serem encerrados
);
```

### `request`

Chamado por cada processo **worker** para cada requisição HTTP recebida. Recebe os objetos `$Request` e `$Response`.

```php
$Server->on(
   request: function ($Request, $Response) {
      return $Response(body: 'Hello, World!');
   }
);
```

Para aplicações maiores, carregue o handler de um arquivo externo que retorna um callable:

```php
$Server->on(
   request: require __DIR__ . '/router/routes.php'
);
```

> [!IMPORTANT]
> O handler `request` executa dentro de cada processo **worker**. O estado não é compartilhado entre workers — use memória compartilhada ou armazenamentos externos (Redis, DB) para comunicação entre workers.

### `started`

Disparado no processo **master** após todos os workers terem sido criados via fork e o socket do servidor estar vinculado. Use para exibir informações de inicialização, registrar timers ou configurar estado no lado do master.

Propriedades do `$Server` disponíveis no callback:

| Propriedade | Tipo | Descrição |
|---|---|---|
| `$Server->host` | `string` | Endereço de host vinculado. |
| `$Server->port` | `int` | Número da porta vinculada. |
| `$Server->socket` | `string` | Prefixo do esquema — `http://` ou `https://`. |

```php
use const Bootgly\CLI;

$Server->on(
   started: function ($Server) {
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

### `stopped`

Disparado no processo **master** após todos os workers serem encerrados. Use para limpeza ou saída final.

```php
use const Bootgly\CLI;

$Server->on(
   stopped: function ($Server) {
      $Output = CLI->Terminal->Output;
      $Output->render('@.;@#yellow:■ HTTP Server encerrado@;@.;');
   }
);
```

### Exemplo Completo

```php
use const Bootgly\CLI;

$Server->on(
   request: fn ($Request, $Response) => $Response(body: 'Hello, World!'),

   started: function ($Server) {
      $Output = CLI->Terminal->Output;

      $protocol = $Server->socket ?? 'http://';
      $host     = $Server->host   ?? '0.0.0.0';
      $port     = $Server->port   ?? 0;

      $Output->render('@.;@#green:✓ HTTP Server iniciado@;@.;');
      $Output->render('  Escutando em @#cyan:' . $protocol . $host . ':' . $port . '@;@.;');
      $Output->render('  @#green:● Pronto para conexões@;@..;');
   },

   stopped: function ($Server) {
      $Output = CLI->Terminal->Output;
      $Output->render('@.;@#yellow:■ HTTP Server encerrado@;@.;');
   }
);
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
- **PHP Fibers**: O event loop se integra com PHP Fibers para suportar respostas deferred (assíncronas). Veja o método `Response->defer()` para detalhes.

O event loop suporta aproximadamente 1000 file descriptors simultâneos (limite do `stream_select()`). Quando Fibers estão ativas, o loop opera em modo non-blocking (polling); caso contrário, ele bloqueia até que I/O esteja disponível, garantindo zero uso de CPU em idle.
