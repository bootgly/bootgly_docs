# Filas

O Bootgly traz uma fila de jobs nativa e sem dependências em `Bootgly\ACI\Queues`. Tire trabalho
lento — e-mails, PDFs, redimensionamento de imagens, chamadas a APIs externas — de dentro da
requisição e rode depois em um processo worker separado. Dois drivers (File e Redis), retry com
backoff, um armazenamento dead-letter e eventos de ciclo de vida já vêm embutidos. O driver File
não exige nenhuma configuração; o driver Redis fala o protocolo pelo próprio codec RESP do
Bootgly (sem dependência via Composer, com fast-path opcional por `ext-redis`).

> [!NOTE]
> Esta é a **fila de jobs sob demanda** (roda o trabalho assim que um worker estiver livre),
> distinta do **[Scheduler](/guide/scheduler/overview/)** (jobs cron por relógio). Use uma fila
> para enviar um recibo por e-mail após o checkout; use o scheduler para limpar um cache a cada
> cinco minutos.

## Escreva um handler

Um job é uma mensagem serializável: uma **class-string de handler** mais um **array de payload**.
O handler é qualquer classe que implemente `Queues\Handler`:

```php
use Bootgly\ACI\Queues\Handler;
use Bootgly\ACI\Queues\Job;

final class SendEmail implements Handler
{
   public function handle (Job $Job): void
   {
      $to = $Job->payload['to'];
      // ... envia o e-mail ...
   }
}
```

> [!IMPORTANT]
> Um job atravessa fronteiras de processo, então carrega **apenas dados serializáveis** — uma
> class-string de handler e um payload escalar/array, nunca uma Closure ou objeto vivo. (Ao
> contrário de um `Schedule\Job` agendado, que pode guardar uma Closure em memória.)

## Enfileire a partir de um request handler

Na plataforma Web, enfileire com uma chamada pela facade `Bootgly\WPI\Queues`:

```php
use Bootgly\WPI\Queues;

Queues::dispatch(SendEmail::class, ['to' => 'user@example.com']);   // fila padrão
Queues::dispatch(SendEmail::class, $payload, 'emails');             // uma fila nomeada
```

`dispatch()` constrói o `Job`, enfileira e o retorna — uma escrita local rápida (File) ou um
round-trip no Redis. Nunca bloqueia o event loop HTTP: a parte lenta roda depois, no processo
worker.

Já tem um `Job`? Empurre direto:

```php
use Bootgly\ACI\Queues\Job;

Queues::push(new Job(SendEmail::class, ['to' => '...']), 'emails');
```

Fora da plataforma Web (um script CLI, um teste), use o gerenciador `ACI\Queues` direto:

```php
use Bootgly\ACI\Queues;

$Queues = new Queues(['driver' => 'file']);
$Queues->fetch('emails')->enqueue(new Job(SendEmail::class, ['to' => '...']));
```

## Rode o worker

```bash
bootgly queue run            # drena a fila 'default' até SIGTERM/SIGINT
bootgly queue run emails     # drena uma fila nomeada
bootgly queue list           # lista as filas conhecidas e suas contagens de prontos
```

`queue run` reserva o próximo job devido, roda seu handler e o confirma em caso de sucesso. Uma
falha é repetida com backoff e, esgotadas as tentativas, movida para um armazenamento dead-letter
— um job ruim nunca derruba o worker. Instala handlers de `SIGTERM`/`SIGINT` para desligamento
gracioso e, no boot, recupera reivindicações órfãs deixadas por um crash anterior.

Rode vários workers (até em hosts diferentes com Redis) para mais throughput — os drivers
reivindicam cada job de forma atômica, então um job nunca é processado duas vezes.

## Configure tentativas, backoff e drivers

Um `queues.php` opcional na raiz do projeto retorna um array de config (o worker o lê; sem ele,
rodam padrões sensatos):

```php
// queues.php
use Bootgly\ACI\Queues\Backoffs;

return [
   'driver'     => 'file',                 // 'file' (padrão) ou 'redis'
   'attempts'   => 3,                      // tentativas antes de um job virar dead-letter
   'backoff'    => Backoffs::Exponential,  // Fixed | Linear | Exponential
   'base'       => 10,                     // base do backoff, em segundos
   'visibility' => 60,                     // um job reservado volta a pronto após N s se o worker morrer

   // Driver Redis:
   'host' => '127.0.0.1', 'port' => 6379,
];
```

Atraso do backoff para a tentativa número *n* (com `base` = 10s):

| Política | Atraso | Exemplo (n = 1, 2, 3) |
|---|---|---|
| `Fixed` | `base` | 10, 10, 10 |
| `Linear` | `base × n` | 10, 20, 30 |
| `Exponential` | `base × 2^(n-1)` | 10, 20, 40 |

## Atrase um job

Defina uma disponibilidade futura antes de enfileirar — o job fica invisível até lá:

```php
$Job = new Job(SendEmail::class, ['to' => '...']);
$Job->postpone(time() + 300);   // fica devido em 5 minutos
Queues::push($Job, 'emails');
```

## Drivers

| Driver | Setup | Escopo | Melhor para |
|---|---|---|---|
| **File** (padrão) | nenhum | um host | sem config, host único; reivindicação por rename atômico em `workdata/queues/<name>/` |
| **Redis** | um servidor Redis | cross-host | muitos workers / hosts; reivindicação `ZADD`/`ZREM`, `O(log N)` por op, um round-trip |

O driver File varre o diretório de prontos a cada reserve (`O(N·log N)`), o que serve para
backlogs modestos; prefira **Redis** quando uma fila acumula um backlog grande ou os workers
estão em hosts diferentes.

## Eventos de ciclo de vida

A fila emite eventos de domínio pelo barramento de eventos da ABI (`Bootgly\ABI\Events\Emitter`).
Os listeners são opt-in e não custam nada quando nenhum está anexado (guarda `check()` de
zero-alocação):

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ACI\Queues\Events;

Emitter::$Instance->listen(Events::Dispatch,  function (Emission $E) {
   [$queue, $Job] = $E->payload;
});
Emitter::$Instance->listen(Events::Processed, function (Emission $E) {
   [$Job, $durationMs] = $E->payload;
});
Emitter::$Instance->listen(Events::Failed,    function (Emission $E) {
   [$Job, $Throwable, $willRetry] = $E->payload;
});
```

| Evento | Quando | Payload |
|---|---|---|
| `Dispatch` | um job foi enfileirado | `$queue`, `Job` |
| `Processed` | um job rodou com sucesso | `Job`, `$durationMs` (float) |
| `Failed` | um job lançou exceção | `Job`, `Throwable`, `$willRetry` (bool) |

Veja o guia de **[Eventos](/guide/events/overview/)** para a API completa do barramento.

## Segurança

O armazenamento de jobs é uma **fronteira de confiança**: só a sua aplicação deve conseguir
escrever em `workdata/queues/` ou no servidor Redis — proteja-os com permissões de sistema de
arquivos e de rede. Como defesa em profundidade, os drivers desserializam os jobs armazenados com
`allowed_classes` restrito a `Job` (assim um payload adulterado nunca dispara um gadget de
object-injection), e o worker se recusa a instanciar um handler que não seja um `Queues\Handler`
declarado.

## Referência

- **Gerenciador** — `Bootgly\ACI\Queues`: `fetch(string $name = 'default'): Queue`. Guarda o
  `Config` e o registro de `Drivers`.
- **Queue** — `Queues\Queue`: `enqueue(Job)`, `reserve(): null|Job`, `complete(Job)`,
  `release(Job, int $delay = 0)`, `bury(Job)`, `recover(): int`, `count(): int`, `clear()`.
- **Job** — `Queues\Job(class-string $Handler, array $payload = [])`: somente-leitura `$Handler`,
  `$payload`, `$attempts`, `$available`, `$id`; `attempt()`, `postpone(int $timestamp)`.
- **Handler** — `Queues\Handler`: `handle(Job $Job): void`.
- **Worker** — `Queues\Worker(Queue, Config)`: `tick(): bool` (processa um job). Conduzido pelo
  `QueueCommand` (`bootgly queue run|list`).
- **Drivers** — registro `Queues\Drivers` (`'file'`, `'redis'`); `register(name, class)` pluga um
  driver custom. Ambos implementam `Queues\Driver`.
- **Enums** — `Queues\Backoffs` (`Fixed`, `Linear`, `Exponential`) e `Queues\Events`
  (`Dispatch`, `Processed`, `Failed`).
- **Adaptador WPI** — a facade `Bootgly\WPI\Queues` (`dispatch()`, `push()`, `boot()`) sobre
  `WPI\Queues\Messenger`.
- **Camadas** — `ACI\Queues` depende apenas da ABI (`IO/FS`, `Data/RESP`, eventos); o worker CLI
  e o adaptador `WPI\Queues` o consomem — sem back-dependency `ACI → WPI`.

## Próximas referências

- **[Scheduler](/guide/scheduler/overview/)** - rode jobs cron por relógio com um comando worker.
- **[Eventos](/guide/events/overview/)** - a API completa do barramento de eventos (`Emission`, prioridades).
- **[Cache](/guide/cache/overview/)** - cache File/APCu/Shared/Redis sobre o mesmo codec RESP.
