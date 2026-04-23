# UDP Server CLI

O UDP Server CLI é o servidor de baixo nível do Bootgly para protocolos baseados em datagramas. Ele permite vincular a uma porta UDP, registrar um handler bruto de datagramas e executar o servidor em modos multi-worker adequados para desenvolvimento, monitoramento e execução em segundo plano.

## Recursos

| Recurso | Descrição |
|---|---|
| **Servidor orientado a datagramas** | Receba payloads UDP brutos e retorne payloads brutos para o remetente. |
| **Runtime multi-worker** | Inicie um ou mais processos worker para lidar com o tráfego. |
| **Modos operacionais** | Execute em `Daemon`, `Interactive`, `Monitor` ou `Test`. |
| **API simples de handler** | Registre um único callback `on(Closure $package)` para os datagramas recebidos. |
| **Controles via CLI** | Use comandos como `status`, `stop`, `pause`, `resume` e `reload` em fluxos interativos. |
| **Suporte à redução de privilégios** | Opcionalmente mude para um usuário e grupo POSIX de menor privilégio após vincular o socket. |
| **PHP puro** | Não depende de servidor externo. |

## Bootstrapping com Projects

No Bootgly, servidores UDP normalmente são iniciados por um Project. O projeto cria o servidor, configura, registra o handler de datagramas e então chama `start()`.

```php
use function getenv;
use function shell_exec;

use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\UDP_Server_CLI;


return new Project(
   name: 'Demo UDP Server CLI',
   description: 'Demonstration project for Bootgly UDP Server CLI',
   version: '1.0.0',
   author: 'Bootgly',

   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new UDP_Server_CLI(Mode: match (true) {
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $Server->configure(
         host: '0.0.0.0',
         port: getenv('PORT') ? (int) getenv('PORT') : 9999,
         workers: max(1, (int) shell_exec('nproc') ?: 1),
      );

      $Server->on(fn ($input) => $input);

      $Server->start();
   }
);
```

## Quick Start

O fluxo mínimo de uso é simples: configure o socket, registre um handler e inicie o servidor.

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\UDP_Server_CLI;


$Server = new UDP_Server_CLI(Modes::Monitor);

$Server->configure(
   host: '0.0.0.0',
   port: 9999,
   workers: 1
);

$Server->on(
   datagramReceive: static fn (string $input): string => $input
);

$Server->start();
```

Este exemplo funciona como um echo server: qualquer payload enviado pelo cliente é retornado sem alteração.

> [!IMPORTANT]
> Mantenha o handler focado no payload do datagrama que você deseja aceitar e responder. A API pública é propositalmente simples: recebe bytes, retorna bytes.

## Modos de Operação

O construtor recebe `Bootgly\API\Endpoints\Server\Modes`.

| Modo | Descrição |
|---|---|
| `Modes::Daemon` | Executa em segundo plano, sem interface interativa. |
| `Modes::Interactive` | Mantém o servidor anexado ao terminal para emissão de comandos. |
| `Modes::Monitor` | Mostra status em tempo real e é conveniente durante o desenvolvimento. |
| `Modes::Test` | Usa uma instância orientada a testes para fluxos automatizados. |

## Configuração

Use `configure()` para definir onde o servidor escuta e quantos workers serão iniciados.

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Endereço de bind, como `0.0.0.0` para todas as interfaces. |
| `port` | `int` | — | Porta UDP de escuta. |
| `workers` | `int` | — | Número de processos worker. |
| `user` | `?string` | `null` | Usuário POSIX opcional para troca após o bind. |
| `group` | `?string` | `null` | Grupo POSIX opcional para troca após o bind. |

```php
$Server->configure(
   host: '0.0.0.0',
   port: 9999,
   workers: 4,
   user: 'www-data',
   group: 'www-data'
);
```

### Redução de privilégios

Se você vincular a uma porta privilegiada, pode iniciar como root e depois mudar para uma conta POSIX de menor privilégio após a criação do socket.

> [!WARNING]
> `user` e `group` dependem de funções POSIX e só são úteis em sistemas compatíveis quando o processo inicia com privilégios suficientes.

## Handler de Datagramas

Registre o handler de recebimento com `on()`:

```php
$Server->on(
   datagramReceive: function (string $input): string {
      return strtoupper($input);
   }
);
```

Este é o principal ponto de extensão para consumidores de `UDP_Server_CLI`.

### Contrato do handler

| Lado | Contrato |
|---|---|
| Entrada | Payload bruto do datagrama recebido pelo servidor. |
| Saída | Payload bruto a ser enviado de volta como resposta. |
| Execução | Roda nos processos worker enquanto o servidor está ativo. |

Como UDP é orientado a datagramas, projete o callback em torno de mensagens autocontidas, e não de sessões de conexão.

## Comandos de CLI

Ao rodar de forma interativa, o servidor expõe comandos como:

- `status`
- `stop`
- `pause`
- `resume`
- `reload`
- `monitor`
- `stats`
- `connections`
- `help`

Eles são úteis para operar e observar o servidor em execução pelo terminal.

## Notas para Consumidores

- A API pública de `configure()` **não** expõe opções de SSL/TLS ou DTLS.
- UDP é orientado a mensagens e não oferece as mesmas garantias de entrega do TCP.
- `pause()` e `resume()` estão disponíveis quando você precisa interromper e retomar temporariamente a escuta.

## Exemplo Completo

```php
use function getenv;
use function shell_exec;

use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\UDP_Server_CLI;


return new Project(
   name: 'Demo UDP Server CLI',
   description: 'Demonstration project for Bootgly UDP Server CLI',
   version: '1.0.0',
   author: 'Bootgly',

   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new UDP_Server_CLI(Mode: match (true) {
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $Server->configure(
         host: '0.0.0.0',
         port: getenv('PORT') ? (int) getenv('PORT') : 9999,
         workers: max(1, (int) shell_exec('nproc') ?: 1),
      );

      $Server->on(fn ($input) => $input);

      $Server->start();
   }
);
```
