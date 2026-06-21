# Scheduler

O Bootgly traz um agendador de tarefas nativo e sem dependências em `Bootgly\ACI\Schedule`.
Declare jobs no estilo cron em um único arquivo, rode-os com um único comando de worker e
ganhe prevenção de sobreposição, recuperação de execuções perdidas e eventos de ciclo de
vida prontos para uso. O motor cron é escrito do zero — sem dependência do Composer.

> [!NOTE]
> Este é o **agendador de jobs** (cron por relógio de parede), distinto do scheduler de I/O
> assíncrono `Bootgly\ACI\Events\Scheduler` (loop de Fibers) e do `Events\Timer` (timers por
> intervalo). Use este para rodar um backup às 03:00 ou limpar um cache a cada cinco minutos.

## Declare jobs

Os jobs ficam em um arquivo `schedule.php` na raiz do projeto. Ele retorna uma
`Closure(Schedule $Schedule): void`:

```php
// schedule.php
use Bootgly\ACI\Schedule;
use Bootgly\ACI\Schedule\Catchups;
use Bootgly\ACI\Schedule\Frequencies;

return function (Schedule $Schedule): void {
   $Schedule->add('backup', BackupJob::class)       // class-string invocável ou Closure
      ->repeat(Frequencies::Daily, at: '03:00')     // todo dia às 03:00
      ->lock()                                       // nunca sobrepõe uma execução anterior
      ->recover(Catchups::Once);                     // roda uma vez se minutos foram perdidos

   $Schedule->add('cleanup', fn () => Cache->prune())
      ->repeat('*/5 * * * *');                       // cron cru de 5 campos, mesmo verbo
};
```

O worker procura o `schedule.php` no diretório do projeto bootado
(`BOOTGLY_PROJECT->path`), com fallback para o diretório de trabalho
(`BOOTGLY_WORKING_DIR`) quando nenhum projeto está bootado.

## Defina a cadência — `repeat()`

`repeat()` é a única forma de definir quando um job roda. Aceita um case de `Frequencies`,
uma string cron crua ou um `Cron` pronto:

```php
$Job->repeat(Frequencies::Minutely);             // * * * * *
$Job->repeat(Frequencies::Hourly);               // 0 * * * *
$Job->repeat(Frequencies::Daily, at: '03:00');   // 0 3 * * *
$Job->repeat(Frequencies::Weekly, at: '08:30');  // 30 8 * * 0  (domingo)
$Job->repeat(Frequencies::Monthly);              // 0 0 1 * *
$Job->repeat('*/5 9-17 * * 1-5');                // string cron crua
```

O motor cron nativo interpreta os cinco campos padrão (`minuto hora dia-do-mês mês
dia-da-semana`) e suporta `*`, listas (`,`), intervalos (`a-b`) e passos (`*/n`, `a-b/n`).
Segue a semântica Vixie: quando **ambos** dia-do-mês e dia-da-semana estão restritos, o job
roda quando **qualquer um** casa.

| Frequência | Cron | `at:` |
|---|---|---|
| `Minutely` | `* * * * *` | — |
| `Hourly` | `<m> * * * *` | minuto |
| `Daily` | `<m> <h> * * *` | `HH:MM` |
| `Weekly` | `<m> <h> * * 0` | `HH:MM` (domingo) |
| `Monthly` | `<m> <h> 1 * *` | `HH:MM` (dia 1) |

## Evite sobreposição — `lock()`

Chame `lock()` para que uma execução lenta nunca sobreponha a próxima. O scheduler obtém um
`flock` exclusivo não-bloqueante em `storage/schedule/<id>.lock` antes de despachar; se o
lock estiver retido, a execução é pulada e um evento `Skipped` (`'overlap'`) é emitido:

```php
$Schedule->add('report', ReportJob::class)
   ->repeat(Frequencies::Minutely)
   ->lock();   // se o report do minuto anterior ainda roda, pula este minuto
```

## Recupere execuções perdidas — `recover()`

Se o worker ficou fora do ar durante um ou mais minutos agendados, `recover()` decide o que
acontece no próximo boot:

```php
$Job->recover(Catchups::Skip);   // padrão — ignora o intervalo, retoma a partir de agora
$Job->recover(Catchups::Once);   // roda uma única recuperação, depois retoma
```

O worker chama `Schedule->recover(time())` uma vez na inicialização. Os timestamps da última
execução são persistidos por job em `storage/schedule/state.json`, então a política
sobrevive a reinícios.

## Rode o worker

```bash
bootgly schedule run    # inicia o loop do worker alinhado ao minuto
bootgly schedule list   # lista os jobs registrados e a próxima execução
```

`schedule run` recupera execuções perdidas uma vez, depois despacha cada job cujo cron casa
com o minuto atual, alinhado ao limite de minuto do relógio. Instala handlers de
`SIGTERM`/`SIGINT` para um desligamento gracioso — o loop termina o minuto corrente e para
de forma limpa. Cada job roda dentro de um `try/catch (\Throwable)`, então um job que falha
nunca derruba o worker.

```text
$ bootgly schedule list
backup    0 3 * * *      next: 2026-06-12 03:00
cleanup   */5 * * * *    next: 2026-06-11 22:05
```

## Eventos de ciclo de vida

O scheduler emite eventos de domínio pelo barramento de eventos da ABI
(`Bootgly\ABI\Events\Emitter`). Escute-os para logar, alertar ou coletar métricas — os
listeners são opcionais e não custam nada quando nenhum está anexado (guarda `check()` de
zero alocação):

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

Veja o guia **[Events](/guide/events/overview/)** para a API completa do barramento
(`Emission`, prioridades, propagação).

| Evento | Quando | Payload |
|---|---|---|
| `Started` | um job vai rodar | `$id`, `Job` |
| `Finished` | um job concluiu | `$id`, `$durationMs` (float) |
| `Failed` | um job lançou exceção | `$id`, `Throwable` |
| `Skipped` | uma execução foi pulada | `$id`, `$reason` (`'overlap'` \| `'catchup-skip'`) |

## Referência

- **Motor** — `Bootgly\ACI\Schedule`: `add(id, Task): Job`, `tick(int $timestamp)`,
  `recover(int $now)`. Mantém a coleção de `Job` em `$Schedule->Jobs`.
- **Job** — `Schedule\Job` (config holder fluente): `repeat()`, `lock()`, `recover()`,
  `run()`. Uma task é um `class-string` invocável ou uma `Closure`.
- **Cron** — `Schedule\Cron`: `check(int $timestamp): bool` (este minuto casa?) e
  `advance(int $from): int` (próximo timestamp que casa).
- **Enums** — `Schedule\Frequencies` (`Minutely`, `Hourly`, `Daily`, `Weekly`, `Monthly`)
  e `Schedule\Catchups` (`Skip`, `Once`).
- **Lock & State** — `Schedule\Lock` (`flock` por job) e `Schedule\State` (mapa JSON da
  última execução), ambos sob `storage/schedule/`. Orquestrados pelo motor, nunca pelo
  `Job`.
- **Camadas** — `Schedule` é um componente ACI que depende apenas do barramento de eventos
  da ABI; o worker `ScheduleCommand` fica na camada CLI.

## Próximas referências

- **[Cache](/guide/cache/overview/)** - limpe ou aqueça caches a partir de um job agendado.
- **[Configuration](/guide/configuration/overview/)** - carregue configs por escopo e `.env`.
- **[Performance](/guide/performance/overview/)** - ajuste workers, pools e concorrência.
