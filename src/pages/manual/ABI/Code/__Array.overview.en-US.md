# __Array

`__Array` is Bootgly's array Code API. It does two things: it gives a name to the array
shapes PHP has no single call for, and it runs **chained operations in one pass** instead
of allocating an intermediate array per stage.

The second one is the reason it exists. Every table on this page comes from the framework's
microbenchmarks — run `bootgly test benchmark micro Bootgly/ABI/Code/__Array/tests/benchmarks --processes=5`
to reproduce them. They were measured on PHP 8.4.23 with opcache and the tracing JIT on, and
most of the chain's win depends on the JIT: see [Without the JIT](#without-the-jit) before
you count on it.

## The one rule

**A single operation goes to PHP. A chain goes to `__Array` — or to a `foreach` you write
yourself.**

A wrapper around one native call can never win: its floor is that call plus the dispatch
to reach it. So there is no `__Array` equivalent of `array_keys()`, and there never will be.

A chain is the opposite. `array_values(array_filter(array_map($f, $a), $g))` pays twice.
The larger cost is the callback: `array_map()` and `array_filter()` call it from C, through
the engine's generic call path, once per element — two to three times what the same call
costs from a JIT-compiled PHP loop. The smaller one is the intermediate array each stage
allocates. A recorded chain runs one PHP loop, so it pays neither.

A hand-written `foreach` pays neither too, and it is faster still — it is the same loop
without an object in front of it. What `__Array` adds is that the loop still reads as the
chain it replaces.

```php
use Bootgly\ABI\Code\__Array;

$Array = new __Array($rows);

// one pass, one array — no intermediates
$Array->map($Normalize)->filter($Active)->collect();
```

## Chain operations

`map()` and `filter()` record a stage and return the chain. Nothing runs until a terminal
asks for a result, and then every stage runs together, once per element:

```php
$Active = static fn (array $User): bool => $User['status'] === 'active';
$Name   = static fn (array $User): string => $User['name'];

// Native — one intermediate array per stage, then a third to re-index
$names = array_values(
   array_map($Name, array_filter($users, $Active))
);

// __Array — one pass, one array
$names = new __Array($users)->filter($Active)->map($Name)->collect();
```

`collect()` always returns a **list**. Survivors are appended as they are found, so the
`array_values()` the native `array_filter()` idiom needs is already done — keys from the
source are not carried.

Measured against `array_values(array_filter(array_map(...)))`, with the same work written
out as a `foreach` for control:

| Elements | Native chain | Chain, built per call | Hand-written `foreach` |
|---|---:|---:|---:|
| 5 | 439.0 ns | 401.8 ns (1.1x faster) | 120.9 ns (3.6x faster) |
| 20 | 1398.1 ns | 686.4 ns (**2.0x faster**) | 390.4 ns (3.6x faster) |
| 100 | 6247.6 ns | 2247.9 ns (**2.8x faster**) | 1871.4 ns (3.3x faster) |
| 1000 | 61 904 ns | 18 929 ns (**3.3x faster**) | 17 828 ns (3.5x faster) |

Read the last column before the middle one: the win belongs to the single pass, not to
`__Array`. The hand-written loop is faster at every size — by 6% at 1000 elements, and by
3.3x at 5, where opening the chain (an object plus its recorded stages) costs more than
the work itself. On small arrays, build the chain once and reuse it —
see [Reuse a chain across calls](#reuse-a-chain-across-calls).

The table times the chain opened as `new Pipeline($array)`. Opening it through
`new __Array($rows)` builds one more object first — about 80 ns more per call, measured on
PHP 8.5.10. That is noise at 100 elements, but at 5 it is enough to fall behind the native
chain.

Measured by `04-chain-fusion.Microbenchmark.php`, stored in
`results/04-chain-fusion.php-8.4.23.json`. The shape dispatch that makes it possible is
priced separately in `07-pipeline-shapes.Microbenchmark.php`.

## Find the first match, or ask whether one exists

This is where the largest number on this page comes from — and it comes from stopping
early, which any loop can do. The native idiom has to build the whole filtered array
before it can tell you what the first element is; a chain stops at the first survivor and
never builds an array:

```php
// Native — the whole filtered array is built before either question is answered
$Admins = array_values(array_filter($users, $IsAdmin));

$Admin = $Admins[0] ?? null;   // the first admin, or null

if ($Admins !== []) {          // is there one at all?
   // ...
}

// __Array — stops at the first survivor, builds nothing
$Admin = new __Array($users)->filter($IsAdmin)->find();

if ( new __Array($users)->filter($IsAdmin)->check() ) {
   // ...
}
```

PHP 8.4's `array_find()` also stops early, so it is the fairer of the two native forms —
but it can only search an array that already exists, so a chain still has to materialize
the `map` before handing it over. That is the second row below.

With 1000 elements and a match 5% in:

| | Time | |
|---|---:|---|
| `array_values(array_filter(array_map(...)))[0]` | 56 897 ns | |
| `array_find(array_map(...))` (PHP 8.4, C) | 28 115 ns | 2.0x faster |
| `->map()->filter()->find()` | **1126 ns** | **51x faster** |
| hand-written `foreach` + `return` | 829 ns | 69x faster |

The 51x is not the chain being fast; it is the native idiom being wasteful. It maps all
1000 elements and filters all of them to read one, while any loop that stops early walks
51 — and the hand-written one walks them faster still, because it builds no chain. Against
the fairest native form, `array_find(array_map())`, the chain is 25x faster.

When nothing matches, nothing can stop early, and the chain is still about 3x faster. That
part is the same callback-dispatch win as `collect()`, and it depends on the JIT the same
way. The further into the array the match sits, the smaller the margin; the bigger the
array, the larger it.

Measured by `08-early-exit.Microbenchmark.php`, stored in
`results/08-early-exit.php-8.4.23.json`. That case sweeps both sizes against three hit
positions.

`find()` returns `null` when nothing survives. Since `null` can also *be* a survivor, use
`check()` when that distinction matters — exactly as with PHP's own `array_find()`.

## Reuse a chain across calls

A chain built inside the call pays for the object and the recorded stages every time. On a
large array that disappears into the work; on a small one it **is** the work.

`__Array::pipe()` opens a chain with no source. Build it once — at boot, in a constructor,
in a static property — and `apply()` it per call:

```php
use Bootgly\ABI\Code\__Array;

// once
$Headers = __Array::pipe()->map($Normalize)->filter($Allowed);

// per request
$Headers->apply($raw);
```

That is what makes the API pay on the small arrays a server actually handles:

| Elements | Native chain | Chain built per call | Chain built once + `apply()` | Hand-written `foreach` |
|---|---:|---:|---:|---:|
| 5 | 438.6 ns | 382.6 ns (1.1x) | **152.2 ns (2.9x)** | 132.5 ns (3.3x) |
| 8 | 628.8 ns | 441.2 ns (1.4x) | **205.8 ns (3.1x)** | 184.2 ns (3.4x) |
| 20 | 1377.2 ns | 667.8 ns (2.1x) | **434.2 ns (3.2x)** | 405.4 ns (3.4x) |

Built once, the chain comes within 15% of the hand-written loop at 5 elements and within
7% at 20.

Measured by `09-pipeline-reuse.Microbenchmark.php`, stored in
`results/09-pipeline-reuse.php-8.4.23.json`.

## Count and fold

Both walk the chain once and never materialize it:

```php
$active = new __Array($users)->filter($Active)->count();

$total = new __Array($orders)
   ->map($Amount)
   ->reduce(static fn (int $carry, int $amount): int => $carry + $amount, 0);
```

At 100 elements `count()` is 3.1x faster than `count(array_filter(array_map(...)))` and
`reduce()` 3.4x faster than `array_reduce()` over the same filtered array — 3.6x and 3.9x
at 1000. The native forms materialize two arrays to produce a single value; these produce
it as the pass goes. A hand-written fold keeps pace — within 7% from 100 elements up — and
is 1.6x faster at 20, where opening the chain dominates.

Measured by `10-terminals.Microbenchmark.php`, stored in
`results/10-terminals.php-8.4.23.json`.

## Read the boundary entries

`->First` and `->Last` give the entry **and** the key it sits at, in one read — natively
that is `array_key_first()` plus an index:

```php
$Array = new __Array($rows);

$Array->First->key;
$Array->First->value;
$Array->Last->key;
$Array->Last->value;
```

Both are `{key: null, value: null}` for an empty array. They cost about 3x the native pair
— 3.5x when the instance is built just for the read — so reach for them where the pair
genuinely simplifies the caller, not in a hot path.
Measured by `00-boundary.Microbenchmark.php`; the cost of every possible wrapper form is
broken down in `03-wrapper-forms.Microbenchmark.php`.

`->multidimensional` answers whether any direct value is itself an array. It is shallow by
design (depth 1), and PHP has no native equivalent, so its honest baseline is the `foreach`
you would otherwise write inline:

```php
if ( $Array->multidimensional ) {
   // ...
}
```

It costs 1.7x that loop on an instance you already hold, and 2.7x when the instance is
built for the question. Measured by `01-shape.Microbenchmark.php`.

## Search for a value

`__Array::search()` returns `{key, value, found}` and accepts a list of needles tried in
order — something `array_search()` cannot express at all:

```php
$Found = __Array::search($headers, ['content-type', 'Content-Type']);

if ( $Found->found ) {
   $Found->key;
   $Found->value;
}
```

Read `found` rather than `value`: `false` and `null` are themselves searchable values.

It costs about 2x a bare `array_search()`, and 1.5x one where you build the `{key, value}`
pair yourself — reach for it for the needle list and the result shape, not for speed.
Measured by `02-search.Microbenchmark.php`.

## Own the array, or alias it

The constructor takes ownership. Nothing is copied when you hand it an array — PHP arrays
are copy-on-write — but the instance and the caller drift apart on the first write:

```php
$Array = new __Array([1, 2, 3]);            // owns its own array
$Array = new __Array(explode(',', $CSV));   // literals and expressions are fine
```

`bind()` aliases instead. Writes cross in both directions, the copy-on-write separation
never happens, and mutating a large array costs no memory at all:

```php
$Array = __Array::bind($data);   // operates on $data itself

$Array->array[] = 'x';           // $data sees it
sort($Array->array);             // sorts $data
```

Only a variable can be bound — a literal or a call result is a fatal error, which is why
the constructor stays by value.

The array itself is reachable as a public property, and indexing it directly is at parity
with a native array access:

```php
$Array->array[$key];
```

A chain snapshots the array when it opens, so a chain over a binding does not observe
writes made after that point. Build the chain where you run it.

## Without the JIT

Every number above was measured with opcache and the tracing JIT on, and the chain's win
over `array_map()` and `array_filter()` is mostly the JIT's: it compiles the chain's loop,
so calling your callback from PHP becomes cheaper than calling it from C. PHP's defaults
leave both off for the CLI, which is where Bootgly runs — `opcache.enable_cli` is `0` and
the JIT is disabled. Bootgly's [Docker image](/guide/docker/overview/) turns both on;
anywhere else, set:

```ini
opcache.enable_cli=1
opcache.jit=tracing
opcache.jit_buffer_size=256M
```

The same cases on one machine (PHP 8.5.10), in the three configurations:

| Chain against its native form | opcache + JIT | opcache, no JIT | no opcache |
|---|---:|---:|---:|
| `collect()`, 1000 elements | 2.9x faster | 1.2x faster | 1.1x faster |
| `collect()`, 5 elements, chain built per call | 1.05x slower | 1.4x slower | 1.6x slower |
| `apply()`, 5 elements, chain built once | 2.5x faster | 1.2x faster | even |
| `find()`, 1000 elements, match 5% in | 43x faster | 21x faster | 19x faster |
| `find()`, 1000 elements, no match | 3.0x faster | 1.3x faster | 1.1x faster |
| `filter()->find()` against `array_find()`, 1000 elements, no match | 1.8x faster | 1.6x slower | 1.8x slower |

Without the JIT, what is left is what does not depend on it: stopping early, and not
building intermediate arrays — worth roughly 10–30% on a full pass. A chain built per call
on a small array loses outright, and `array_find()` beats a single-filter chain at every
size.

To reproduce, run a case from the framework root with the JIT disabled (or with
`-d opcache.enable_cli=0` for no opcache):

```bash
php -d opcache.jit=disable bootgly test benchmark micro Bootgly/ABI/Code/__Array/tests/benchmarks/04-chain-fusion.Microbenchmark.php --once
```

## When not to use it

- **A single native call.** `array_keys()`, `array_is_list()`, `count()` — call PHP.
  Wrapping one operation only ever adds dispatch.
- **A loop you already have.** A hand-written `foreach` is the same single pass without the
  object, so the best a chain can do is tie it — it is only more declarative. Choose `__Array`
  for how the code reads, not for speed over a loop.
- **Small arrays without the JIT.** A chain built per call loses to the native chain there;
  build it once with `__Array::pipe()`, or call PHP.
- **A single `filter` with a hit near the front.** PHP 8.4's `array_find()` wins there
  (267.1 ns against 282.5 ns at 100 elements). Past a few dozen elements the chain takes
  it back — 2x at a full miss — but only with the JIT on; without it, `array_find()` wins
  at every size.
- **Iterating.** `__Array` deliberately does not implement `ArrayAccess`, `Countable` or
  `Iterator`. Every one of them puts a userland dispatch in front of an opcode: reading
  through `ArrayAccess` costs 7.2x a native index, `count()` through `Countable` 9.8x, and
  a hand-rolled `Iterator` costs 37x a native `foreach`. Iterate `->array`.
  Measured by `06-array-interfaces.Microbenchmark.php`.

Every case named above lives in the framework repository under
`Bootgly/ABI/Code/__Array/tests/benchmarks/`, with its stored numbers in the sibling
`results/` folder. Re-run one on your own machine with:

```bash
bootgly test benchmark micro Bootgly/ABI/Code/__Array/tests/benchmarks/08-early-exit.Microbenchmark.php --processes=5
```

## Reference

```php
public function __construct (array $array)
```

Wraps an array the instance then owns. Accepts literals and expressions. Nothing is copied
at construction; the copy-on-write separation happens on the first write.

```php
public static function bind (array &$array): static
```

Wraps a variable's array by reference — the instance aliases it. Writes are visible in both
directions and no copy ever happens. Only a variable can be passed.

```php
public array $array
```

The wrapped array, public and writable on purpose. Indexing it directly is at parity with a
native array access; native functions that mutate in place (`sort()`, `shuffle()`) work on
it and copy nothing.

```php
public object $First
```

The first entry as `{key, value}`, in a single read. `{key: null, value: null}` when empty.

```php
public object $Last
```

The last entry as `{key, value}`, in a single read. `{key: null, value: null}` when empty.

```php
public bool $multidimensional
```

Whether any direct value is itself an array. Shallow — depth 1 only.

```php
public function map (callable $Op): Pipeline
```

Opens a chain, recording a transform applied to every element. Returns a
`Bootgly\ABI\Code\__Array\Pipeline`; nothing runs until a terminal is called.

```php
public function filter (callable $Op): Pipeline
```

Opens a chain, recording a test every element must pass to survive.

```php
public static function pipe (): Pipeline
```

Opens a chain with no source — a reusable program. Record the stages once, then run them
over many arrays with `apply()`.

```php
public static function search (array $haystack, mixed $needle, bool $strict = false): object
```

Searches for a value and returns `{key, value, found}`. `$needle` may be a single value or
a list of values tried in order. When nothing matches, `key` is `false` and `value` is
`null` — read `found`.

### Pipeline

```php
public function map (callable $Op): static
```

Records a transform applied to every element. Returns the same pipeline, so stages chain.

```php
public function filter (callable $Op): static
```

Records a test every element must pass to survive.

```php
public function collect (): array
```

Runs every recorded stage over the source in one pass and returns the survivors as a list.
Source keys are not carried.

```php
public function apply (array $array): array
```

Runs the recorded stages over another array. The stages are not consumed, so one pipeline
can be built once and applied per call.

```php
public function find (): mixed
```

The first survivor, or `null` when there is none. Stops at the first one.

```php
public function check (): bool
```

Whether any element survives every stage. Stops at the first survivor.

```php
public function count (): int
```

How many elements survive every stage, without materializing them.

```php
public function reduce (callable $Op, mixed $initial = null): mixed
```

Folds the survivors into a single value inside the same pass. `$Op` receives the carry and
one survivor, and returns the new carry.
