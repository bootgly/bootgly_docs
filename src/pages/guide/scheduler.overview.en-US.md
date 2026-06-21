# Scheduler

Bootgly ships a native, dependency-free job scheduler at `Bootgly\ACI\Schedule`. Declare
cron-style jobs in one file, run them with a single worker command, and get overlap
prevention, missed-run catch-up and lifecycle events out of the box. The cron engine is
written from scratch — no Composer dependency.

> [!NOTE]
> This is the **job scheduler** (wall-clock cron jobs), distinct from the async I/O
> `Bootgly\ACI\Events\Scheduler` (Fiber loop) and `Events\Timer` (interval timers). Use
> this one to run a backup at 03:00 or prune a cache every five minutes.

## Declare jobs

Jobs live in a `schedule.php` file at your project root. It returns a
`Closure(Schedule $Schedule): void`:

```php
// schedule.php
use Bootgly\ACI\Schedule;
use Bootgly\ACI\Schedule\Catchups;
use Bootgly\ACI\Schedule\Frequencies;

return function (Schedule $Schedule): void {
   $Schedule->add('backup', BackupJob::class)       // invokable class-string or Closure
      ->repeat(Frequencies::Daily, at: '03:00')     // every day at 03:00
      ->lock()                                       // never overlap with a previous run
      ->recover(Catchups::Once);                     // run once if minutes were missed

   $Schedule->add('cleanup', fn () => Cache->prune())
      ->repeat('*/5 * * * *');                       // raw 5-field cron, same verb
};
```

The worker looks for `schedule.php` in the booted project directory
(`BOOTGLY_PROJECT->path`), falling back to the working directory (`BOOTGLY_WORKING_DIR`)
when no project is booted.

## Set the cadence — `repeat()`

`repeat()` is the single way to define when a job runs. It accepts a `Frequencies` case, a
raw cron string, or a prepared `Cron`:

```php
$Job->repeat(Frequencies::Minutely);             // * * * * *
$Job->repeat(Frequencies::Hourly);               // 0 * * * *
$Job->repeat(Frequencies::Daily, at: '03:00');   // 0 3 * * *
$Job->repeat(Frequencies::Weekly, at: '08:30');  // 30 8 * * 0  (Sunday)
$Job->repeat(Frequencies::Monthly);              // 0 0 1 * *
$Job->repeat('*/5 9-17 * * 1-5');                // raw cron string
```

The native cron engine parses the standard five fields (`minute hour day-of-month month
day-of-week`) and supports `*`, lists (`,`), ranges (`a-b`) and steps (`*/n`, `a-b/n`). It
follows Vixie semantics: when **both** day-of-month and day-of-week are restricted, the job
runs when **either** matches.

| Frequency | Cron | `at:` |
|---|---|---|
| `Minutely` | `* * * * *` | — |
| `Hourly` | `<m> * * * *` | minute |
| `Daily` | `<m> <h> * * *` | `HH:MM` |
| `Weekly` | `<m> <h> * * 0` | `HH:MM` (Sunday) |
| `Monthly` | `<m> <h> 1 * *` | `HH:MM` (1st) |

## Prevent overlap — `lock()`

Call `lock()` so a slow run can never overlap the next one. The scheduler takes a
non-blocking exclusive `flock` on `storage/schedule/<id>.lock` before dispatching; if the
lock is held, the run is skipped and a `Skipped` event (`'overlap'`) is emitted:

```php
$Schedule->add('report', ReportJob::class)
   ->repeat(Frequencies::Minutely)
   ->lock();   // if last minute's report is still running, skip this minute
```

## Catch up missed runs — `recover()`

If the worker was down across one or more scheduled minutes, `recover()` decides what
happens on the next boot:

```php
$Job->recover(Catchups::Skip);   // default — ignore the gap, resume from now
$Job->recover(Catchups::Once);   // run a single catch-up, then resume
```

The worker calls `Schedule->recover(time())` once on startup. Last-run timestamps are
persisted per job in `storage/schedule/state.json`, so the policy survives restarts.

## Run the worker

```bash
bootgly schedule run    # start the minute-aligned worker loop
bootgly schedule list   # print registered jobs and their next run
```

`schedule run` recovers missed runs once, then ticks every job whose cron matches the
current minute, aligned to the wall-clock minute boundary. It installs `SIGTERM`/`SIGINT`
handlers for a graceful shutdown — the loop finishes the current minute and stops cleanly.
Each job runs inside a `try/catch (\Throwable)`, so one failing job can never kill the
worker.

```text
$ bootgly schedule list
backup    0 3 * * *      next: 2026-06-12 03:00
cleanup   */5 * * * *    next: 2026-06-11 22:05
```

## Lifecycle events

The scheduler emits domain events through the ABI event bus
(`Bootgly\ABI\Events\Emitter`). Listen to them to log, alert or collect metrics — listeners
are opt-in and cost nothing when none are attached (zero-allocation `check()` guard):

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ACI\Schedule\Events;

Emitter::$Instance->listen(Events::Started,  function (Emission $E) {
   [$id, $Job] = $E->payload;
});
Emitter::$Instance->listen(Events::Finished, function (Emission $E) {
   [$id, $duration] = $E->payload;
});
Emitter::$Instance->listen(Events::Failed,   function (Emission $E) {
   [$id, $Throwable] = $E->payload;
});
Emitter::$Instance->listen(Events::Skipped,  function (Emission $E) {
   [$id, $reason] = $E->payload;
});
```

See the **[Events](/guide/events/overview/)** guide for the full bus API (`Emission`,
priorities, propagation).

| Event | When | Payload |
|---|---|---|
| `Started` | a job is about to run | `$id`, `Job` |
| `Finished` | a job completed | `$id`, `$durationMs` (float) |
| `Failed` | a job threw | `$id`, `Throwable` |
| `Skipped` | a run was skipped | `$id`, `$reason` (`'overlap'` \| `'catchup-skip'`) |

## Reference

- **Engine** — `Bootgly\ACI\Schedule`: `add(id, Task): Job`, `tick(int $timestamp)`,
  `recover(int $now)`. Holds the `Job` collection in `$Schedule->Jobs`.
- **Job** — `Schedule\Job` (fluent config holder): `repeat()`, `lock()`, `recover()`,
  `run()`. A task is an invokable `class-string` or a `Closure`.
- **Cron** — `Schedule\Cron`: `check(int $timestamp): bool` (does this minute match?) and
  `advance(int $from): int` (next matching timestamp).
- **Enums** — `Schedule\Frequencies` (`Minutely`, `Hourly`, `Daily`, `Weekly`, `Monthly`)
  and `Schedule\Catchups` (`Skip`, `Once`).
- **Lock & State** — `Schedule\Lock` (per-job `flock`) and `Schedule\State` (JSON last-run
  map), both under `storage/schedule/`. Orchestrated by the engine, never by `Job`.
- **Layering** — `Schedule` is an ACI component that depends only on the ABI event bus; the
  `ScheduleCommand` worker lives in the CLI layer.

## Next references

- **[Cache](/guide/cache/overview/)** - prune or warm caches from a scheduled job.
- **[Configuration](/guide/configuration/overview/)** - load scoped configs and `.env` values.
- **[Performance](/guide/performance/overview/)** - tune workers, pools and concurrency.
