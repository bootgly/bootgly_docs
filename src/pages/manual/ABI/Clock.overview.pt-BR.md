# Clock

`Clock` é a única forma de injetar a hora nos pontos de relógio do Bootgly. Ele coloca o relógio
de parede e o relógio monotônico do sistema atrás de um único objeto, então o código que precisa
da hora recebe um `Clock` em vez de chamar `time()`, `microtime()` ou `hrtime()` — e um teste
entrega a ele um relógio que move à mão. `Stopwatch` mede tempo decorrido nele.

## Ler a hora

```php
use Bootgly\ABI\Clock;

$Clock = new Clock;

$Clock->now;  // 1793960035.897368 — hora de parede, segundos em float (microtime(true))
$Clock->time; // 1793960035        — hora de parede, segundos inteiros (time())
$Clock->tick; // 310700984429682   — tempo monotônico, nanossegundos (hrtime(true))
```

Toda leitura consulta o sistema no momento em que é lida; nada fica em cache. Escolha a leitura
pelo que ela mede:

| Leitura | Relógio | Unidade | Use para |
|---|---|---|---|
| `$now` | parede | segundos em float | timestamps com precisão abaixo do segundo |
| `$time` | parede | segundos inteiros | expirações, datas guardadas ou comparadas com guardadas |
| `$tick` | monotônico | nanossegundos inteiros | prazos, timeouts, durações |

O relógio de parede é a data que o sistema mostra: ele salta quando alguém (ou o NTP) acerta o
relógio do sistema. O relógio monotônico nunca volta e nunca salta — mas sua origem é
arbitrária, então só a diferença entre dois ticks tem significado:

```php
$deadline = $Clock->tick + 5 * 1_000_000_000; // daqui a 5 s, no relógio monotônico

while ($Clock->tick < $deadline) {
   // ...
}
```

## Receba um Clock em vez do sistema

Dê à classe que precisa da hora um `Clock`, com o do sistema por padrão:

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

Em produção ela lê o sistema. Em um teste, passe o dublê
`Bootgly\ACI\Tests\Doubles\Fake\Clock` — ele **é** um `Clock`, congelado até você movê-lo:

```php
use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock(1_000_000);          // parede em 1000000, tick em 0
$Invitation = new Invitation($Clock);

$Invitation->expire(1_000_000, 60);     // false
$Clock->advance(60);                    // parede +60 s, tick +60_000_000_000 ns
$Invitation->expire(1_000_000, 60);     // true
```

`advance()` recusa um avanço que levaria o tick além da faixa de int em nanossegundos (cerca de
292 anos): lança `OverflowException` e deixa o relógio como estava.

Veja [Dublês](/testing/deep/doubles/overview/) para tudo o que o fake faz.

## Medir tempo decorrido

`Stopwatch` lê o tick monotônico, então mudar a data do sistema nunca estica nem encolhe
uma medição:

```php
use Bootgly\ABI\Stopwatch;

$Stopwatch = new Stopwatch;
$Stopwatch->start();

// ... o trabalho medido

$Stopwatch->stop();
echo $Stopwatch->elapsed; // 12503311   (nanossegundos)
echo $Stopwatch->seconds; // 0.012503311
```

Funciona como um cronômetro de mão: `start()` depois de `stop()` retoma do que já mediu,
`reset()` zera, e `$elapsed` pode ser lido enquanto ele corre (inclui a corrida atual):

```php
$Stopwatch->reset()->start();
foreach ($batches as $batch) {
   import($batch);

   if ($Stopwatch->seconds > 30.0) {
      break; // passou do orçamento de tempo
   }
}
```

Passe um `Clock` para medir nele — com o fake, uma duração é exata:

```php
use Bootgly\ABI\Stopwatch;
use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock;
$Stopwatch = new Stopwatch($Clock)->start();
$Clock->advance(1.5);
$Stopwatch->elapsed; // 1500000000
```

Um cronômetro confia no tick do relógio que lê. O tick do sistema nunca volta, mas o `reset()`
do fake leva o tick dele de volta a 0: um cronômetro rodando através desse reset lê um `$elapsed`
negativo. Zere o cronômetro junto com o fake.

## Clocks no framework

As peças do framework que leem a hora recebem um `Clock`:

| Peça | Onde o Clock entra | Leitura |
|---|---|---|
| `Bootgly\ABI\Resources\Cache` | opção `'clock'` | `$time` (segundos de TTL) — drivers file, shared e memory; APCu e Redis expiram as entradas no relógio do próprio servidor, que nenhum Clock move |
| `Bootgly\ACI\Queues` | opção `'clock'` | `$time` (timestamps de jobs) |
| Middleware `RateLimit` | argumento `clock:` | `$time` (segundos da janela) |
| `Tokens`, `Users`, `Trust` | propriedade `$Clock` | `$time` (hora dos tokens; `freeze()` ainda vence) |
| `JWT\Remote` | argumento `Clock:` | `$time` (frescor do conjunto), `$tick` (piso da origem) |

```php
use Bootgly\ABI\Resources\Cache;
use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock(1_000_000);
$Cache = new Cache(['driver' => 'memory', 'clock' => $Clock]);

$Cache->store('key', 'value', 60);
$Clock->advance(60);
$Cache->fetch('key'); // null — expirou
```

O ponto de injeção é escrito de um jeito em cada peça: uma opção `'clock'` (Cache, Queues), um
argumento `clock:` (`RateLimit`), um argumento `Clock:` (`JWT\Remote`) ou uma propriedade
`$Clock` (`Tokens`, `Users`, `Trust`). Esses nomes ficam como estão na 1.x; a direção para a 2.0,
quando a forma de closure sair, é uma grafia só — um `Clock` chamado `Clock` (um argumento ou
opção `Clock:`).

`Tokens`, `Users` e `Trust` também mantêm `freeze()` e `resume()`. `freeze($timestamp)` fixa a
hora dos tokens em um segundo Unix, seja o que for que `$Clock` leia; `resume()` volta a
`$Clock->time`. Mova o tempo com um `Fake\Clock` em `$Clock`; congele quando um instante fixo é
tudo o que uma verificação precisa.

> **Depreciado desde 1.1.0:** a opção `clock` de Cache e Queues e o argumento `clock:` do
> `RateLimit` ainda aceitam uma closure que retorna um timestamp Unix
> (`fn (): float => $Clock->now`). Ela é lida como `(int) $closure()` — exatamente como antes —
> através de `Clock::adapt()`, e é removida na 2.0.0. Passe o próprio `Clock`. O `$tick` do
> relógio adaptado segue a hora de parede da closure, então volta quando o valor dela volta: não
> meça durações nele. Em `Queues\Config`, atribuir `$Clock` limpa o `$clock` depreciado.

## Ainda fora do Clock

Alguns leitores ainda chamam o relógio do sistema diretamente e ficam para uma versão futura:
`JWT\Tokens` (seu próprio ponto de timestamp do `freeze()`), `JWT\Usage`, `JWT\Validator`,
`JWT\Vault`, o `Worker` de Queues (duração dos jobs) e a verificação de visibilidade do driver
file de Queues (`recover()`). Um Clock entregue a Cache, Queues ou `JWT\Remote` não os move.

## Referência

```php
public float $now { get; }
```

Hora de parede em segundos desde a época Unix, com microssegundos — `microtime(true)`, lida a
cada acesso.

```php
public int $time { get; }
```

Hora de parede em segundos inteiros desde a época Unix — `time()`, lida a cada acesso.

```php
public int $tick { get; }
```

Tempo monotônico em nanossegundos a partir de uma origem arbitrária — `hrtime(true)`, lido a
cada acesso. Nunca diminui.

```php
public static function adapt (Closure $Closure): Clock
```

Descontinuado desde a 1.1.0, removido na 2.0.0. Devolve um Clock lido de uma closure `clock` legada que retorna um timestamp Unix: `$time` é `(int) $Closure()`, `$now` o mesmo valor como float e `$tick` esse valor em nanossegundos. As opções `clock` de Cache, Queues e RateLimit o usam para as closures que ainda aceitam; passe um `Clock` no lugar.

```php
public function Stopwatch::__construct (null|Clock $Clock = null)
```

Cria um cronômetro parado em zero que lê `$Clock` (o `Clock` do sistema quando null).

```php
public function Stopwatch::start (): static
```

Inicia o cronômetro, ou o retoma depois de `stop()`, a partir do `$tick` atual do relógio.
Iniciar um cronômetro que já corre não muda nada.

```php
public function Stopwatch::stop (): static
```

Para o cronômetro, somando a corrida atual ao que ele mediu. Parar um cronômetro parado não
muda nada.

```php
public function Stopwatch::reset (): static
```

Para o cronômetro e zera o que ele mediu.

```php
public private(set) Clock $Stopwatch->Clock;
```

O relógio que o cronômetro lê.

```php
public private(set) null|int $Stopwatch->started;
```

O `$tick` em que a corrida atual começou; `null` enquanto parado.

```php
public bool $Stopwatch->running { get; }
```

Se o cronômetro está correndo.

```php
public int $Stopwatch->elapsed { get; }
```

Nanossegundos decorridos: toda corrida parada mais, enquanto corre, a atual.

```php
public float $Stopwatch->seconds { get; }
```

`$elapsed` em segundos (`$elapsed / 1e9`).
