# __Array

`__Array` é o Code API de arrays do Bootgly. Ele faz duas coisas: dá nome às formas de
array que o PHP não resolve em uma única chamada e executa **operações encadeadas em uma
passagem só**, em vez de alocar um array intermediário por estágio.

A segunda é a razão de ele existir. Toda tabela desta página vem dos microbenchmarks do
framework — rode `bootgly test benchmark micro Bootgly/ABI/Code/__Array/tests/benchmarks --processes=5`
para reproduzi-las. Elas foram medidas no PHP 8.4.23 com opcache e o JIT tracing ligados, e
a maior parte do ganho da cadeia depende do JIT: leia [Sem o JIT](#sem-o-jit) antes de
contar com ele.

## A única regra

**Uma operação isolada vai para o PHP. Um encadeamento vai para o `__Array` — ou para um
`foreach` escrito por você.**

Um wrapper em cima de uma chamada nativa nunca ganha: o mínimo que ele custa é essa chamada mais o
despacho para chegar até ela. Por isso não existe um equivalente `__Array` de `array_keys()`,
e nunca vai existir.

Um encadeamento é o oposto. `array_values(array_filter(array_map($f, $a), $g))` paga duas
vezes. O custo maior é o do callback: `array_map()` e `array_filter()` o chamam a partir do
C, pelo caminho genérico de chamada da engine, uma vez por elemento — duas a três vezes o
que a mesma chamada custa a partir de um loop PHP compilado pelo JIT. O menor é o array
intermediário que cada estágio aloca. Uma cadeia gravada roda um único loop PHP, então não
paga nenhum dos dois.

Um `foreach` escrito à mão também não paga nenhum dos dois, e é ainda mais rápido — é o
mesmo loop sem um objeto na frente. O que o `__Array` acrescenta é que o loop continua se
lendo como a cadeia que ele substitui.

```php
use Bootgly\ABI\Code\__Array;

$Array = new __Array($rows);

// uma passagem, um array — sem intermediários
$Array->map($Normalize)->filter($Active)->collect();
```

## Encadear operações

`map()` e `filter()` gravam um estágio e devolvem a cadeia. Nada roda até um terminal pedir
o resultado — e aí todos os estágios rodam juntos, uma vez por elemento:

```php
$Active = static fn (array $User): bool => $User['status'] === 'active';
$Name   = static fn (array $User): string => $User['name'];

// Nativo — um array intermediário por estágio, mais um terceiro para reindexar
$names = array_values(
   array_map($Name, array_filter($users, $Active))
);

// __Array — uma passagem, um array
$names = new __Array($users)->filter($Active)->map($Name)->collect();
```

`collect()` sempre devolve uma **lista**. Os sobreviventes são anexados conforme são
encontrados, então o `array_values()` que a forma nativa com `array_filter()` exige já
vem feito — as chaves da origem não são preservadas.

Medido contra `array_values(array_filter(array_map(...)))`, com o mesmo trabalho escrito
como um `foreach` para controle:

| Elementos | Cadeia nativa | Cadeia construída por chamada | `foreach` escrito à mão |
|---|---:|---:|---:|
| 5 | 439,0 ns | 401,8 ns (1,1x mais rápido) | 120,9 ns (3,6x mais rápido) |
| 20 | 1398,1 ns | 686,4 ns (**2,0x mais rápido**) | 390,4 ns (3,6x mais rápido) |
| 100 | 6247,6 ns | 2247,9 ns (**2,8x mais rápido**) | 1871,4 ns (3,3x mais rápido) |
| 1000 | 61.904 ns | 18.929 ns (**3,3x mais rápido**) | 17.828 ns (3,5x mais rápido) |

Leia a última coluna antes da do meio: o ganho é da passagem única, não do `__Array`. O
loop escrito à mão é mais rápido em todos os tamanhos — 6% com 1000 elementos e 3,3x com 5,
onde abrir a cadeia (um objeto mais os estágios gravados) custa mais que o próprio
trabalho. Em arrays pequenos, construa a cadeia uma vez e reaproveite —
veja [Reaproveitar uma cadeia entre chamadas](#reaproveitar-uma-cadeia-entre-chamadas).

A tabela mede a cadeia aberta como `new Pipeline($array)`. Abri-la por
`new __Array($rows)` constrói mais um objeto antes — cerca de 80 ns a mais por chamada,
medido no PHP 8.5.10. Isso é ruído com 100 elementos, mas com 5 basta para ficar atrás da
cadeia nativa.

Medido por `04-chain-fusion.Microbenchmark.php`, armazenado em
`results/04-chain-fusion.php-8.4.23.json`. O despacho por forma que torna isso possível é
medido à parte em `07-pipeline-shapes.Microbenchmark.php`.

## Achar o primeiro match, ou perguntar se existe algum

É daqui que vem o maior número desta página — e ele vem de parar cedo, o que qualquer loop
consegue fazer. A forma nativa precisa construir o array filtrado inteiro antes de
conseguir dizer qual é o primeiro elemento; uma cadeia para no primeiro sobrevivente e
nunca constrói um array:

```php
// Nativo — o array filtrado inteiro é construído antes de qualquer uma das perguntas
$Admins = array_values(array_filter($users, $IsAdmin));

$Admin = $Admins[0] ?? null;   // o primeiro admin, ou null

if ($Admins !== []) {          // existe algum?
   // ...
}

// __Array — para no primeiro sobrevivente e não constrói nada
$Admin = new __Array($users)->filter($IsAdmin)->find();

if ( new __Array($users)->filter($IsAdmin)->check() ) {
   // ...
}
```

O `array_find()` do PHP 8.4 também para antes do fim, então ele é a mais justa das duas
formas nativas — só que ele só consegue procurar em um array que já existe, então uma
cadeia ainda precisa materializar o `map` antes de entregar. É a segunda linha da tabela
abaixo.

Com 1000 elementos e um match a 5% do início:

| | Tempo | |
|---|---:|---|
| `array_values(array_filter(array_map(...)))[0]` | 56.897 ns | |
| `array_find(array_map(...))` (PHP 8.4, em C) | 28.115 ns | 2,0x mais rápido |
| `->map()->filter()->find()` | **1126 ns** | **51x mais rápido** |
| `foreach` + `return` escrito à mão | 829 ns | 69x mais rápido |

O 51x não é a cadeia sendo rápida; é a forma nativa sendo perdulária. Ela mapeia os 1000
elementos e filtra todos eles para ler um, enquanto qualquer loop que para cedo percorre
51 — e o escrito à mão os percorre mais rápido ainda, porque não constrói cadeia nenhuma.
Contra a forma nativa mais justa, `array_find(array_map())`, a cadeia é 25x mais rápida.

Quando nada casa, nada consegue parar cedo, e a cadeia ainda é cerca de 3x mais rápida.
Essa parte é o mesmo ganho de despacho de callback do `collect()`, e depende do JIT do
mesmo jeito. Quanto mais fundo o match estiver, menor a margem; quanto maior o array, maior
ela fica.

Medido por `08-early-exit.Microbenchmark.php`, armazenado em
`results/08-early-exit.php-8.4.23.json`. Esse caso varre os dois tamanhos contra três
posições de acerto.

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

É isso que faz a API valer a pena nos arrays pequenos que um servidor realmente manipula:

| Elementos | Cadeia nativa | Cadeia por chamada | Cadeia construída uma vez + `apply()` | `foreach` escrito à mão |
|---|---:|---:|---:|---:|
| 5 | 438,6 ns | 382,6 ns (1,1x) | **152,2 ns (2,9x)** | 132,5 ns (3,3x) |
| 8 | 628,8 ns | 441,2 ns (1,4x) | **205,8 ns (3,1x)** | 184,2 ns (3,4x) |
| 20 | 1377,2 ns | 667,8 ns (2,1x) | **434,2 ns (3,2x)** | 405,4 ns (3,4x) |

Construída uma vez, a cadeia fica a menos de 15% do loop escrito à mão com 5 elementos e a
menos de 7% com 20.

Medido por `09-pipeline-reuse.Microbenchmark.php`, armazenado em
`results/09-pipeline-reuse.php-8.4.23.json`.

## Contar e reduzir

Os dois percorrem a cadeia uma vez e nunca materializam nada:

```php
$active = new __Array($users)->filter($Active)->count();

$total = new __Array($orders)
   ->map($Amount)
   ->reduce(static fn (int $carry, int $amount): int => $carry + $amount, 0);
```

Com 100 elementos, `count()` é 3,1x mais rápido que `count(array_filter(array_map(...)))` e
`reduce()` 3,4x mais rápido que `array_reduce()` sobre o mesmo array filtrado — 3,6x e 3,9x
com 1000. As formas nativas materializam dois arrays para produzir um único valor; estas
produzem esse valor conforme a passagem acontece. Uma redução escrita à mão acompanha — a
menos de 7% de 100 elementos para cima — e é 1,6x mais rápida com 20, onde abrir a cadeia
domina.

Medido por `10-terminals.Microbenchmark.php`, armazenado em
`results/10-terminals.php-8.4.23.json`.

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

Os dois são `{key: null, value: null}` para um array vazio. Custam cerca de 3x o par
nativo — 3,5x quando a instância é construída só para a leitura —, então use onde o par
realmente simplifica quem chama, não em hot path.
Medido por `00-boundary.Microbenchmark.php`; o custo de cada forma possível de wrapper está
detalhado em `03-wrapper-forms.Microbenchmark.php`.

`->multidimensional` responde se algum valor direto é ele mesmo um array. É raso por
design (profundidade 1) e o PHP não tem equivalente nativo, então a linha de base honesta
dele é o `foreach` que você escreveria inline:

```php
if ( $Array->multidimensional ) {
   // ...
}
```

Ele custa 1,7x esse loop numa instância que você já tem, e 2,7x quando a instância é
construída só para a pergunta. Medido por `01-shape.Microbenchmark.php`.

## Procurar um valor

`__Array::search()` devolve `{key, value, found}` e aceita uma lista de valores testados em
ordem — algo que `array_search()` não consegue expressar de jeito nenhum:

```php
$Found = __Array::search($headers, ['content-type', 'Content-Type']);

if ( $Found->found ) {
   $Found->key;
   $Found->value;
}
```

Leia `found`, não `value`: `false` e `null` também são valores que dá para procurar.

Ele custa cerca de 2x um `array_search()` puro, e 1,5x um em que você mesmo monta o par
`{key, value}` — use pela lista de valores e pelo formato do resultado, não pela
velocidade. Medido por `02-search.Microbenchmark.php`.

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

## Sem o JIT

Todo número acima foi medido com opcache e o JIT tracing ligados, e o ganho da cadeia sobre
`array_map()` e `array_filter()` é quase todo do JIT: ele compila o loop da cadeia, e
chamar o seu callback a partir do PHP passa a custar menos que chamá-lo a partir do C. Os
padrões do PHP deixam os dois desligados no CLI, que é onde o Bootgly roda —
`opcache.enable_cli` é `0` e o JIT vem desativado. A [imagem Docker](/guide/docker/overview/)
do Bootgly liga os dois; em qualquer outro lugar, configure:

```ini
opcache.enable_cli=1
opcache.jit=tracing
opcache.jit_buffer_size=256M
```

Os mesmos casos numa mesma máquina (PHP 8.5.10), nas três configurações:

| Cadeia contra a sua forma nativa | opcache + JIT | opcache, sem JIT | sem opcache |
|---|---:|---:|---:|
| `collect()`, 1000 elementos | 2,9x mais rápida | 1,2x mais rápida | 1,1x mais rápida |
| `collect()`, 5 elementos, cadeia construída por chamada | 1,05x mais lenta | 1,4x mais lenta | 1,6x mais lenta |
| `apply()`, 5 elementos, cadeia construída uma vez | 2,5x mais rápida | 1,2x mais rápida | empate |
| `find()`, 1000 elementos, match a 5% do início | 43x mais rápida | 21x mais rápida | 19x mais rápida |
| `find()`, 1000 elementos, sem match | 3,0x mais rápida | 1,3x mais rápida | 1,1x mais rápida |
| `filter()->find()` contra `array_find()`, 1000 elementos, sem match | 1,8x mais rápida | 1,6x mais lenta | 1,8x mais lenta |

Sem o JIT, sobra o que não depende dele: parar cedo e não construir arrays intermediários —
algo em torno de 10–30% numa passagem completa. Uma cadeia construída por chamada num array
pequeno perde de vez, e o `array_find()` ganha de uma cadeia de `filter` único em qualquer
tamanho.

Para reproduzir, rode um caso a partir da raiz do framework com o JIT desativado (ou com
`-d opcache.enable_cli=0` para ficar sem opcache):

```bash
php -d opcache.jit=disable bootgly test benchmark micro Bootgly/ABI/Code/__Array/tests/benchmarks/04-chain-fusion.Microbenchmark.php --once
```

## Quando não usar

- **Uma chamada nativa isolada.** `array_keys()`, `array_is_list()`, `count()` — chame o
  PHP. Embrulhar uma operação isolada só acrescenta despacho.
- **Um loop que você já tem.** Um `foreach` escrito à mão é a mesma passagem única sem o
  objeto, então o máximo que uma cadeia consegue é empatar com ele — ela só é mais
  declarativa. Escolha o `__Array` pela leitura do código, não por velocidade sobre um loop.
- **Arrays pequenos sem o JIT.** Uma cadeia construída por chamada perde para a cadeia
  nativa aí; construa uma vez com `__Array::pipe()`, ou chame o PHP.
- **Um `filter` único com acerto perto do início.** O `array_find()` do PHP 8.4 ganha aí
  (267,1 ns contra 282,5 ns com 100 elementos). Passando de algumas dezenas de elementos a
  cadeia retoma a vantagem — 2x quando não há acerto —, mas só com o JIT ligado; sem ele, o
  `array_find()` ganha em qualquer tamanho.
- **Iterar.** O `__Array` deliberadamente não implementa `ArrayAccess`, `Countable` nem
  `Iterator`. Cada um deles coloca um despacho userland na frente de um opcode: ler via
  `ArrayAccess` custa 7,2x um índice nativo, `count()` via `Countable` custa 9,8x e um
  `Iterator` escrito à mão custa 37x um `foreach` nativo. Itere o `->array`.
  Medido por `06-array-interfaces.Microbenchmark.php`.

Todos os casos citados acima ficam no repositório do framework, em
`Bootgly/ABI/Code/__Array/tests/benchmarks/`, com os números armazenados na pasta irmã
`results/`. Para rodar um deles na sua máquina:

```bash
bootgly test benchmark micro Bootgly/ABI/Code/__Array/tests/benchmarks/08-early-exit.Microbenchmark.php --processes=5
```

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

Diz se algum valor direto é, ele mesmo, um array. Raso — só profundidade 1.

```php
public function map (callable $Op): Pipeline
```

Abre uma cadeia gravando uma transformação aplicada a todo elemento. Devolve um
`Bootgly\ABI\Code\__Array\Pipeline`; nada roda até um terminal ser chamado.

```php
public function filter (callable $Op): Pipeline
```

Abre uma cadeia gravando um teste pelo qual todo elemento precisa passar para sobreviver.

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
estágios se encadeiam.

```php
public function filter (callable $Op): static
```

Grava um teste pelo qual todo elemento precisa passar para sobreviver.

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

O primeiro sobrevivente, ou `null` quando não há nenhum. Para assim que o encontra.

```php
public function check (): bool
```

Diz se algum elemento sobrevive a todos os estágios. Para no primeiro sobrevivente.

```php
public function count (): int
```

Quantos elementos sobrevivem a todos os estágios, sem materializá-los.

```php
public function reduce (callable $Op, mixed $initial = null): mixed
```

Reduz os sobreviventes a um único valor dentro da mesma passagem. `$Op` recebe o
acumulador e um sobrevivente, e devolve o novo acumulador.
