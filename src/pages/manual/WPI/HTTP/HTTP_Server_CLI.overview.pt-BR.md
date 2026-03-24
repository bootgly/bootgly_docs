# HTTP Server CLI

O HTTP Server CLI é o servidor HTTP nativo do Bootgly PHP Framework. Ele é um servidor event-driven, multi-worker, construído sobre uma infraestrutura TCP non-blocking com suporte a PHP Fibers para respostas assíncronas.

## Bootstrapping com Projects

No Bootgly, servidores são iniciados por Projetos — não por comandos do framework. Cada projeto define sua própria lógica de boot, incluindo instanciação do servidor, configuração e registro do handler.

Um arquivo de projeto (ex: `WPI.project.php`) retorna uma instância de `Project`:

```php
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Endpoints\Servers\Modes;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;


return new Project(
   name: 'HTTP Server CLI',
   description: 'HTTP server demo with routing and catch-all 404',
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
      $Server->handle(require __DIR__ . '/router/routes.php');
      $Server->start();
   }
);
```

Para iniciar o servidor, execute:

```bash
php bootgly @project HTTP_Server_CLI
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

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `host` | `string` | Endereço de bind. Use `'0.0.0.0'` para escutar em todas as interfaces. Quando definido como `'0.0.0.0'`, o domínio padrão é `localhost`. |
| `port` | `int` | Porta de escuta. |
| `workers` | `int` | Número de processos filhos criados via fork. Cada worker cria seu próprio socket via `SO_REUSEPORT`. |
| `ssl` | `?array` | Opções de contexto de stream SSL. Quando fornecido, o esquema muda para `https://`. |

```php
$Server->configure(
   host: '0.0.0.0',
   port: 8082,
   workers: 4,
   ssl: null
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
