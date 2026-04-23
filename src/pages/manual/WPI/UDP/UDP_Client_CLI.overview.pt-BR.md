# UDP Client CLI

O UDP Client CLI é o cliente de baixo nível do Bootgly para envio e recebimento de datagramas UDP. Ele é útil para clientes de protocolo customizado, fluxos de monitoramento, cenários de teste e geração leve de carga em PHP puro.

## Recursos

| Recurso | Descrição |
|---|---|
| **Cliente de datagramas UDP** | Envie payloads brutos para um servidor UDP e reaja às respostas com callbacks. |
| **Fluxo baseado em callbacks** | Registre hooks para inicialização do worker, conexão, desconexão, leituras e escritas. |
| **Múltiplos modos** | Execute em `MODE_DEFAULT`, `MODE_MONITOR` ou `MODE_TEST`. |
| **Opção multi-worker** | Inicie workers quando precisar de concôrrência ou de tráfego no estilo benchmark. |
| **Configuração simples** | Aponte o cliente para host e porta de destino com `configure()`. |
| **PHP puro** | Sem cURL nem dependência extra de cliente de rede. |

## Quick Start

Um fluxo típico do cliente UDP é: configurar o destino, conectar, definir o payload de saída e controlar o comportamento de leitura/escrita com callbacks.

```php
use Bootgly\WPI\Interfaces\UDP_Client_CLI;


$Client = new UDP_Client_CLI;

$Client->configure(
   host: '127.0.0.1',
   port: 9999
);

$Client->on(
   clientConnect: function ($Socket, $Connection) {
      $Connection->output = 'Hello, Bootgly UDP!';

      UDP_Client_CLI::$Event->add(
         $Socket,
         UDP_Client_CLI::$Event::EVENT_WRITE,
         $Connection
      );
   }
);

$Client->start();
```

## Modos

O construtor recebe uma das constantes de modo do cliente.

| Modo | Descrição |
|---|---|
| `UDP_Client_CLI::MODE_DEFAULT` | Executa no fluxo padrão de processo único. |
| `UDP_Client_CLI::MODE_MONITOR` | Mantém o cliente anexado para execução monitorada. |
| `UDP_Client_CLI::MODE_TEST` | Usa uma configuração mais leve orientada a testes. |

## Configuração

Use `configure()` para definir o endpoint remoto e a quantidade opcional de workers.

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Host de destino ou endereço IP. |
| `port` | `int` | — | Porta UDP de destino. |
| `workers` | `int` | `0` | Número de processos worker a iniciar. |

```php
$Client->configure(
   host: '127.0.0.1',
   port: 9999,
   workers: 1
);
```

## Callbacks

Registre callbacks de runtime com `on()`:

```php
$Client->on(
   workerStarted: ?Closure,
   clientConnect: ?Closure,
   clientDisconnect: ?Closure,
   datagramRead: ?Closure,
   datagramWrite: ?Closure,
);
```

### Hooks disponíveis

| Hook | Assinatura | Finalidade |
|---|---|---|
| `workerStarted` | `Closure($Client)` | Executa quando um worker é iniciado. |
| `clientConnect` | `Closure($Socket, $Connection)` | Executa quando o socket do cliente está pronto para uso. |
| `clientDisconnect` | `Closure($Connection)` | Executa quando o socket do cliente é fechado. |
| `datagramRead` | `Closure($Socket, $Connection)` | Executa após a leitura de um datagrama. |
| `datagramWrite` | `Closure($Socket, $Connection)` | Executa após ou ao redor do fluxo de escrita, dependendo da sua lógica de callback. |

Essa é a principal superfície pública de integração de `UDP_Client_CLI`.

## Fluxo Típico

Um modelo mental voltado ao consumidor para o cliente é:

1. criar o cliente
2. chamar `configure()`
3. registrar hooks com `on()`
4. chamar `connect()` diretamente ou deixar seu hook `workerStarted` fazer isso
5. definir `$Connection->output`
6. chamar `start()` e deixar os callbacks conduzirem o tráfego

O projeto demo usa exatamente esse padrão com modo monitor e encerramento por timer.

## Exemplo com Monitor Mode

```php
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;


return new Project(
   name: 'Demo UDP Client CLI',
   description: 'Demonstration project for Bootgly UDP Client CLI',
   version: '1.0.0',
   author: 'Bootgly',

   boot: function (array $arguments = [], array $options = []): void
   {
      $Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_MONITOR);
      $Client->configure(
         host: '127.0.0.1',
         port: getenv('PORT') ? (int) getenv('PORT') : 9999,
         workers: 1
      );

      $Client->on(
         workerStarted: function ($Client) {
            $Socket = $Client->connect();
            if ($Socket) {
               $Client::$Event->loop();
            }
         },
         clientConnect: function ($Socket, $Connection) {
            Timer::add(
               interval: 10,
               handler: function ($Connection) {
                  $Connection->close();
               },
               args: [$Connection],
               persistent: false
            );

            $Connection->output = 'Hello, Bootgly UDP!';
            UDP_Client_CLI::$Event->add($Socket, UDP_Client_CLI::$Event::EVENT_WRITE, $Connection);
         },
         clientDisconnect: function ($Connection) use ($Client) {
            $Client->log(
               'Connection #' . $Connection->id . ' (' . $Connection->address . ':' . $Connection->port . ')'
               . ' from Worker with PID @_:' . $Client->Process->id . '_@ was closed! @\;'
            );
         },
         datagramWrite: function ($Socket, $Connection) {
            UDP_Client_CLI::$Event->add($Socket, UDP_Client_CLI::$Event::EVENT_WRITE, $Connection);
         },
         datagramRead: null,
      );

      $Client->start();
   }
);
```

## Comandos e operação

A interface de comandos interativos do cliente é intencionalmente simples.

- `quit`
- `clear`
- `help`

Para muitos casos de uso, os controles mais importantes são seus callbacks, a quantidade de workers e o modo selecionado.

## Notas para Consumidores

- A API pública de `configure()` não expõe TLS ou DTLS.
- UDP é orientado a datagramas e não garante entrega, ordenação nem retransmissão.
- `MODE_TEST` é útil quando você quer um runtime mais leve para fluxos de teste.

## Exemplo Completo

```php
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;


return new Project(
   name: 'Demo UDP Client CLI',
   description: 'Demonstration project for Bootgly UDP Client CLI',
   version: '1.0.0',
   author: 'Bootgly',

   boot: function (array $arguments = [], array $options = []): void
   {
      $Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_MONITOR);
      $Client->configure(
         host: '127.0.0.1',
         port: getenv('PORT') ? (int) getenv('PORT') : 9999,
         workers: 1
      );

      $Client->on(
         workerStarted: function ($Client) {
            $Socket = $Client->connect();
            if ($Socket) {
               $Client::$Event->loop();
            }
         },
         clientConnect: function ($Socket, $Connection) {
            Timer::add(
               interval: 10,
               handler: function ($Connection) {
                  $Connection->close();
               },
               args: [$Connection],
               persistent: false
            );

            $Connection->output = 'Hello, Bootgly UDP!';
            UDP_Client_CLI::$Event->add($Socket, UDP_Client_CLI::$Event::EVENT_WRITE, $Connection);
         },
         clientDisconnect: function ($Connection) use ($Client) {
            $Client->log(
               'Connection #' . $Connection->id . ' (' . $Connection->address . ':' . $Connection->port . ')'
               . ' from Worker with PID @_:' . $Client->Process->id . '_@ was closed! @\;'
            );
         },
         datagramWrite: function ($Socket, $Connection) {
            UDP_Client_CLI::$Event->add($Socket, UDP_Client_CLI::$Event::EVENT_WRITE, $Connection);
         },
         datagramRead: null,
      );

      $Client->start();
   }
);
```
