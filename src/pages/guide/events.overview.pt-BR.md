# Events

O Bootgly traz um barramento de eventos nativo e sem dependências em
`Bootgly\ABI\Events\Emitter`. Todas as camadas do framework emitem seus eventos de domínio
pela mesma instância canônica — `Emitter::$Instance` — então um único `listen()` basta para
observar hits de cache, queries SQL, requests HTTP, ciclo de vida de workers e mais.

Listeners são estritamente opt-in: todo emit nativo é envolvido por uma guarda `check()` de
zero alocação, então quando ninguém está escutando, um evento custa um único lookup de
array — sem payload, sem objeto, sem closure. Benchmarks no hot path HTTP e no load-set
TechEmpower do DBAL mostram overhead **zero** mensurável sem listeners anexados.

## Escute um evento

Escolha um case do enum de eventos e registre uma `Closure`. O listener recebe um objeto
`Emission` carregando o evento e seu payload:

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ABI\Resources\Cache\Events;

Emitter::$Instance->listen(Events::Miss, function (Emission $Emission) {
   [$key] = $Emission->payload;

   error_log("cache miss: $key");
});
```

É tudo de que a maioria dos consumidores precisa: `listen()` uma vez e ler
`$Emission->payload` (um `array` posicional — veja a tabela de payload de cada evento
abaixo). O listener fica registrado enquanto o processo viver, a menos que você o registre
para uma única entrega ou o remova — veja
[Escute uma vez, ou pare de escutar](#escute-uma-vez-ou-pare-de-escutar).

## Capture queries lentas

Uma receita prática: habilite o limiar de query lenta e alerte para toda instrução SQL que
ultrapassá-lo. `Operation::$slow` é em segundos e o padrão é `0.0` (desligado — overhead
zero, nem uma chamada de `microtime()`):

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Events;
use Bootgly\ADI\Databases\SQL\Operation;

Operation::$slow = 0.5; // flag queries slower than 500ms

Emitter::$Instance->listen(Events::Slow, function (Emission $Emission) {
   [$Operation, $elapsed] = $Emission->payload;

   error_log("slow query ({$elapsed}s): {$Operation->SQL}");
});
```

`Slow` é anunciado depois de `Executed`, e só para instruções que têm sucesso: uma que falha
ou estoura o timeout é anunciada como `Failed`. O tempo decorrido conta a partir da criação
da operação, então inclui qualquer espera por uma conexão livre do pool.

## Escute uma vez, ou pare de escutar

Passe `once: true` e o listener recebe uma única entrega — a primeira emissão que chegar
até ele — e depois some:

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Events;

Emitter::$Instance->listen(Events::Connected, function (Emission $Emission) {
   error_log('database reachable: first connection authenticated');
}, once: true);
```

Para remover um listener você mesmo, guarde a closure que registrou e passe-a para
`forget()`. Um listener pode fazer isso de dentro do próprio handler — aqui ele amostra
as 100 primeiras instruções e para de escutar:

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Events;

$sampled = 0;

$Sampler = function (Emission $Emission) use (&$sampled, &$Sampler) {
   [$Operation] = $Emission->payload;

   error_log("sample: {$Operation->SQL}");

   if (++$sampled === 100) {
      Emitter::$Instance->forget(Events::Executed, $Sampler);
   }
};

Emitter::$Instance->listen(Events::Executed, $Sampler);
```

Com o que você pode contar:

- `forget()` retorna `true` quando removeu algo e `false` quando o listener não estava
  registrado naquele evento. Ele remove **todos** os registros do listener no evento,
  inclusive os de entrega única.
- Uma `Closure` é reconhecida pelo objeto que você registrou, então guarde-a em uma
  variável: outra closure com o mesmo corpo é outro listener. First-class callables são a
  exceção — `$Object->handle(...)` cria uma closure nova a cada vez, e
  `forget($Event, $Object->handle(...))` ainda assim remove a que foi registrada antes
  para o mesmo método do mesmo objeto. Um objeto `Listener` é reconhecido por identidade.
- A remoção vale na hora, mesmo no meio de uma emissão: um listener removido por um
  handler anterior não recebe a emissão em andamento, e todos os outros listeners rodam
  exatamente uma vez, em ordem de prioridade. Um listener *registrado* por um handler
  espera a próxima emissão.
- Um listener de entrega única é removido **antes** de rodar. Ele roda no máximo uma vez
  mesmo quando lança ou emite o próprio evento de novo; dentro dele o `check()` já não o
  conta, e removê-lo dali retorna `false` — ele já saiu.
- Quando o último listener de um evento sai, o evento volta a não ser observado: `check()`
  responde `false` e os pontos de emissão voltam ao caminho de zero alocação.

## Eventos nativos

Cada feature possui um enum `Events` próprio (`Feature\Events implements
Bootgly\ABI\Event`). Payloads são posicionais, na ordem listada.

### ABI — Cache

`Bootgly\ABI\Resources\Cache\Events`

| Evento | Quando | Payload |
|---|---|---|
| `Hit` | `fetch()` encontrou a chave | `$key`, `$value` |
| `Miss` | `fetch()` não encontrou nada | `$key` |
| `Evict` | `delete()` foi chamado | `$key`, `$deleted` (bool) |

### ACI — Processos worker

`Bootgly\ACI\Process\Events` — emitidos pelos servidores multi-worker (TCP/HTTP Server CLI):

| Evento | Quando | Payload |
|---|---|---|
| `Boot` | um processo worker sofreu fork | `$index` (int) |
| `Shutdown` | o servidor está parando | `$level` (nível do processo) |
| `Reload` | um worker está recarregando (SIGUSR2) | `$index` (int) |

Um listener de `Shutdown` que lança não impede o processo de parar: a falha é reportada por
`Throwables::notify()` com o contexto `['origin' => 'server.stop']`, e a parada segue. O servidor
HTTP a grava no seu log `exceptions`; em um servidor TCP, WebSocket ou UDP, registre um reporter
em `Throwables::$reporters` para registrá-la.

### ACI — Scheduler

`Bootgly\ACI\Schedule\Events` — veja o guia **[Scheduler](/guide/scheduler/overview/)**:

| Evento | Quando | Payload |
|---|---|---|
| `Started` | um job vai rodar | `$id`, `Job` |
| `Finished` | um job concluiu | `$id`, `$duration` (float, ms) |
| `Failed` | um job lançou exceção | `$id`, `Throwable` |
| `Skipped` | uma execução foi pulada | `$id`, `$reason` (`'overlap'` \| `'catchup-skip'`) |

### ADI — Banco SQL

`Bootgly\ADI\Databases\SQL\Events`:

| Evento | Quando | Payload |
|---|---|---|
| `Connected` | uma conexão terminou de autenticar | `Connection` |
| `Executed` | uma operação resolveu com sucesso | `Operation` |
| `Slow` | uma operação excedeu `Operation::$slow` | `Operation`, `$elapsed` (float, segundos) |
| `Failed` | uma operação falhou — erro do driver, recusa do framework, ou escrita reportada pelo emissor que não foi concluída | `Operation` (carrega `->SQL`, `->error` e `->code`) |

`Bootgly\ADI\Databases\SQL\Transaction\Events`:

| Evento | Quando | Payload |
|---|---|---|
| `Begin` | `$Transaction->begin()` foi chamado: ele reabre uma transação encerrada ou abre um savepoint aninhado (`$Database->begin()` não emite `Begin`) | `Transaction` |
| `Commit` | `$Transaction->commit()` foi chamado, em qualquer profundidade (no nível de um savepoint, ele libera o savepoint) | `Transaction` |
| `Rollback` | `$Transaction->rollback()` foi chamado, em qualquer profundidade — mesmo quando o savepoint nomeado não está disponível e a chamada é recusada | `Transaction` |

Cada um é emitido depois das verificações da própria chamada e antes de ela compor sua
instrução. Uma chamada que essas verificações recusam não emite nada: qualquer chamada feita
enquanto a instrução anterior ainda está em voo (exceto o `rollback()` externo, que ultrapassa
essa instrução), e um `commit()` ou `rollback()` numa transação que não está ativa. Um
listener vê, sim, chamadas cuja instrução depois falha, e as duas recusas que vêm depois das
verificações: um `rollback('name')` cujo savepoint não está disponível e um `begin()` que
abriria um savepoint numa transação que não está ativa. `save()`, `release()` e `abort()` não
emitem nada.

Diferente dos eventos SQL acima, esses eventos mantêm o contrato de direção: um listener que
lança faz `begin()`, `commit()` ou `rollback()` lançar antes de qualquer instrução ser
composta, e uma transação aberta continua aberta na sua conexão reservada do pool —
`abort()`, que não emite nada, ainda a encerra.

O `$Database->transact()` e o `$Response->Database->transact()` fazem essas chamadas por você,
então os mesmos eventos disparam: nenhum `Begin` para a transação em si (ela é aberta pelo
`$Database->begin()`), um `Begin` para o savepoint de uma chamada aninhada, um `Commit` para
cada nível commitado e, quando o trabalho lança, um `Rollback` para cada nível desfeito. Um
listener de `Rollback` que lança não impede o `$Database->transact()` de encerrar a transação:
ele cai para o `abort()`, que não anuncia nada para os níveis que encerra.

`Bootgly\ADI\Databases\SQL\Schema\Migration\Events`:

| Evento | Quando | Payload |
|---|---|---|
| `Up` | uma migration está prestes a ser aplicada | `Migration`, `$batch` (int) |
| `Down` | uma migration está prestes a ser revertida | `Migration`, `$batch` (int — atualmente sempre `0`) |

> **Eventos de migration disparam antes de a migration rodar.** Por enquanto, `Up` e `Down`
> são emitidos antes de as instruções da migration rodarem e fora de qualquer transação. Por
> isso um listener também é notificado de uma migration que depois falha (e sofre rollback, no
> PostgreSQL e no SQLite: o MySQL roda migrations sem transação), e um listener que lança
> interrompe a execução antes da primeira instrução dessa migration. `Down` atualmente carrega
> o batch `0`, e não o batch que está sendo revertido.

### API — Project

`Bootgly\API\Projects\Project\Events`:

| Evento | Quando | Payload |
|---|---|---|
| `Boot` | o projeto bootou | `Project` |
| `Shutdown` | o projeto bootado está sendo destruído | `Project` |

`Boot` é anunciado assim que o registro se completa — ANTES da closure de boot do
projeto executar — então dispara mesmo para projetos-servidor cuja closure nunca
retorna. `Shutdown` é anunciado no teardown de cada processo que serve o projeto:
o master e cada worker em uma parada real. Um processo cuja saída apenas repassa o
projeto — o launcher do daemonize, um `reload` (que re-executa o master e
re-anuncia `Boot` na imagem nova), um filho auxiliar — é marcado `detached` e nunca
anuncia `Shutdown`. Esses eventos mantêm o contrato de direção: um listener que
lança em `Boot` aborta o boot, e um que lança em `Shutdown` escapa do destrutor —
falha alta, por design.

### WPI — HTTP Server CLI

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Events`:

| Evento | Quando | Payload |
|---|---|---|
| `Received` | o corpo do request está completo, antes do roteamento | `Request` |
| `Handled` | a resposta foi produzida para o request | `Request`, `Response` |

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Session\Events`:

| Evento | Quando | Payload |
|---|---|---|
| `Start` | uma sessão iniciou | `$id` |
| `Regenerate` | o id da sessão foi rotacionado | `$oldId`, `$newId` |
| `Destroy` | a sessão foi destruída | `$id` |

> [!NOTE]
> Em um servidor multi-worker, registre listeners em código que roda dentro de cada worker
> (por exemplo no bootstrap do seu projeto) — cada processo forkado tem sua própria
> instância do `Emitter`.

## Emita seus próprios eventos

Declare um enum `Events` por feature, implementando o marker `Bootgly\ABI\Event`:

```php
use Bootgly\ABI\Event;

enum Events implements Event
{
   case Imported;
   case Purged;
}
```

Depois emita pela instância canônica. Em hot paths, use a guarda `check()` para que a
montagem do payload seja pulada por completo quando ninguém está escutando:

```php
use Bootgly\ABI\Events\Emitter;

$Emitter = Emitter::$Instance;
$Emitter->check(Events::Imported) && $Emitter->emit(Events::Imported, $file, $rows);
```

Em cold paths um `emit()` direto basta — ele retorna `null` sem alocar nada quando o
evento não tem listeners.

## Prioridade e propagação

Listeners rodam de forma síncrona em ordem **decrescente de prioridade** (maior primeiro;
padrão `0`). Um listener pode interromper os restantes do dispatch atual com
`Emission->stop()`:

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;

Emitter::$Instance->listen(Events::Imported, function (Emission $Emission) {
   $Emission->stop(); // listeners with lower priority will not run
}, priority: 10);
```

Um listener de entrega única mantém sua posição de prioridade. Aquele que uma emissão
não alcança — a propagação foi interrompida acima dele — continua registrado e espera a
próxima emissão.

O que um **throw** de listener faz depende do contrato declarado pelo evento:

- Por padrão um evento é **de direção** (steering): um Throwable do listener propaga para
  o emissor, que pode tratá-lo como fluxo de controle — os eventos de request do WPI
  funcionam assim (um listener pré-routing que lança recusa a request: ela recebe `500` e
  o erro é reportado — `503`, sem relatório, para uma recusa do orçamento do worker —, os
  uploads dela são apagados e a conexão dela é fechada (no HTTP/2, só o stream dela é
  recusado), enquanto o worker continua atendendo as outras conexões; um listener pós-handling que
  lança é substituído por uma única resposta de erro delimitada).
- Um evento marcado com `Bootgly\ABI\Events\Emitter\Observing` é **apenas observado**:
  cada listener é isolado, então um Throwable nunca escapa do `emit()`, nunca cega
  listeners de prioridade menor e nunca aborta a entrega — ele é reportado via
  `Throwables::notify()`. Os eventos SQL do ADI (`Connected`, `Executed`, `Slow`,
  `Failed`) são Observing: eles são emitidos de dentro dos read loops e caminhos de
  teardown dos drivers, onde uma exceção de listener escapando corromperia o pool de
  conexões. Não escreva gates ou validadores como listeners de um evento Observing.

Nos dois casos, um listener de entrega única que lança não volta: ele foi removido antes
de rodar.

## Referência

### `Emitter`

`Bootgly\ABI\Events\Emitter` — o barramento canônico vive em `Emitter::$Instance`.

```php
public function listen (Event&UnitEnum $Event, Listener|Closure $Listener, int $priority = 0, bool $once = false): self
```

Registra um listener para um evento. `$priority` maior roda primeiro; a ordem de registro
desempata. Com `$once` o listener é removido logo antes da primeira entrega, então roda no
máximo uma vez. Retorna o emitter para encadeamento.

```php
public function forget (Event&UnitEnum $Event, Listener|Closure $Listener): bool
```

Remove todos os registros de um listener em um evento e retorna se havia algum. Um objeto
`Listener` é reconhecido por identidade; uma `Closure` por identidade, ou por igualdade
quando são dois first-class callables do mesmo método no mesmo objeto. O listener não
recebe mais nenhuma entrega, nem de uma emissão em andamento. Remover o último listener de
um evento faz `check()` responder `false`.

```php
public function check (Event&UnitEnum $Event): bool
```

Retorna se o evento tem pelo menos um listener registrado. Custa um `spl_object_id()` +
`isSet()` — sem alocação. Combine com `emit()` em hot paths:
`$Emitter->check($Event) && $Emitter->emit($Event, ...$payload);`.

```php
public function emit (Event&UnitEnum $Event, mixed ...$payload): null|Emission
```

Despacha o evento de forma síncrona para seus listeners em ordem de prioridade. Retorna
`null` quando o evento não tem listeners (caminho de zero alocação), senão a `Emission`.
A emissão entrega aos listeners registrados quando ela começa, menos os removidos desde
então.

### `Listeners`

`Bootgly\ABI\Events\Emitter\Listeners` — os listeners de um evento, por trás de
`$Emitter->Listeners` (indexado pelo `spl_object_id()` do case do enum; um evento só tem
chave enquanto tem listener). A propriedade `$entries` é legível: cada registro pelo seu
id, em ordem de dispatch, como `[prioridade, listener, entrega única]`. Iterar a coleção
entrega os listeners como uma lista, na mesma ordem.

> [!WARNING]
> Registre e remova por `Emitter::listen()` e `Emitter::forget()`. É o emitter que tira do
> mapa uma coleção que ficou vazia: esvazie uma diretamente com os métodos abaixo e o
> evento dela continua respondendo ao `check()` como observado.

```php
public function add (Listener|Closure $Listener, int $priority = 0, bool $once = false): void
```

Registra um listener depois de todos os registros de prioridade maior ou igual.

```php
public function remove (Listener|Closure $Listener): bool
```

Remove todos os registros de um listener — reconhecido como no `forget()` — e retorna se
havia algum.

```php
public function drop (int $id): bool
```

Remove o único registro com aquele id — a chave dele em `$entries` — e retorna se ele
ainda estava lá.

### `Emission`

`Bootgly\ABI\Events\Emission` — um dispatch em andamento. Propriedades somente leitura:
`$Event` (o case do enum), `$payload` (`array` posicional), `$stopped` (bool).

```php
public function stop (): void
```

Interrompe a propagação — nenhum outro listener roda para este dispatch.

### `Listener`

`Bootgly\ABI\Events\Emitter\Listener` — interface opcional para listeners baseados em
classe (em vez de uma `Closure`):

```php
public function handle (Emission $Emission): void
```

### Camadas

O barramento vive na **ABI**, a camada mais baixa, então toda camada (`ABI → ACI → ADI →
API → CLI → WPI`) pode emitir por ele sem violar a regra de dependência unidirecional.
Eventos são **cases** de enum (comparados por identidade via `spl_object_id`), não strings
— typos são impossíveis e lookups nunca fazem hash de strings.

## Próximas referências

- **[Scheduler](/guide/scheduler/overview/)** - eventos de ciclo de vida de jobs (`Started`, `Failed`, ...).
- **[Cache](/guide/cache/overview/)** - a fachada de cache por trás de `Hit`/`Miss`/`Evict`.
- **[Database DBAL](/guide/database-dbal/overview/)** - as operações async por trás de `Executed`/`Slow`.
