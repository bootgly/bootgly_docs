# __Array

`__Array` is Bootgly's array Code API. It does two things: it gives a name to the array
shapes PHP has no single call for, and it runs **chained operations in one pass** instead
of allocating an intermediate array per stage.

The second one is the reason it exists. Every measurement in this page is reproducible —
run `bootgly test benchmark micro Bootgly/ABI/Code/__Array/tests/benchmarks --processes=5`.

## The one rule

**A single operation goes to PHP. A chain goes to `__Array`.**

A wrapper around one native call can never win: its floor is that call plus the dispatch
to reach it. So there is no `__Array` equivalent of `array_keys()`, and there never will be.

A chain is the opposite. `array_values(array_filter(array_map($f, $a), $g))` pays twice —
once for each intermediate array, and once more for the per-element callback dispatch a C
array function performs. A recorded chain pays neither.

```php
use Bootgly\ABI\Code\__Array;

$Array = new __Array($rows);

// 2.8x faster than the native chain at 100 elements
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

Measured against `array_values(array_filter(array_map(...)))`:

| Elements | Native chain | `__Array` chain | |
|---|---:|---:|---|
| 5 | 439.0 ns | 401.8 ns | 1.1x faster |
| 20 | 1398.1 ns | 686.4 ns | **2.0x faster** |
| 100 | 6247.6 ns | 2247.9 ns | **2.8x faster** |
| 1000 | 61 904 ns | 18 929 ns | **3.3x faster** |

That is the same speed as writing the fused `foreach` out by hand — within 4%. The
abstraction is free; the chain is what costs.

Measured by `04-chain-fusion.Microbenchmark.php`, stored in
`results/04-chain-fusion.php-8.4.23.json`. The shape dispatch that makes it possible is
priced separately in `07-pipeline-shapes.Microbenchmark.php`.

## Find the first match, or ask whether one exists

This is the largest win in the class. The native idiom has to build the whole filtered
array before it can tell you what the first element is; a chain stops at the first
survivor and never allocates anything:

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
the `map` before handing it over. That is the middle row below.

With 1000 elements and a match 5% in:

| | Time | |
|---|---:|---|
| `array_values(array_filter(array_map(...)))[0]` | 56 897 ns | |
| `array_find(array_map(...))` (PHP 8.4, C) | 28 115 ns | 2.0x faster |
| `->map()->filter()->find()` | **1126 ns** | **51x faster** |

It wins at every hit position, including a complete miss — 3x there, because no
intermediate array is ever built. The further into the array the match sits, the smaller
the margin; the bigger the array, the larger it.

Measured by `08-early-exit.Microbenchmark.php`, stored in
`results/08-early-exit.php-8.4.23.json`. That case sweeps both sizes against three hit
positions and includes the hand-written `foreach` + `return` as a control.

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

| Elements | Native chain | Chain built per call | Chain built once + `apply()` |
|---|---:|---:|---:|
| 5 | 438.6 ns | 382.6 ns (1.1x) | **152.2 ns (2.9x)** |
| 8 | 628.8 ns | 441.2 ns (1.4x) | **205.8 ns (3.1x)** |
| 20 | 1377.2 ns | 667.8 ns (2.1x) | **434.2 ns (3.2x)** |

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
it as the pass goes.

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

Both are `{key: null, value: null}` for an empty array. They cost roughly 2.8x the native
pair, so reach for them where the pair genuinely simplifies the caller — not in a hot path.
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

## When not to use it

- **A single native call.** `array_keys()`, `array_is_list()`, `count()` — call PHP.
  Wrapping one operation only ever adds dispatch.
- **A single `filter` with a hit near the front.** PHP 8.4's `array_find()` wins there
  (267.1 ns against 282.5 ns at 100 elements). Past a few dozen elements the chain takes
  it back — 2x at a full miss.
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
