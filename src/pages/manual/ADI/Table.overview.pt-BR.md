# Dataset de tabela

O `Bootgly\ADI\Table` guarda as linhas de uma tabela — um cabeçalho, um corpo e um rodapé — e
calcula sobre as células de uma coluna do corpo com `sum()`, `subtract()`, `multiply()` e
`divide()`, ou procura um valor nela com `find()`. Ele não desenha nada: o componente
**[Table](/manual/CLI/UI/Components/Table/overview/)** do CLI renderiza um, e o seu `$Table->Data`
é um `Bootgly\ADI\Table`.

Apesar do nome, ele não é uma tabela de banco de dados: não executa SQL e mantém em memória as
linhas que você lhe dá. Tabelas de banco são criadas com o
**[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** e lidas com o
**[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**.

## Montar um dataset

```php
use Bootgly\ADI\Table;

$Table = new Table;

$Table->Header->set([
   ['Product', 'Quantity'],
]);
$Table->Body->set([
   ['Keyboard', 120],
   ['Mouse', 85],
   ['Monitor', 42],
]);
$Table->Footer->set([
   ['Total', $Table->sum(column: 1)],
]);

$Table->Footer[0]; // ['Total', 247]
```

- `Header`, `Body` e `Footer` são as três seções. Cada uma recebe uma lista de linhas pelo `set()`,
  que substitui as linhas que a seção tinha; uma seção que você nunca define fica vazia.
- Uma linha é uma lista de células, e uma coluna é a posição de uma célula na sua linha: `0` para a
  primeira célula, `1` para a segunda. Toda operação recebe essa posição como `column`. As linhas
  não precisam ter o mesmo número de células.
- As células são guardadas como foram dadas — `'25'` continua string e `25` continua inteiro — sem
  nada convertido, aparado ou verificado.
- As operações leem só o corpo. O cabeçalho e o rodapé são o que um renderizador imprime em volta
  dele, então um total é calculado a partir do corpo e depois escrito no rodapé, como acima.

Os exemplos abaixo partem deste dataset, a não ser que montem o seu próprio `Table`.

Linhas com chaves de nome, como as linhas de um **[Resultado](/manual/ADI/Database/overview/#resultado)**
SQL, não têm célula na posição `1`, então as operações não encontram nada ali. Transforme-as em
listas antes:

```php
$Keyed = new Table;

$rows = [
   ['product' => 'Keyboard', 'quantity' => 120],
   ['product' => 'Mouse', 'quantity' => 85],
];

$Keyed->Body->set($rows);
$Keyed->sum(column: 1); // 0

$Keyed->Body->set(array_map(array_values(...), $rows));
$Keyed->sum(column: 1); // 205
```

## Ler e alterar linhas

Cada seção também lê e escreve como um array de linhas:

```php
$Table->Body[] = ['Webcam', 7];  // appends row 3
$Table->Body[1] = ['Mouse', 90]; // replaces row 1
$Table->Body[1];                 // ['Mouse', 90]
$Table->Body[9];                 // null: there is no row 9
isset($Table->Body[3]);          // true
unset($Table->Body[0]);          // removes row 0

foreach ($Table->Body as $index => $row) {
   echo "{$index}: {$row[0]}\n";
}
```

```text
1: Mouse
2: Monitor
3: Webcam
```

- Ler uma linha que não existe dá `null`, sem aviso.
- O `unset()` deixa um buraco: as outras linhas mantêm as suas chaves, e o `[]` nunca reaproveita
  uma chave removida — ele acrescenta uma depois da maior chave que a seção já usou.
- As linhas em si são o array público `$Table->Body->rows`. Conte-as ali: uma seção não é contável,
  e `count($Table->Body)` lança um `TypeError`.

### Um laço por vez

Quando um laço sobre o corpo chama uma operação, percorra o array de linhas — aqui as três linhas
do dataset, definidas de novo depois das mudanças acima:

```php
$Table->Body->set([
   ['Keyboard', 120],
   ['Mouse', 85],
   ['Monitor', 42],
]);

foreach ($Table->Body->rows as $row) {
   echo $row[0], ': ', round(100 * $row[1] / $Table->sum(column: 1)), "%\n";
}
```

```text
Keyboard: 49%
Mouse: 34%
Monitor: 17%
```

Uma seção percorre as suas linhas com o ponteiro interno do seu array `rows` — o que o `current()`
e o `next()` do PHP movem —, então toda passagem por uma mesma seção compartilha uma única posição.
Um `foreach` aninhado em outro sobre a mesma seção para o de fora depois da sua primeira linha, como
acontece com qualquer `Iterator` do PHP, um `ArrayIterator` incluído. Um `foreach` sobre
`$Table->Body->rows` não usa esse ponteiro: o PHP dá a cada laço sobre um array uma posição própria.

Por enquanto, as operações percorrem o corpo por esse ponteiro também. Escrito como
`foreach ($Table->Body as $row)`, o laço acima imprime `Keyboard: 49%` e para, porque o `sum()`
deixa o ponteiro depois da última linha. Um `find()` que casa com uma linha antes da última faz
pior: ele manda o laço de volta para a linha seguinte à encontrada, toda vez, e o laço nunca
termina.

## Calcular sobre uma coluna

```php
$Table->sum(column: 1);      // 247
$Table->subtract(column: 1); // -247
$Table->multiply(column: 1); // 428400
```

- Cada uma lê aquela coluna só no corpo e pula uma célula que não é número — `'n/a'`, `''`,
  `null`, um booleano —, com uma exceção por enquanto, no `sum()`
  ([Quando o total é false](#quando-o-total-é-false)). Uma string numérica como `'10'` ou `'2.5'`
  conta como o seu número.
- O `sum()` soma as células. O `subtract()` subtrai cada célula de `0`, então devolve a soma com o
  sinal trocado, e não a primeira célula menos as outras. O `multiply()` as multiplica.
- O resultado é um `int` quando toda célula contada é um inteiro ou uma string de inteiro, e um
  `float` caso contrário.
- Quando nenhuma célula da coluna é número — um corpo vazio, uma coluna que nenhuma linha
  alcança —, o `subtract()` devolve `0` e o `multiply()` devolve `1`. O `sum()` devolve `0` para o
  corpo vazio e para a coluna que nenhuma linha alcança, e `false` para uma coluna de texto. Uma
  coluna negativa devolve `0` nas três.

### Quando o total é false

Por enquanto, o `sum()` pula uma célula que não é número só enquanto o seu total parcial está acima
de zero. Uma célula de texto que ele encontra antes disso — na primeira linha, ou enquanto as
linhas somadas até ali totalizam zero ou menos — faz ele devolver `false` e descartar o total,
então as mesmas células dão um total ou `false` conforme a ordem delas:

```php
$Stock = new Table;

$Stock->Body->set([
   ['Keyboard', 'n/a'],
   ['Mouse', 85],
]);
$Stock->sum(column: 1); // false

$Stock->Body->set([
   ['Mouse', 85],
   ['Keyboard', 'n/a'],
]);
$Stock->sum(column: 1); // 85
```

O `subtract()` e o `multiply()` pulam o texto nas duas ordens, e o `sum()` sobre uma coluna de
texto, como a dos nomes de produto acima, sempre dá `false`. Confira o resultado antes de escrevê-lo
em qualquer lugar — o renderizador do CLI imprime `false` como uma célula vazia:

```php
$total = $Table->sum(column: 1);

if ($total === false) {
   // column 1 holds a cell that is not a number
}
```

### Divisão

Por enquanto, o `divide()` não divide. Ele começa sem valor nenhum, que a aritmética do PHP lê
como `0`, e `0` dividido por qualquer coisa continua `0`:

```php
$Ratio = new Table;

$Ratio->Body->set([
   ['A', 100],
   ['B', 5],
]);
$Ratio->divide(column: 1); // 0.0, not 20.0
```

Ele devolve `0` (como `0.0` ou `-0.0`) para qualquer coluna com números, `false` quando um deles é `0` — a divisão por
zero lança, e o erro vira `false` — e `null` quando a coluna não tem número nenhum. Calcule um
quociente a partir de `$Table->Body->rows` até que ele seja corrigido.

## Procurar um valor

```php
$Table->find(column: 0, value: 'Mouse');   // true
$Table->find(column: 1, value: 85);        // true
$Table->find(column: 1, value: '85');      // false: the cell holds the integer 85
$Table->find(column: 0, value: 'Product'); // false: the header is not searched
```

O `find()` diz se uma linha do corpo tem exatamente `value` naquela coluna. Ele compara com `===`,
então o tipo também precisa bater — `85` não é `'85'` nem `85.0` —, assim como as maiúsculas e
minúsculas de uma string. Ele devolve um booleano, não a linha nem a sua chave.

## Ler todas as seções de uma vez

```php
foreach ($Table->rows as $section => $rows) {
   echo $section, ': ', count($rows), "\n";
}
```

```text
Header: 1
Body: 3
Footer: 1
```

O `$Table->rows` põe as linhas das três seções num só array, com as chaves nos nomes dos cases do
enum `Section` — `'Header'`, `'Body'` e `'Footer'` —, e não nos seus valores em minúsculas, então
`$Table->rows['body']` é uma chave indefinida. Ele é somente leitura: altere as linhas pelas
seções. O renderizador do CLI desenha a tabela a partir dele.

## Renderizar

O componente Table do CLI cria o seu dataset em `$Table->Data`. Preencha esse, ou monte um dataset
em outro lugar e entregue-o:

```php
use const Bootgly\CLI;
use Bootgly\ADI\Table as DataTable;
use Bootgly\CLI\UI\Components\Table;

$Data = new DataTable;
$Data->Header->set([['Product', 'Quantity']]);
$Data->Body->set([
   ['Keyboard', 120],
   ['Mouse', 85],
]);
$Data->Footer->set([['Total', $Data->sum(column: 1)]]);

$Table = new Table(CLI->Terminal->Output);
$Table->Data = $Data;
$Table->render();
```

```text
╔══════════╤══════════╗
║ Product  │ Quantity ║
╟──────────┼──────────╢
║ Keyboard │ 120      ║
║ Mouse    │ 85       ║
╟──────────┼──────────╢
║ Total    │ 205      ║
╚══════════╧══════════╝
```

Bordas, alinhamento, a linha separadora `['@---;']` e o resto do desenho estão na página
**[Table](/manual/CLI/UI/Components/Table/overview/)** do CLI. Para o dataset, um separador é uma
linha com uma célula.

## Referência

### Table

`Bootgly\ADI\Table`.

```php
__construct ()
```

Cria um dataset vazio: as três seções, sem linhas.

```php
public Header $Header
```

As linhas do cabeçalho, um `Bootgly\ADI\Table\Section\Header`. Nenhuma operação as lê.

```php
public Body $Body
```

As linhas do corpo, um `Bootgly\ADI\Table\Section\Body`: as linhas que toda operação lê.

```php
public Footer $Footer
```

As linhas do rodapé, um `Bootgly\ADI\Table\Section\Footer`. Nenhuma operação as lê.

```php
public array $rows { get; }
```

As linhas das três seções num só array (`array<string,array>`), com as chaves `'Header'`, `'Body'`
e `'Footer'`. Somente leitura: atribuir a ele lança `Error` com
`Property Bootgly\ADI\Table::$rows is read-only`.

```php
public null|array $columns
```

Sem uso por enquanto: o construtor o define como `null`, e nada o lê.

```php
sum (int $column): false|int|float
```

Soma as células de `$column` no corpo. Devolve `0` quando o corpo está vazio, quando nenhuma linha
alcança `$column` e quando `$column` é negativa. Por enquanto, ele pula uma célula que não é número
só enquanto o total parcial está acima de zero: uma célula de texto encontrada antes disso devolve
`false`, e uma célula `null` ou booleana encontrada ali é somada como `0`, ou `1` para `true` (veja
[Quando o total é false](#quando-o-total-é-false)).

```php
subtract (int $column): false|int|float
```

Subtrai de `0` cada célula numérica de `$column` no corpo — a soma, com o sinal trocado — e pula
as células que não são números. Devolve `0` quando nenhuma célula é número e quando `$column` é
negativa, e `false` se a aritmética lançar.

```php
multiply (int $column): int|float
```

Multiplica as células numéricas de `$column` no corpo e pula as células que não são números.
Devolve `1` quando nenhuma célula é número, `0` quando `$column` é negativa, e `0` em vez de
`false` se a aritmética lançar.

```php
divide (int $column): false|null|float
```

Deveria dividir as células numéricas de `$column` na ordem do corpo. Por enquanto, devolve `0.0` ou
`-0.0` — o sinal depende dos sinais das células — para qualquer coluna com números, `false` quando
um deles é `0`, `null` quando nenhum é número, e `0.0` quando `$column` é negativa (veja
[Divisão](#divisão)).

```php
find (int $column, mixed $value): bool
```

Devolve `true` quando uma linha do corpo tem em `$column` uma célula idêntica (`===`) a `$value`, e
`false` caso contrário. O cabeçalho e o rodapé não são pesquisados.

### Rows

`Bootgly\ADI\Table\Rows`, a base das três seções. Ela implementa `ArrayAccess` e `Iterator`, cujos
métodos abaixo sustentam a sintaxe de array e o `foreach`.

```php
public array $rows = []
```

As linhas da seção, chaves incluídas, como o `set()` ou a sintaxe de array as guardaram. Pública e
gravável.

```php
set (array $rows): void
```

Substitui todas as linhas da seção por `$rows`, mantendo as suas chaves e guardando-as como foram
dadas.

```php
offsetExists ($offset): bool
```

Sustenta `isset($Section[$offset])`: `true` quando a linha existe e não é `null`.

```php
offsetGet ($offset): mixed
```

Sustenta `$Section[$offset]`: a linha, ou `null`, sem aviso, quando ela não existe.

```php
offsetSet ($offset, $value): void
```

Sustenta `$Section[] = $row`, que acrescenta, e `$Section[$offset] = $row`, que escreve naquela
chave.

```php
offsetUnset ($offset): void
```

Sustenta `unset($Section[$offset])`. As outras linhas mantêm as suas chaves.

```php
current (): mixed
```

A linha no ponteiro interno de `$rows`, ou `false` depois da última linha.

```php
key (): mixed
```

A chave no ponteiro interno de `$rows`, ou `null` depois da última linha.

```php
next (): void
```

Move o ponteiro interno de `$rows` para a próxima linha.

```php
rewind (): void
```

Move o ponteiro interno de `$rows` de volta para a primeira linha. Todo `foreach` sobre a seção e
toda operação começam aqui, e é por isso que dois deles não conseguem percorrer uma mesma seção ao
mesmo tempo (veja [Um laço por vez](#um-laço-por-vez)).

```php
valid (): bool
```

`true` enquanto o ponteiro interno de `$rows` está sobre uma linha.

### Header, Body e Footer

`Bootgly\ADI\Table\Section\Header`, `Bootgly\ADI\Table\Section\Body` e
`Bootgly\ADI\Table\Section\Footer` estendem `Rows` e não acrescentam nada: só distinguem as três
seções.

### Section

```php
enum Section: string
{
   case Header = 'header';
   case Body = 'body';
   case Footer = 'footer';
}
```

`Bootgly\ADI\Table\Section`. O `$Table->rows` usa os nomes dos seus cases como chaves; nada lê os
valores string por enquanto.
