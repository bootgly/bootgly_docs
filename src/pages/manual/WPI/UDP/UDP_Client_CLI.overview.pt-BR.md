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
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Events;


$Client = new UDP_Client_CLI;

$Client->configure(
   new Configs(
      host: '127.0.0.1',
      port: 9999
   )
);

$Client->on(
   Events::ClientConnect,
   function ($Socket, $Connection) {
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

O `configure()` é variádico sobre value objects **Configs** — um por concern, aplicados em qualquer ordem.
O transporte vive em `UDP_Client_CLI\Configs`:

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Host de destino ou endereço IP. |
| `port` | `int` | — | Porta UDP de destino. |
| `workers` | `int` | `0` | Número de processos worker a iniciar. |

```php
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Configs;


$Client->configure(
   new Configs(
      host: '127.0.0.1',
      port: 9999,
      workers: 1
   )
);
```

> [!IMPORTANT]
> Todo Configs aceita **apenas named arguments**. Seu primeiro parâmetro é um guard slot que você nunca preenche, então
> um `new Configs('127.0.0.1', 9999)` posicional levanta um `TypeError` em vez de vincular silenciosamente os valores errados.

Passar duas instâncias da mesma classe de Configs em uma mesma chamada de `configure()` lança `InvalidArgumentException`, e um
`configure()` que nunca carregou `host` e `port` lança `ArgumentCountError`.

## Callbacks

Registre callbacks de runtime com `on()`:

### Hooks disponíveis

| Evento | Assinatura | Finalidade |
|---|---|---|
| `Events::WorkerStarted` | `Closure($Client)` | Executa quando um worker é iniciado. |
| `Events::ClientConnect` | `Closure($Socket, $Connection)` | Executa quando o socket do cliente está pronto para uso. |
| `Events::ClientDisconnect` | `Closure($Connection)` | Executa quando o socket do cliente é fechado. |
| `Events::DatagramRead` | `Closure($Socket, $Connection)` | Executa após a leitura de um datagrama. |
| `Events::DatagramWrite` | `Closure($Socket, $Connection)` | Executa uma vez por datagrama entregue, depois que o registro one-shot de `EVENT_WRITE` é removido. Re-arme aqui somente após enfileirar um novo `output`. |

Essa é a principal superfície pública de integração de `UDP_Client_CLI`.

## Fluxo Típico

Um modelo mental voltado ao consumidor para o cliente é:

1. criar o cliente
2. chamar `configure()`
3. registrar hooks com `on()`
4. chamar `connect()` diretamente ou deixar seu hook `Events::WorkerStarted` fazer isso
5. definir `$Connection->output`
6. chamar `start()` e deixar os callbacks conduzirem o tráfego

O registro de `EVENT_WRITE` é **one-shot**: arme-o *depois* de definir
`$Connection->output`, e um arm entrega exatamente um datagrama — o registro é removido
automaticamente assim que o datagrama é enviado (ou quando um wakeup de escrita não
encontra nada enfileirado). Para enviar de novo, enfileire um novo `output` e re-arme.
Após cada datagrama entregue, `$Connection->written` guarda o tamanho enviado em bytes.

O projeto demo usa exatamente esse padrão com modo monitor e encerramento por timer.

## Exemplo com Monitor Mode

```php
use const PHP_EOL;
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Events;


return new Project(
   name: 'Demo UDP Client CLI',
   description: 'Demonstration project for Bootgly UDP Client CLI',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_MONITOR);
      $Client->configure(
         new Configs(
            host: '127.0.0.1',
            port: getenv('PORT') ? (int) getenv('PORT') : 9999,
            workers: 1
         )
      );

      $Client
         ->on(Events::WorkerStarted, function ($Client) {
            $Socket = $Client->connect();
            if ($Socket) {
               $Client::$Event->loop();
            }
         })
         ->on(Events::ClientConnect, function ($Socket, $Connection) {
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
         })
         ->on(Events::ClientDisconnect, function ($Connection) use ($Client) {
            $Client->Logger->log(
               info: "Connection #{$Connection->id} ({$Connection->address}:{$Connection->port})"
               . " from Worker with PID {$Client->Process->id} was closed!" . PHP_EOL
            );
         })
         ->on(Events::DatagramWrite, function ($Socket, $Connection) use ($Client) {
            // O registro de EVENT_WRITE é one-shot: ele já foi removido —
            // re-arme somente após enfileirar um novo `output`.
            $Client->Logger->log(
               info: "Sent {$Connection->written} bytes." . PHP_EOL
            );
         });

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

- O `UDP_Client_CLI\Configs` não expõe opções de TLS ou DTLS.
- UDP é orientado a datagramas e não garante entrega, ordenação nem retransmissão.
- `MODE_TEST` é útil quando você quer um runtime mais leve para fluxos de teste.

## Exemplo Completo

```php
use const PHP_EOL;
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Events;


return new Project(
   name: 'Demo UDP Client CLI',
   description: 'Demonstration project for Bootgly UDP Client CLI',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_MONITOR);
      $Client->configure(
         new Configs(
            host: '127.0.0.1',
            port: getenv('PORT') ? (int) getenv('PORT') : 9999,
            workers: 1
         )
      );

      $Client
         ->on(Events::WorkerStarted, function ($Client) {
            $Socket = $Client->connect();
            if ($Socket) {
               $Client::$Event->loop();
            }
         })
         ->on(Events::ClientConnect, function ($Socket, $Connection) {
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
         })
         ->on(Events::ClientDisconnect, function ($Connection) use ($Client) {
            $Client->Logger->log(
               info: "Connection #{$Connection->id} ({$Connection->address}:{$Connection->port})"
               . " from Worker with PID {$Client->Process->id} was closed!" . PHP_EOL
            );
         })
         ->on(Events::DatagramWrite, function ($Socket, $Connection) use ($Client) {
            // O registro de EVENT_WRITE é one-shot: ele já foi removido —
            // re-arme somente após enfileirar um novo `output`.
            $Client->Logger->log(
               info: "Sent {$Connection->written} bytes." . PHP_EOL
            );
         });

      $Client->start();
   }
);
```
