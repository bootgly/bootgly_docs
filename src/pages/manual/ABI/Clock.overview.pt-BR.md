# Clock

`Clock` é a única forma de injetar o tempo nos pontos do Bootgly que dependem do relógio. Ele junta
o wall clock e o relógio monotônico do sistema em um só objeto: o código que precisa saber a hora
recebe um `Clock` em vez de chamar `time()`, `microtime()` ou `hrtime()` — e, no teste, você passa
um relógio que você mesmo avança. O `Stopwatch` usa esse mesmo `Clock` para medir tempo decorrido.

## Lendo o tempo

```php
use Bootgly\ABI\Clock;

$Clock = new Clock;

$Clock->now;  // 1793960035.897368 — wall clock, segundos em float (microtime(true))
$Clock->time; // 1793960035        — wall clock, segundos inteiros (time())
$Clock->tick; // 310700984429682   — tempo monotônico, nanossegundos (hrtime(true))
```

Cada leitura consulta o sistema na hora em que é feita; nada fica em cache. Escolha a leitura de
acordo com o que você quer medir:

| Leitura | Relógio | Unidade | Use para |
|---|---|---|---|
| `$now` | wall clock | segundos em float | timestamps com frações de segundo |
| `$time` | wall clock | segundos inteiros (int) | expirações e datas que são salvas ou comparadas com datas salvas |
| `$tick` | monotônico | nanossegundos inteiros (int) | deadlines, timeouts, durações |

O wall clock é a data e hora que o sistema mostra: ele pula quando alguém (ou o NTP) ajusta o
relógio do sistema. O relógio monotônico nunca volta e nunca pula — mas o ponto de partida dele é
arbitrário, então só a diferença entre dois ticks tem significado:

```php
$deadline = $Clock->tick + 5 * 1_000_000_000; // daqui a 5 s, no relógio monotônico

while ($Clock->tick < $deadline) {
   // ...
}
```

## Receba um Clock em vez de ler o sistema

Faça a classe que precisa do tempo receber um `Clock` — e usar o relógio do sistema quando nenhum for passado:

```php
use Bootgly\ABI\Clock;

final class Invitation
{
   // * Config
   public private(set) Clock $Clock;

   public function __construct (null|Clock $Clock = null)
   {
      $this->Clock = $Clock ?? new Clock;
   }

   public function expire (int $issued, int $TTL): bool
   {
      return $this->Clock->time >= $issued + $TTL;
   }
}
```

Em produção, ela lê o relógio do sistema. No teste, passe o test double
`Bootgly\ACI\Tests\Doubles\Fake\Clock` — ele **é** um `Clock`, só que parado até você avançá-lo:

```php
use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock(1_000_000);          // wall clock em 1000000, tick em 0
$Invitation = new Invitation($Clock);

$Invitation->expire(1_000_000, 60);     // false
$Clock->advance(60);                    // wall clock +60 s, tick +60_000_000_000 ns
$Invitation->expire(1_000_000, 60);     // true
```

O `advance()` recusa um avanço que faria o tick (contado em nanossegundos) passar do maior valor de
um int (cerca de 292 anos): ele lança uma `OverflowException` e deixa o relógio do jeito que estava.

Veja [Doubles](/testing/deep/doubles/overview/) para tudo o que o fake faz.

## Medindo tempo decorrido

O `Stopwatch` lê o tick monotônico, então mudar a data do sistema nunca aumenta nem diminui uma
medição:

```php
use Bootgly\ABI\Stopwatch;

$Stopwatch = new Stopwatch;
$Stopwatch->start();

// ... o trabalho que está sendo medido

$Stopwatch->stop();
echo $Stopwatch->elapsed; // 12503311   (nanossegundos)
echo $Stopwatch->seconds; // 0.012503311
```

Ele funciona como um cronômetro de mão: `start()` depois de `stop()` continua a partir do que já
foi medido, `reset()` zera tudo, e dá para ler `$elapsed` com ele ainda rodando (o valor já inclui
a medição em andamento):

```php
$Stopwatch->reset()->start();
foreach ($batches as $batch) {
   import($batch);

   if ($Stopwatch->seconds > 30.0) {
      break; // estourou o tempo disponível
   }
}
```

Passe um `Clock` para medir com ele — com o fake, a duração é exata:

```php
use Bootgly\ABI\Stopwatch;
use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock;
$Stopwatch = new Stopwatch($Clock)->start();
$Clock->advance(1.5);
$Stopwatch->elapsed; // 1500000000
```

O cronômetro usa o tick do relógio que lê, sem nenhuma verificação. O tick do sistema nunca volta, mas o `reset()`
do fake leva o tick de volta a 0: um cronômetro que estava rodando quando esse reset aconteceu
passa a mostrar um `$elapsed` negativo. Sempre que resetar o fake, resete o cronômetro junto.

## Clocks no framework

As partes do framework que leem o tempo recebem um `Clock`:

| Parte | Onde passar o Clock | Leitura |
|---|---|---|
| `Bootgly\ABI\Resources\Cache` | opção `'clock'` | `$time` (segundos do TTL) — drivers file, shared e memory; no APCu e no Redis a expiração das entradas segue o relógio do próprio servidor, que nenhum Clock consegue avançar |
| `Bootgly\ACI\Queues` | opção `'clock'` | `$time` (timestamps dos jobs) |
| Middleware `RateLimit` | argumento `clock:` | `$time` (segundos da janela) |
| `Tokens`, `Users`, `Trust` | propriedade `$Clock` | `$time` (hora usada nos tokens; o `freeze()` continua tendo prioridade) |
| `JWT\Remote` | argumento `Clock:` | `$time` (validade do conjunto de chaves em cache), `$tick` (intervalo mínimo entre consultas à origem do JWKS) |

```php
use Bootgly\ABI\Resources\Cache;
use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock(1_000_000);
$Cache = new Cache(['driver' => 'memory', 'clock' => $Clock]);

$Cache->store('key', 'value', 60);
$Clock->advance(60);
$Cache->fetch('key'); // null — expirou
```

O ponto de injeção tem um nome diferente em cada parte: opção `'clock'` (Cache, Queues), argumento
`clock:` (`RateLimit`), argumento `Clock:` (`JWT\Remote`) ou propriedade `$Clock` (`Tokens`,
`Users`, `Trust`). Esses nomes não mudam durante a 1.x; o plano para a 2.0, quando a forma com
closure deixar de existir, é ter um nome só — um `Clock` chamado `Clock` (argumento ou opção
`Clock:`).

`Tokens`, `Users` e `Trust` também continuam com `freeze()` e `resume()`. O `freeze($timestamp)`
fixa a hora dos tokens em um timestamp Unix, seja qual for o valor de `$Clock`;
o `resume()` volta a usar `$Clock->time`. Para fazer o tempo passar, coloque um `Fake\Clock` em
`$Clock`; use o `freeze()` quando a verificação só precisar de um instante fixo.

> **Deprecated desde a 1.1.0:** a opção `clock` de Cache e Queues e o argumento `clock:` do
> `RateLimit` ainda aceitam uma closure que retorna um timestamp Unix
> (`fn (): float => $Clock->now`). O retorno dela é lido como `(int) $closure()` — exatamente como
> antes — via `Clock::adapt()`, e esse suporte a closure será removido na 2.0.0. Passe o próprio `Clock`. O `$tick` do
> relógio adaptado acompanha o wall clock da closure, então ele volta quando o valor da closure
> volta: não meça durações com ele. Em `Queues\Config`, atribuir `$Clock` limpa o `$clock`
> deprecated.

## Ainda sem Clock

Alguns pontos ainda leem o relógio do sistema diretamente e vão ser migrados em uma versão futura:
`JWT\Tokens` (que tem seu próprio ponto de injeção de timestamp, o `freeze()`), `JWT\Usage`,
`JWT\Validator`, `JWT\Vault`, o `Worker` de Queues (duração dos jobs) e a verificação de
visibilidade do driver file de Queues (`recover()`). Um Clock passado para Cache, Queues ou
`JWT\Remote` não afeta esses pontos.

## Referência

```php
public float $now { get; }
```

Hora do wall clock em segundos desde a epoch Unix, com microssegundos — `microtime(true)`, lida a
cada acesso.

```php
public int $time { get; }
```

Hora do wall clock em segundos inteiros desde a epoch Unix — `time()`, lida a cada acesso.

```php
public int $tick { get; }
```

Tempo monotônico em nanossegundos, contado a partir de uma origem arbitrária — `hrtime(true)`, lido
a cada acesso. Nunca diminui.

```php
public static function adapt (Closure $Closure): Clock
```

Deprecated desde a 1.1.0, removido na 2.0.0. Retorna um Clock que lê uma closure `clock` legada que retorna um timestamp Unix: `$time` é `(int) $Closure()`, `$now` é o mesmo valor como float e `$tick` é esse valor em nanossegundos. As opções `clock` de Cache, Queues e RateLimit usam esse método para as closures que ainda aceitam; passe um `Clock` no lugar.

```php
public function Stopwatch::__construct (null|Clock $Clock = null)
```

Cria um cronômetro parado e zerado que lê `$Clock` (o `Clock` do sistema quando for null).

```php
public function Stopwatch::start (): static
```

Inicia o cronômetro, ou retoma a contagem após um `stop()`, a partir do `$tick` atual do relógio.
Chamar `start()` com o cronômetro já rodando não muda nada.

```php
public function Stopwatch::stop (): static
```

Interrompe o cronômetro e soma a medição em andamento ao total já medido. Chamar `stop()` com o
cronômetro já parado não muda nada.

```php
public function Stopwatch::reset (): static
```

Interrompe o cronômetro e zera o total medido.

```php
public private(set) Clock $Stopwatch->Clock;
```

O relógio que o cronômetro lê.

```php
public private(set) null|int $Stopwatch->started;
```

O `$tick` em que a medição em andamento começou; `null` enquanto o cronômetro está parado.

```php
public bool $Stopwatch->running { get; }
```

Indica se o cronômetro está rodando.

```php
public int $Stopwatch->elapsed { get; }
```

Nanossegundos decorridos: a soma de todos os trechos já encerrados e, se estiver rodando, da
medição em andamento.

```php
public float $Stopwatch->seconds { get; }
```

`$elapsed` em segundos (`$elapsed / 1e9`).
