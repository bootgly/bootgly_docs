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

Essa é toda a superfície de API para consumidores: `listen()` uma vez, leia
`$Emission->payload` (um `array` posicional — veja a tabela de payload de cada evento
abaixo).

## Capture queries lentas

Uma receita prática: habilite o limiar de query lenta e alerte para toda instrução SQL que
ultrapassá-lo. `Operation::$slow` é em segundos e o padrão é `0.0` (desligado — overhead
zero, nem uma chamada de `microtime()`):

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Events;
use Bootgly\ADI\Databases\SQL\Operation;

Operation::$slow = 0.5; // sinalize queries mais lentas que 500ms

Emitter::$Instance->listen(Events::Slow, function (Emission $Emission) {
   [$Operation, $elapsed] = $Emission->payload;

   error_log("query lenta ({$elapsed}s): {$Operation->query}");
});
```

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

`Bootgly\ADI\Databases\SQL\Transaction\Events`:

| Evento | Quando | Payload |
|---|---|---|
| `Begin` | uma transação iniciou | `Transaction` |
| `Commit` | uma transação commitou | `Transaction` |
| `Rollback` | uma transação sofreu rollback | `Transaction` |

`Bootgly\ADI\Databases\SQL\Schema\Migration\Events`:

| Evento | Quando | Payload |
|---|---|---|
| `Up` | uma migration foi aplicada | `Migration`, `$batch` (int) |
| `Down` | uma migration foi revertida | `Migration`, `$batch` (int) |

### API — Project

`Bootgly\API\Projects\Project\Events`:

| Evento | Quando | Payload |
|---|---|---|
| `Boot` | o projeto bootou | `Project` |
| `Shutdown` | o projeto bootado está sendo destruído | `Project` |

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
   $Emission->stop(); // listeners com prioridade menor não rodam
}, priority: 10);
```

## Referência

### `Emitter`

`Bootgly\ABI\Events\Emitter` — o barramento canônico vive em `Emitter::$Instance`.

```php
public function listen (Event&UnitEnum $Event, Listener|Closure $Listener, int $priority = 0): self
```

Registra um listener para um evento. `$priority` maior roda primeiro; a ordem de registro
desempata. Retorna o emitter para encadeamento.

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
