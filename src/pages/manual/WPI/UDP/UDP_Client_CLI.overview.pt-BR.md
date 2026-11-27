# UDP Client CLI

O UDP Client CLI é o cliente de baixo nível do Bootgly para envio e recebimento de datagramas UDP. Ele é útil para clientes de protocolo customizado, fluxos de monitoramento, cenários de teste e geração leve de carga em PHP puro.

## Recursos

| Recurso | Descrição |
|---|---|
| **Cliente de datagramas UDP** | Envie payloads brutos para um servidor UDP e reaja às respostas com callbacks. |
| **Fluxo baseado em callbacks** | Registre hooks para inicialização do worker, conexão, desconexão, leituras e escritas. |
| **Múltiplos modos** | Execute em `MODE_DEFAULT`, `MODE_MONITOR` ou `MODE_TEST`. |
| **Modo embutido** | `MODE_EMBEDDED` roda dentro de outro runtime — um worker de servidor, um resolver — com todo o seu estado na instância, e espera datagramas sem bloquear o loop do host. |
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
| `UDP_Client_CLI::MODE_EMBEDDED` | Roda dentro do runtime de outro processo, com estado próprio — veja [Modo embutido](#modo-embutido). |

## Configuração

O `configure()` é variádico sobre value objects **Configs** — um por concern, aplicados em qualquer ordem.
O transporte vive em `UDP_Client_CLI\Configs`:

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Host de destino ou endereço IP. Um literal IPv6 é passado puro (`::1`) ou entre colchetes (`[::1]`), com um zone id opcional para endereço link-local (`fe80::1%eth0`). |
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

Um `host` que contém `:`, `[`, `]` ou `%` precisa ser, por inteiro, um literal IPv6 — puro ou entre colchetes, com um zone
id opcional feito de letras, dígitos, `.`, `_` ou `-`. Qualquer outra coisa (uma porta depois dos colchetes, colchetes
desbalanceados, um zone id vazio) lança `InvalidArgumentException` citando o zone id, então uma string de host nunca
sobrescreve a `port` configurada. O cliente sempre disca um literal IPv6 entre colchetes (`udp://[::1]:9999`).

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

## Modo embutido

`MODE_EMBEDDED` roda o cliente dentro de um runtime que não é dele — um worker de servidor HTTP, um resolver, uma
aplicação host. Ele nunca mexe no processo host: sem lock de estado do processo, sem comandos de console, sem sinal de
encerramento, sem sobrescrever as vars de debug, sem `exit()`. E não compartilha nada com outros clientes: seu reator
(`$Reactor`), hooks (`$Callbacks`), fluxos (`Connections->$Flows`) e contadores vivem na instância, então dois clientes
embutidos no mesmo processo nunca veem os datagramas um do outro.

### Esperar um datagrama dentro de um handler de request

Dentro de uma resposta adiada, adote o reator do worker com `react()`, entregue ao cliente a ponte de espera da resposta
com `schedule()` e espere com `receive()`: a Fiber do request estaciona até o datagrama chegar ou o timeout vencer,
enquanto o worker continua atendendo todos os outros requests.

```php
use Bootgly\WPI\Interfaces\TCP_Server_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Outcomes;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;


return $Response->defer(function (Response $Response): void {
   $Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_EMBEDDED);
   $Client->react(TCP_Server_CLI::$Event);
   $Client->schedule(fn (mixed $value = null): Response => $Response->wait($value));
   $Client->configure(new Configs(host: '127.0.0.1', port: 9999));

   try {
      $Socket = $Client->connect();
      if ($Socket === false) {
         $Response->JSON->send(['error' => 'unreachable']);
         return;
      }

      // @ Envia um datagrama no novo fluxo
      $Flow = $Client->Connections->Flows[(int) $Socket];
      $Flow->output = 'ping';
      $Flow->writing($Socket);

      // @ Espera a resposta (a Fiber do request estaciona; o worker não)
      $Outcome = $Flow->receive(2.0);
      $answer = $Outcome === Outcomes::Received ? $Flow->input : null;
   }
   finally {
      $Client->stop();
   }

   $Response->JSON->send(['outcome' => $Outcome->name, 'answer' => $answer]);
});
```

Cada `connect()` abre um fluxo **novo**, com uma porta de origem nova escolhida pelo SO — um fluxo por consulta é o
formato usual para protocolos de pergunta/resposta. `stop()` fecha todos os fluxos do cliente e retorna — chame-o num
`finally`: um cliente descartado sem ele mantém seus sockets abertos até o coletor de ciclos do PHP rodar.

### Esperar sem servidor

Um cliente embutido que nunca chamou `react()` é dono do próprio reator, e `receive()` simplesmente bloqueia o código
chamador até o timeout:

```php
$Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_EMBEDDED);
$Client->configure(new Configs(host: '::1', port: 9999));

try {
   $Socket = $Client->connect() ?: throw new RuntimeException('unreachable');
   $Flow = $Client->Connections->Flows[(int) $Socket];
   $Flow->output = 'ping';
   $Flow->writing($Socket);

   $Outcome = $Flow->receive(0.5); // Outcomes::Received ou Outcomes::Expired, …
}
finally {
   $Client->stop();
}
```

### Por que uma espera terminou

`receive()` retorna um caso de `Outcomes`, então quem chama decide o próximo passo pelo nome:

```php
$Outcome = $Flow->receive(1.0);

match ($Outcome) {
   Outcomes::Received => $answer = $Flow->input,  // `''` para um datagrama de zero bytes
   Outcomes::Expired, Outcomes::Refused => $next = true,  // tente outro peer
   Outcomes::Closed, Outcomes::Stalled, Outcomes::Rejected => $failed = true,
};
```

Um datagrama que não é a resposta esperada (de outra consulta, ou forjado) é só lido e ignorado: chame `receive()` de
novo com o tempo que sobra.

### Regras do modo embutido

- `react()` e `schedule()` vêm antes do primeiro `connect()`; `react()` depois de um fluxo aberto — ou dentro do seu hook de conexão — lança `LogicException`.
- Num reator adotado, `receive()` só estaciona: sem `schedule()` ou fora de uma Fiber ele lança `LogicException` em vez
  de bloquear o worker.
- Uma espera interrompida — o request é cancelado, a ponte lança — fecha o seu fluxo na saída, então nenhum descritor
  fica para trás. Um fluxo fechado enquanto uma espera está estacionada nele (`stop()`, `close()`) encerra essa espera
  com `Outcomes::Closed`.
- Não registre também o socket do fluxo para `EVENT_READ` no reator enquanto espera nele com `receive()`: a
  espera lê o datagrama primeiro, e o leitor persistente então reporta uma leitura falha.
- Um cliente embutido não faz fork: `workers` acima de `0`, `Events::WorkerStarted` e `start()` são recusados pelo nome.
- Os hooks registrados com `on()` são deste cliente (`$Callbacks`). No modo embutido não há `$Client->Process`.

## Exemplo com Monitor Mode

```php
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
- Os modos legados guardam o estado no processo inteiro, em propriedades estáticas — `UDP_Client_CLI::$Event`, os hooks
  `$on*` e o registro e os contadores de `Connections` — compartilhadas por todos os clientes legados do processo. Elas
  estão depreciadas: a 2.0 mantém o estado de cada cliente na sua instância, como o `MODE_EMBEDDED` já faz.

## Exemplo Completo

```php
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

## Referência

### Adotar um reator do host

```php
public function react (Events & Loops & Scheduler $Event): self
```

Adota um reator de outro runtime (o de um worker de servidor). Só em `MODE_EMBEDDED`; precisa vir antes de qualquer
fluxo aberto. Depois dele, `$owned` é `false`. Lança `LogicException` nos outros modos ou com um fluxo já aberto.

### Injetar a ponte de espera

```php
public function schedule (Closure $Wait): self
```

Define a ponte pela qual `receive()` estaciona num reator adotado: uma Closure que recebe um `Readiness` e suspende a
Fiber chamadora nele — dentro de uma resposta adiada, `fn ($value = null) => $Response->wait($value)`.

### Abrir um fluxo

```php
public function connect ()
```

Abre um socket novo (uma porta de origem nova) e registra o seu fluxo; retorna o socket (`resource|false`). Em
`MODE_EMBEDDED` o fluxo é `$Client->Connections->Flows[(int) $Socket]`, e `false` é retornado quando ele não pode ser
registrado; um hook de conexão que lança propaga, com o socket fechado e sem os interesses que ele armou no reator.

### Esperar um datagrama

```php
public function receive (float $timeout): Outcomes
```

Num fluxo (`Connections\Connection`). Espera até `$timeout` segundos (finito, `>= 0`; `0` sonda uma vez) por um
datagrama e retorna por que a espera terminou; em `Outcomes::Received` o datagrama está em `$Flow->input`. Estaciona a
Fiber chamadora num reator adotado; bloqueia nos outros casos. Lança `InvalidArgumentException` com timeout negativo, não
finito ou grande demais para o relógio monotônico e `LogicException` num reator adotado sem a ponte de espera ou fora de uma Fiber.

| Caso de `Outcomes` | Significado |
|---|---|
| `Received` | Um datagrama chegou (`input` o contém; `''` para um datagrama de zero bytes). |
| `Expired` | O timeout venceu sem datagrama. |
| `Refused` | A leitura falhou depois que o socket ficou legível — ex.: a porta do peer está fechada (ICMP). |
| `Closed` | O fluxo foi fechado durante a espera. |
| `Stalled` | A ponte de espera continuou retornando sem suspender (8 despertares rápidos seguidos). |
| `Rejected` | O reator não conseguiu vigiar o socket (admissão do seletor). |

### Parar o cliente

```php
public function stop (): void
```

Em `MODE_EMBEDDED`, fecha todos os fluxos do cliente e retorna; um hook de desconexão que lança não deixa os outros
abertos — o primeiro erro é relançado depois que todos fecharam. Nos outros modos, reporta os workers parados e encerra o
processo.

### Liberar um fluxo fechado

```php
public function release (Connection $Connection): void
```

Em `Connections`. Remove um fluxo fechado de `$Flows` — só aquele fluxo: outra `Connection` sobre o mesmo socket nunca
remove a registrada. Chamado pelo `close()` do fluxo; para subclasses.

### Estado do modo embutido

| Propriedade | Descrição |
|---|---|
| `$Client->embedded` | `true` em `MODE_EMBEDDED`. |
| `$Client->Reactor` | O reator em uso por este cliente — o próprio até `react()`; `null` nos outros modos. |
| `$Client->owned` | `false` depois de `react()`. |
| `$Client->Wait` | A ponte de espera definida por `schedule()`. |
| `$Client->Callbacks` | Os hooks deste cliente, indexados pelo valor de `Events`. |
| `$Client->Connections->Flows` | Fluxos abertos, indexados por `(int) $Socket`. |
| `$Client->Connections->failures` | Fluxos que não puderam ser abertos. |
| `$Flow->writes`, `$Flow->reads`, `$Flow->errors` | Contadores por fluxo, sempre mantidos em `MODE_EMBEDDED`. |
