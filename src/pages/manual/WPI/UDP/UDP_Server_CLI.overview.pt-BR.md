# UDP Server CLI

O UDP Server CLI é o servidor de baixo nível do Bootgly para protocolos baseados em datagramas. Ele permite vincular a uma porta UDP, registrar um handler bruto de datagramas e executar o servidor em modos multi-worker adequados para desenvolvimento, monitoramento e execução em segundo plano.

## Recursos

| Recurso | Descrição |
|---|---|
| **Servidor orientado a datagramas** | Receba payloads UDP brutos e retorne payloads brutos para o remetente. |
| **Runtime multi-worker** | Inicie um ou mais processos worker para lidar com o tráfego. |
| **Modos operacionais** | Execute em `Daemon`, `Interactive`, `Monitor` ou `Test`. |
| **API simples de handler** | Registre um único callback `on(Events::DatagramReceive, Closure $Callback)` para os datagramas recebidos. |
| **Estado de peers limitado** | Aplique tetos globais/por IP em cada worker, expiração ociosa e batch finito antes que o estado de peers esgote o worker. |
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
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Events;


return new Project(
   name: 'Demo UDP Server CLI',
   description: 'Demonstration project for Bootgly UDP Server CLI',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new UDP_Server_CLI(Mode: match (true) {
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $Server->configure(
         new Configs(
            host: '0.0.0.0',
            port: getenv('PORT') ? (int) getenv('PORT') : 9999,
            workers: max(1, (int) shell_exec('nproc') ?: 1)
         )
      );

      $Server->on(Events::DatagramReceive, fn ($input) => $input);

      $Server->start();
   }
);
```

## Quick Start

O fluxo mínimo de uso é simples: configure o socket, registre um handler e inicie o servidor.

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\UDP_Server_CLI;
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Events;


$Server = new UDP_Server_CLI(Modes::Monitor);

$Server->configure(
   new Configs(
      host: '0.0.0.0',
      port: 9999,
      workers: 1
   )
);

$Server->on(
   Events::DatagramReceive,
   static fn (string $input): string => $input
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

`configure()` é variádico sobre value objects **Configs** — um por concern, aplicados em qualquer ordem
antes da inicialização. O transporte vive em `UDP_Server_CLI\Configs`:

A configuração é uma operação pré-start. Chamadas depois que o servidor alcança `Starting`, `Running`,
`Paused` ou `Stopping` são rejeitadas sem alterar status, transporte, política de admissão ou o Router
já registrado no event loop; use `reload()` para uma substituição em execução. `start()` também falha
fechado até que um `Configs` de transporte completo e validado tenha sido confirmado.

O mesmo value object define fronteiras imutáveis de proteção de peers para o servidor configurado.

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Endereço de bind, como `0.0.0.0` para todas as interfaces. |
| `port` | `int` | — | Porta UDP de escuta. |
| `workers` | `int` | — | Número de processos worker. |
| `user` | `null\|string` | `null` | Usuário POSIX opcional para troca após o bind. |
| `group` | `null\|string` | `null` | Grupo POSIX opcional para troca após o bind. |
| `maxConnections` | `int` | `1024` | Máximo de peers `ip:porta` retidos por worker; `0` desativa o teto global. |
| `maxConnectionsPerIP` | `int` | `256` | Máximo de peers retidos para um IP de origem canônico, por worker; `0` desativa o teto por IP. |
| `connectionIdleTimeout` | `int` | `30` | Tempo de vida do peer ocioso em segundos; `0` desativa a expiração ociosa. |
| `maxDatagramsPerTick` | `int` | `64` | Quantidade de datagramas tratados em um turno read-ready antes de ceder; deve ser pelo menos `1`. |

```php
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Configs;


$Server->configure(
   new Configs(
      host: '0.0.0.0',
      port: 9999,
      workers: 4,
      user: 'www-data',
      group: 'www-data',
      maxConnections: 1024,
      maxConnectionsPerIP: 256,
      connectionIdleTimeout: 30,
      maxDatagramsPerTick: 64,
   )
);
```

> [!IMPORTANT]
> Todo Configs aceita **apenas named arguments**. Seu primeiro parâmetro é um guard slot que você nunca preenche, então
> um `new Configs('0.0.0.0', 9999, 4)` posicional levanta um `TypeError` em vez de vincular silenciosamente os valores errados.

Passar duas instâncias da mesma classe de Configs em uma mesma chamada de `configure()` lança `InvalidArgumentException`, e um
`configure()` que nunca carregou `host`, `port` e `workers` lança `ArgumentCountError`.

Tetos ou timeout ocioso negativos, e um batch de dispatch abaixo de um, lançam
`InvalidArgumentException` durante a construção de `Configs`.

### Limitando peers retidos

O `UDP_Server_CLI` retém um estado leve de `Connection` por `ip:porta` de origem, não uma
conexão de transporte. Os checks de admissão rodam antes dessa alocação. Os tetos global e
por IP são **por worker**, porque `SO_REUSEPORT` dá a cada worker seu próprio socket,
registro e estado de timer. Com quatro workers e `maxConnections: 1024`, o deployment pode
reter no máximo 4096 estados de peer.

O padrão por IP limita churn comum de portas de origem, enquanto o teto global continua
sendo o limite de memória autoritativo quando endereços de origem são forjados. Aumente
`maxConnectionsPerIP` para um NAT confiável que represente legitimamente muitos clientes
UDP ativos. Não defina `maxConnections` como `0` em listener não confiável sem um limite
externo de memória equivalente. Desativar `connectionIdleTimeout` também permite que um
burst ocupe slots finitos até esses peers fecharem ou o worker reiniciar. Use qualquer opt-out
`0` somente atrás de proteção equivalente.

Quando qualquer teto está cheio, o datagrama de um novo peer é descartado sem resposta nem
alocação de estado. Um peer já presente no registro continua sendo atendido no teto. O IP de
origem é o endereço direto observado no socket UDP; não existe equivalente de header de
proxy nessa camada de transporte.

Um supervisor central por worker expira peers após `connectionIdleTimeout`; receber um novo
datagrama renova o peer mesmo com a coleta de stats desabilitada. O batch finito de
`maxDatagramsPerTick` então devolve o controle a timers, sinais e outros descriptors prontos
durante tráfego contínuo. O intervalo nominal do supervisor não passa de cinco segundos. Um peer ocioso expira na
primeira passagem nominal após seu timeout enquanto a event loop permanece responsiva;
código bloqueante da aplicação ou do decoder pode atrasar essa passagem cooperativa. O batch
é um limite de fairness do escalonamento, não um rate limit de tráfego.

Cada admissão armazena o snapshot imutável do timeout ocioso do seu servidor. O manager
construído mais recentemente é a única autoridade de admissão do registro local ao processo;
substituí-lo invalida Routers antigos antes de callbacks de limpeza. O supervisor compartilhado
escolhe o menor snapshot positivo ainda presente no ledger privado. A autoridade de I/O de uma
Connection também é local ao processo e é revogada antes da limpeza terminal. Alterar propriedades
públicas legadas de status ou payload não consegue restaurá-la após o fechamento.

A admissão gerenciada é representada por uma `Lease` privada vinculada à vida real do objeto
`Connection` exato. Fechar remove o peer do roteamento ativo, mas seu slot global e por IP só é
liberado depois que esse objeto morre de fato. Qualquer owner forte&mdash;inclusive Timer, observer
de Reset, callback, propriedade da aplicação ou frame em execução&mdash;mantém naturalmente o
objeto e a cobrança da admissão vivos. A implementação não inspeciona grafos de objetos nem
classifica payloads de callbacks para tentar prever essa posse.

Quando o PHP finaliza a chave do mapa fraco, a Lease enfileira a liberação tokenizada com uma
`WeakReference`. A drenagem da fila só libera o token se a referência continuar vazia. Se um
destrutor ressuscitar a `Connection`, seu slot permanece cobrado e a entrada fica retida até que
uma drenagem posterior observe a morte real do objeto. Construção do manager, admissão, sweep,
roteamento e o caminho explícito de fechamento de peer do manager oferecem pontos de drenagem.
Cada drenagem consome um snapshot estável da fila; entradas criadas reentrantemente ficam
preservadas para a próxima drenagem. Capturas de callbacks liberados e a coleta limitada de ciclos
são finalizadas enquanto o guard de ciclo de vida continua ativo. Se a coleta não estabilizar em
oito passagens, a construção direta permanece fail-closed até uma drenagem posterior completá-la.
Toda drenagem e todo scrub terminal também bloqueiam construção reentrante de manager. Um peer
terminal estável que ainda possua owner continua representado pelo supervisor único mesmo com a
expiração ociosa desativada, para que um ciclo PHP inacessível seja coletado por um sweep limitado
posterior.

Enquanto está viva, cada `Connection` UDP expõe a visão pública de si mesma já estabelecida.
Após a limpeza terminal, `close()` rompe essa visão com backing para que um shell comum possa
ser finalizado prontamente. O Bootgly ainda habilita o coletor de ciclos do PHP antes da
construção, mesmo quando o processo inicia com `zend.enable_gc=0`, porque owners da aplicação e
limpezas reentrantes podem formar ciclos independentes que não devem se acumular entre ondas de
churn.

O fechamento continua terminal mesmo que as propriedades públicas legadas de status e payload
permaneçam mutáveis. A limpeza terminal lê e zera propriedades de compatibilidade com backing sem
invocar seus hooks; um override virtual é uma visão opaca pertencente à aplicação e não é confiado
como estado do framework. A limpeza oferece a destrutores reentrantes da aplicação um orçamento
limitado de 32 passagens. Um peer que não estabiliza permanece retido privadamente e cobrado enquanto
o supervisor tenta novamente, então código da aplicação não consegue forçar uma liberação antecipada
do slot. Destrutores da aplicação não devem alterar uma conexão em fechamento. A autoridade é
indexada pela chave imutável do peer em buckets fracos, fixos e keyed por processo. Antes de conceder
um objeto gerenciado, a admissão usa seu orçamento finito compartilhado para revogar toda geração
direta pré-autorizada com aquela chave exata e então revalida manager, chave, blacklist e os dois
tetos após esses callbacks de limpeza. Esgotamento ou ocupação reentrante rejeita a admissão externa
sem sobrescrever a contabilidade. O fechamento terminal também revoga toda geração autorizada da
mesma chave que observar; um objeto estrangeiro armazenado sob a chave pública errada perde somente
esse alias e preserva a autoridade do seu próprio peer.

A concessão de autoridade e a publicação do ledger rodam como uma única transação local ao processo.
Um `accept()` reentrante, `close()` do manager ou sweep de ociosidade durante essa transação falha
fechado; um datagrama posterior é o retry natural. Se o cleanup da aplicação interromper a publicação,
o rollback reconstrói os contadores por IP, timeout e quarentena a partir das tuplas autoritativas de
peers e reconcilia o supervisor antes de retomar a admissão. Isso impede que um callback assíncrono ou
sinal se intercale entre o check final dos tetos e o commit do ledger.

Envios de rede e rejeições terminais usam o `Connection::$id` readonly capturado pelo construtor.
Alterar ou adicionar hooks ao campo público legado `peer` não consegue redirecionar um datagrama
autorizado.

Shells de `Connection` clonados ou desserializados nunca recebem a autoridade local ao processo
semeada pelo construtor nem uma Lease gerenciada. Eles são inertes para I/O da aplicação. Fechar um
deles marca apenas aquele shell como terminal: ele não pode cancelar identificadores de timers
copiados de outro objeto nem alterar os ledgers de admissão gerenciada.

A substituição do manager limpa o espelho público de compatibilidade com trabalho finito. Se esse
clear limitado esgotar enquanto um manager anterior exato ainda estiver vivo, o Bootgly restaura
precisamente aquele par de manager/identidade e rejeita o substituto. Sem predecessor vivo, o
primeiro manager permanece autoritativo, mas fail-closed, e deixa intacta a geração final do
espelho. Essa geração não é confiada como autoridade nem estacionada como manager substituto. A
construção do manager também é transacional: callbacks de cleanup não podem construir um manager
aninhado, e uma falha inesperada restaura exatamente o par de autoridade anterior ainda vivo.

O supervisor central cobre peers admitidos pelo `UDP_Server_CLI`. Extensões que constroem a
classe interna `Connection` diretamente continuam fora da contabilidade de admissão e mantêm
o timer legado por objeto somente enquanto as estatísticas de conexão estão habilitadas. O setup
desse timer usa input imutável do construtor e storage com backing acessado sem hooks, então hooks
de propriedades não conseguem deixar um timer órfão. Um objeto direto criado durante construção
do manager, admissão, withdrawal, drenagem de Lease, limpeza terminal ou enquanto sua chave exata
está reservada nasce sem autoridade de I/O. Uma admissão gerenciada posterior também revoga a
autoridade direta preexistente daquela chave antes de confirmar o ledger. A construção direta não
cria a Lease de admissão gerenciada descrita acima; fora dessas fronteiras protegidas, sua limpeza
e vida útil continuam separadas dos ledgers global e por IP do servidor.

### Redução de privilégios

Se você vincular a uma porta privilegiada, pode iniciar como root e depois mudar para uma conta POSIX de menor privilégio após a criação do socket.

> [!WARNING]
> `user` e `group` dependem de funções POSIX e só são úteis em sistemas compatíveis quando o processo inicia com privilégios suficientes.

## Handler de Datagramas

Registre o handler de recebimento com `on()`:

```php
$Server->on(
   Events::DatagramReceive,
   function (string $input): string {
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

- `UDP_Server_CLI\Configs` **não** expõe opções de SSL/TLS ou DTLS.
- UDP é orientado a mensagens e não oferece as mesmas garantias de entrega do TCP.
- Este servidor trata UDP bruto; ele não implementa QUIC nem HTTP/3. Seus tetos de admissão,
  fairness de dispatch e autoridade por vida útil são fundações reutilizáveis, mas QUIC também
  exige IDs de conexão, migração, antiamplificação, TLS 1.3, streams e controle de congestionamento.
- `pause()` e `resume()` estão disponíveis quando você precisa interromper e retomar temporariamente a escuta.

## Exemplo Completo

```php
use function getenv;
use function shell_exec;

use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\UDP_Server_CLI;
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Events;


return new Project(
   name: 'Demo UDP Server CLI',
   description: 'Demonstration project for Bootgly UDP Server CLI',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new UDP_Server_CLI(Mode: match (true) {
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $Server->configure(
         new Configs(
            host: '0.0.0.0',
            port: getenv('PORT') ? (int) getenv('PORT') : 9999,
            workers: max(1, (int) shell_exec('nproc') ?: 1)
         )
      );

      $Server->on(Events::DatagramReceive, fn ($input) => $input);

      $Server->start();
   }
);
```

## Referência

### `UDP_Server_CLI`

```php
public function __construct (
   Modes $Mode = Modes::Monitor
)
```

Cria o shell do servidor UDP no modo operacional selecionado.

```php
public function configure (Configuring ...$Configs): self
```

Aplica atomicamente cada concern de configuração antes do start. Um servidor em execução
rejeita reconfiguração sem alterar transporte, política ou Router ativos.

### `UDP_Server_CLI\Configs`

```php
public function __construct (
   Argument $Named = Argument::Undefined,
   null|string $host = null,
   null|int $port = null,
   null|int $workers = null,
   null|string $user = null,
   null|string $group = null,
   int $maxConnections = 1024,
   int $maxConnectionsPerIP = 256,
   int $connectionIdleTimeout = 30,
   int $maxDatagramsPerTick = 64
)
```

Cria a configuração de transporte e fixa as fronteiras de retenção de peers locais ao worker
para aquele servidor. Valores `0` para os limites global, por IP e de ociosidade desativam
explicitamente aquela fronteira.
