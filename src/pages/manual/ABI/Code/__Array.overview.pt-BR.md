# __Array

`__Array` é o Code API de arrays do Bootgly. Ele faz duas coisas: dá nome às formas de
array que o PHP não resolve em uma única chamada e executa **operações encadeadas em uma
passagem só**, em vez de alocar um array intermediário por estágio.

A segunda é a razão de ele existir. Toda medição desta página é reproduzível — rode
`bootgly test benchmark micro Bootgly/ABI/Code/__Array/tests/benchmarks --processes=5`.

## A única regra

**Uma operação isolada vai para o PHP. Um encadeamento vai para o `__Array`.**

Um wrapper em cima de uma chamada nativa nunca ganha: o piso dele é essa chamada mais o
despacho para alcançá-la. Por isso não existe um equivalente `__Array` de `array_keys()`,
e nunca vai existir.

Um encadeamento é o oposto. `array_values(array_filter(array_map($f, $a), $g))` paga duas
vezes — uma por cada array intermediário e outra pelo despacho de callback por elemento que
uma função de array em C realiza. Uma cadeia gravada não paga nenhum dos dois.

```php
use Bootgly\ABI\Code\__Array;

$Array = new __Array($rows);

// 2,8x mais rápido que a cadeia nativa com 100 elementos
$Array->map($Normalize)->filter($Active)->collect();
```

## Encadear operações

`map()` e `filter()` gravam um estágio e devolvem a cadeia. Nada roda até um terminal pedir
o resultado — e aí todos os estágios rodam juntos, uma vez por elemento:

```php
$Active = static fn (array $User): bool => $User['status'] === 'active';
$Name   = static fn (array $User): string => $User['name'];

$names = (new __Array($users))
   ->filter($Active)
   ->map($Name)
   ->collect();
```

`collect()` sempre devolve uma **lista**. Os sobreviventes são anexados conforme são
encontrados, então o `array_values()` que o idioma nativo com `array_filter()` exige já
vem feito — as chaves da origem não são preservadas.

Medido contra `array_values(array_filter(array_map(...)))`:

| Elementos | Cadeia nativa | Cadeia `__Array` | |
|---|---:|---:|---|
| 5 | 439,0 ns | 401,8 ns | 1,1x mais rápido |
| 20 | 1398,1 ns | 686,4 ns | **2,0x mais rápido** |
| 100 | 6247,6 ns | 2247,9 ns | **2,8x mais rápido** |
| 1000 | 61.904 ns | 18.929 ns | **3,3x mais rápido** |

Isso é a mesma velocidade de escrever o `foreach` fundido à mão — dentro de 4%. A abstração
é de graça; o encadeamento é o que custa.

## Achar o primeiro match, ou perguntar se existe algum

Este é o maior ganho da classe. O idioma nativo precisa construir o array filtrado inteiro
antes de conseguir dizer qual é o primeiro elemento; uma cadeia para no primeiro
sobrevivente e nunca aloca nada:

```php
// O primeiro admin, ou null
$Admin = (new __Array($users))->filter($IsAdmin)->find();

// Existe algum?
if ( (new __Array($users))->filter($IsAdmin)->check() ) {
   // ...
}
```

Com 1000 elementos e um match a 5% do início:

| | Tempo | |
|---|---:|---|
| `array_values(array_filter(array_map(...)))[0]` | 57.270 ns | |
| `array_find(array_map(...))` (PHP 8.4, em C) | 29.390 ns | 1,9x mais rápido |
| `->map()->filter()->find()` | **1117 ns** | **51x mais rápido** |

Ele ganha em qualquer posição do acerto, inclusive quando não há acerto nenhum — 3x nesse
caso, porque nenhum array intermediário chega a ser construído. Quanto mais fundo o match
estiver, menor a margem; quanto maior o array, maior ela fica.

`find()` devolve `null` quando nada sobrevive. Como `null` também pode *ser* um
sobrevivente, use `check()` quando essa distinção importar — exatamente como acontece com o
`array_find()` do próprio PHP.

## Reaproveitar uma cadeia entre chamadas

Uma cadeia construída dentro da chamada paga pelo objeto e pelos estágios gravados toda
vez. Em um array grande isso some dentro do trabalho; em um array pequeno isso **é** o
trabalho.

`__Array::pipe()` abre uma cadeia sem origem. Construa uma vez — no boot, num construtor,
numa propriedade estática — e faça `apply()` por chamada:

```php
use Bootgly\ABI\Code\__Array;

// uma vez
$Headers = __Array::pipe()->map($Normalize)->filter($Allowed);

// por requisição
$Headers->apply($raw);
```

É isso que faz o API valer a pena nos arrays pequenos que um servidor realmente manipula:

| Elementos | Cadeia nativa | Cadeia por chamada | Cadeia construída uma vez + `apply()` |
|---|---:|---:|---:|
| 5 | 438,6 ns | 382,6 ns (1,1x) | **152,2 ns (2,9x)** |
| 8 | 628,8 ns | 441,2 ns (1,4x) | **205,8 ns (3,1x)** |
| 20 | 1377,2 ns | 667,8 ns (2,1x) | **434,2 ns (3,2x)** |

## Contar e reduzir

Os dois percorrem a cadeia uma vez e nunca materializam:

```php
$active = (new __Array($users))->filter($Active)->count();

$total = (new __Array($orders))
   ->map($Amount)
   ->reduce(static fn (int $carry, int $amount): int => $carry + $amount, 0);
```

Com 100 elementos, `count()` é 3,1x mais rápido que `count(array_filter(array_map(...)))` e
`reduce()` 3,4x mais rápido que `array_reduce()` sobre o mesmo array filtrado — 3,6x e 3,9x
com 1000. As formas nativas materializam dois arrays para produzir um único valor; estas
produzem esse valor conforme a passagem acontece.

## Ler as entradas de fronteira

`->First` e `->Last` entregam a entrada **e** a chave em que ela está, em uma leitura só —
nativamente isso é `array_key_first()` mais um índice:

```php
$Array = new __Array($rows);

$Array->First->key;
$Array->First->value;
$Array->Last->key;
$Array->Last->value;
```

Os dois são `{key: null, value: null}` para um array vazio. Custam por volta de 2,8x o par
nativo, então use onde o par realmente simplifica quem chama — não em hot path.

`->multidimensional` responde se algum valor direto é ele mesmo um array. É raso por
design (profundidade 1) e o PHP não tem equivalente nativo, então a linha de base honesta
dele é o `foreach` que você escreveria inline:

```php
if ( $Array->multidimensional ) {
   // ...
}
```

## Procurar um valor

`__Array::search()` devolve `{key, value, found}` e aceita uma lista de agulhas testadas em
ordem — algo que `array_search()` não consegue expressar de jeito nenhum:

```php
$Found = __Array::search($headers, ['content-type', 'Content-Type']);

if ( $Found->found ) {
   $Found->key;
   $Found->value;
}
```

Leia `found`, não `value`: `false` e `null` são, eles mesmos, valores procuráveis.

## Possuir o array, ou apenas apontar para ele

O construtor assume a posse. Nada é copiado quando você entrega um array — arrays em PHP
são copy-on-write — mas a instância e quem chamou se separam na primeira escrita:

```php
$Array = new __Array([1, 2, 3]);            // possui o próprio array
$Array = new __Array(explode(',', $CSV));   // literais e expressões funcionam
```

`bind()` cria um alias. As escritas atravessam nos dois sentidos, a separação
copy-on-write nunca acontece e mutar um array grande não custa memória nenhuma:

```php
$Array = __Array::bind($data);   // opera no próprio $data

$Array->array[] = 'x';           // $data enxerga
sort($Array->array);             // ordena $data
```

Só uma variável pode ser vinculada — um literal ou o resultado de uma chamada é erro fatal,
e é justamente por isso que o construtor continua por valor.

O array em si fica acessível como propriedade pública, e indexá-lo diretamente empata com
um acesso nativo:

```php
$Array->array[$key];
```

Uma cadeia tira um snapshot do array quando abre, então uma cadeia sobre um binding não
enxerga escritas feitas depois desse ponto. Construa a cadeia onde você a executa.

## Quando não usar

- **Uma chamada nativa isolada.** `array_keys()`, `array_is_list()`, `count()` — chame o
  PHP. Envolver uma operação só acrescenta despacho.
- **Um `filter` único com acerto perto do início.** O `array_find()` do PHP 8.4 ganha aí
  (266,6 ns contra 282,8 ns com 100 elementos). Passando de algumas dezenas de elementos a
  cadeia retoma a vantagem — 2x quando não há acerto.
- **Iterar.** O `__Array` deliberadamente não implementa `ArrayAccess`, `Countable` nem
  `Iterator`. Cada um deles coloca um despacho userland na frente de um opcode: ler via
  `ArrayAccess` custa 7,2x um índice nativo, `count()` via `Countable` custa 9,8x e um
  `Iterator` escrito à mão custa 37x um `foreach` nativo. Itere o `->array`.

## Referência

```php
public function __construct (array $array)
```

Envolve um array que a instância passa a possuir. Aceita literais e expressões. Nada é
copiado na construção; a separação copy-on-write acontece na primeira escrita.

```php
public static function bind (array &$array): static
```

Envolve o array de uma variável por referência — a instância vira um alias dela. As
escritas são visíveis nos dois sentidos e nenhuma cópia acontece. Só uma variável pode ser
passada.

```php
public array $array
```

O array envolvido, público e gravável de propósito. Indexá-lo diretamente empata com um
acesso nativo; funções nativas que mutam in-place (`sort()`, `shuffle()`) trabalham nele
sem copiar nada.

```php
public object $First
```

A primeira entrada como `{key, value}`, em uma leitura só. `{key: null, value: null}`
quando vazio.

```php
public object $Last
```

A última entrada como `{key, value}`, em uma leitura só. `{key: null, value: null}` quando
vazio.

```php
public bool $multidimensional
```

Se algum valor direto é ele mesmo um array. Raso — profundidade 1 apenas.

```php
public function map (callable $Op): Pipeline
```

Abre uma cadeia gravando uma transformação aplicada a todo elemento. Devolve um
`Bootgly\ABI\Code\__Array\Pipeline`; nada roda até um terminal ser chamado.

```php
public function filter (callable $Op): Pipeline
```

Abre uma cadeia gravando um teste que todo elemento precisa passar para sobreviver.

```php
public static function pipe (): Pipeline
```

Abre uma cadeia sem origem — um programa reutilizável. Grave os estágios uma vez e rode
sobre vários arrays com `apply()`.

```php
public static function search (array $haystack, mixed $needle, bool $strict = false): object
```

Procura um valor e devolve `{key, value, found}`. `$needle` pode ser um valor único ou uma
lista de valores testados em ordem. Quando nada casa, `key` é `false` e `value` é `null` —
leia `found`.

### Pipeline

```php
public function map (callable $Op): static
```

Grava uma transformação aplicada a todo elemento. Devolve o mesmo pipeline, então os
estágios encadeiam.

```php
public function filter (callable $Op): static
```

Grava um teste que todo elemento precisa passar para sobreviver.

```php
public function collect (): array
```

Roda todos os estágios gravados sobre a origem em uma passagem e devolve os sobreviventes
como lista. As chaves da origem não são preservadas.

```php
public function apply (array $array): array
```

Roda os estágios gravados sobre outro array. Os estágios não são consumidos, então um
pipeline pode ser construído uma vez e aplicado por chamada.

```php
public function find (): mixed
```

O primeiro sobrevivente, ou `null` quando não há nenhum. Para no primeiro.

```php
public function check (): bool
```

Se algum elemento sobrevive a todos os estágios. Para no primeiro sobrevivente.

```php
public function count (): int
```

Quantos elementos sobrevivem a todos os estágios, sem materializá-los.

```php
public function reduce (callable $Op, mixed $initial = null): mixed
```

Reduz os sobreviventes a um único valor dentro da mesma passagem. `$Op` recebe o
acumulador e um sobrevivente, e devolve o novo acumulador.
