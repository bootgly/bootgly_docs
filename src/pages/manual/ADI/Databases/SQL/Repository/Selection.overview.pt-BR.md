# Seleções ORM

`Bootgly\ADI\Databases\SQL\Repository\Selection` descreve as linhas que um repositório lê:
predicados, ordem, fatia, um lock de linha, as relações a carregar e os escopos nomeados a aplicar.
O `$Repository->select()` inicia uma; cada método acrescenta a ela e a retorna, e nada roda até você
passá-la ao `fetch()` ou ao `paginate()`, que a compilam com o dialeto do repositório. Uma seleção lê
toda coluna mapeada da tabela da entidade, e só essa tabela: para projeções, joins ou agregações,
escreva a query com o **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — o
`hydrate()` também recebe o resultado de uma query que seleciona as colunas mapeadas (veja
**[Find e fetch](/manual/ADI/Databases/SQL/Repository/overview/#find-e-fetch)**).

Os exemplos usam `$Database`, a fachada SQL: na função de boot, num comando ou num script de um
projeto, `new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure())`; fora
de um projeto, `new SQL([...])` com as chaves de conexão — veja
**[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**. Numa rota `HTTP_Server_CLI`,
mapeie o repositório com `$Response->Database->map(User::class)`.

## Entidades desta página

```php
use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('users')]
class User
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';

   #[Column('email')]
   public string $mail = '';

   #[Column]
   public bool $active = true;

   #[Column(nullable: true)]
   public null|string $city = null;

   /** @var array<int,Post> */
   #[Relation(Relations::HasMany, Post::class, 'id', 'user')]
   public array $Posts = [];
}

#[Table('posts')]
class Post
{
   #[Key]
   public null|int $id = null;

   #[Column('user_id')]
   public int $user = 0;

   #[Column]
   public string $title = '';
}
```

A tabela `users` tem quatro linhas: Ada (id 1, London), Grace (2, New York), Linus (3, Helsinki,
inativo) e Alan (4, sem cidade). Ada tem dois posts e Grace um. Os attributes estão em
**[Attributes ORM](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**.

## Montar uma seleção

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Users = $Database->map(User::class);

$Selection = $Users->select()
   ->filter(new Identifier('active'), Operators::Equal, true)
   ->order(Orders::Asc, new Identifier('name'))
   ->limit(2);

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Ada', 'Alan']
```

No PostgreSQL, o `fetch()` envia:

```sql
SELECT "id", "name", "email", "active", "city" FROM "users" WHERE "active" = $1 ORDER BY "name" ASC LIMIT 2
```

O `SELECT` lista toda coluna mapeada, e os métodos que você chamou acrescentam o resto nas cláusulas
deles: `filter()` ao `WHERE`, `order()` ao `ORDER BY`, `limit()` a fatia. MySQL e SQLite recebem a
mesma instrução com as aspas e os placeholders deles. Como o repositório a executa, e o que o
`hydrate()` retorna, está em **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**.

## Nomear colunas

```php
enum Fields: string
{
   case Mail = 'mail';
   case Name = 'name';
}

$Selection = $Users->select()
   ->filter(Fields::Mail, Operators::Equal, 'grace@example.test')
   ->order(Orders::Asc, Fields::Name);
```

No PostgreSQL:

```sql
SELECT "id", "name", "email", "active", "city" FROM "users" WHERE "email" = $1 ORDER BY "name" ASC
```

Uma seleção nomeia uma coluna pela propriedade mapeada — `mail` compila para `"email"` — ou pela
própria coluna: `new Identifier('mail')` e `new Identifier('email')` leem a mesma coluna. Um nome que
não é nenhum dos dois passa sem mudança, então um erro de digitação chega ao banco: PostgreSQL e MySQL
recusam a coluna desconhecida quando a instrução roda, mas o SQLite lê como texto um nome entre aspas
que não casa com nenhuma coluna — `"mial" = 'x'` roda e não casa com nenhuma linha. Um case de enum
string-backed funciona como o valor dele, como `Fields` mostra; um int-backed faz `fetch()`,
`paginate()` e `compile()` lançarem `InvalidArgumentException`:
`ORM selection enum identifiers must be string-backed.`

## Filtrar linhas

```php
$Selection = $Users->select()
   ->filter(new Identifier('id'), Operators::Between, [1, 3])
   ->filter(new Identifier('city'), Operators::In, ['London', 'Helsinki'])
   ->order(Orders::Asc, new Identifier('id'));

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Ada', 'Linus']
```

O `filter()` recebe os operadores do `filter()` do Query Builder — `Equal`, `In`, `Between`, `IsNull`
e os outros — com os mesmos valores e verificações (veja
**[Filtros](/manual/ADI/Databases/SQL/Builder/Reading/overview/#filtros)**), e cada chamada acrescenta
um predicado ligado ao anterior com `AND`. A seleção não confere nada quando você a chama: um valor
que não serve ao operador, como um `Between` com um valor só, lança `InvalidArgumentException` a
partir do `fetch()`, quando a seleção compila.

## Combinar predicados com OR

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Junctions;

$Selection = $Users->select()
   ->filter(new Identifier('name'), Operators::Equal, 'Ada')
   ->filter(new Identifier('city'), Operators::Equal, 'Helsinki', Junctions::Or)
   ->order(Orders::Asc, new Identifier('id'));

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Ada', 'Linus']
```

No PostgreSQL:

```sql
SELECT "id", "name", "email", "active", "city" FROM "users" WHERE "name" = $1 OR "city" = $2 ORDER BY "id" ASC
```

Passe `Junctions::Or` como quarto argumento do `filter()`, ou do `match()`, para ligar aquele
predicado com `OR`. Uma seleção não tem nem o `->or` do builder nem o `nest()`: ela escreve os
predicados na ordem das chamadas, sem parênteses, e o SQL avalia `AND` antes de `OR` (veja
**[OR e AND](/manual/ADI/Databases/SQL/Builder/Reading/overview/#or-e-and)**). O primeiro predicado
não tem a que se ligar, então a junção dele é ignorada.

> [!WARNING]
> Por enquanto, os predicados que o próprio repositório acrescenta — os de um escopo nomeado, e o
> keyset de cada página por cursor — entram depois dos seus com `AND`, sem parênteses. Depois de um
> `OR` eles se ligam só ao último predicado: `A OR B` com um escopo que acrescenta `C` roda como
> `A OR (B AND C)`, então as linhas que casam com `A` escapam do escopo, e uma caminhada por cursor
> as serve de novo em toda página — quando elas enchem uma página inteira, repete essa página para
> sempre. Mantenha `Junctions::Or` fora de seleções que nomeiam escopos ou que você pagina por cursor.

## Busca textual

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Matches;

$Selection = $Users->select()
   ->match(new Identifier('mail'), 'A%', Matches::Insensitive)
   ->order(Orders::Asc, new Identifier('id'));

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Ada', 'Alan']
```

O `match()` acrescenta um predicado de texto. `Matches::Like`, o padrão, e `Matches::Insensitive`
recebem um padrão `LIKE` — `%` para qualquer sequência de caracteres, `_` para um —, e `Matches::Text`
roda a busca full-text do engine. O que cada modo encontra em cada engine, e a preparação que o
`Text` exige, estão em
**[Busca textual](/manual/ADI/Databases/SQL/Builder/Reading/overview/#busca-textual)**. O valor
precisa ser uma string: qualquer outra coisa lança `SQL text match value must be a string.` a partir
do `fetch()`.

> [!WARNING]
> Por enquanto, uma seleção escreve todo `match()` depois de todo `filter()`, seja qual for a ordem em
> que você os chama. Só com `AND` isso não muda nada; com `Junctions::Or` o `OR` muda de lugar:
> `->match(new Identifier('name'), 'A%')->filter(new Identifier('active'), Operators::Equal, false, Junctions::Or)`
> compila para `WHERE "active" = $1 AND "name" LIKE $2`. Chame `filter()` antes de `match()`, e a
> ordem compilada é a ordem em que você chamou.

## Ordenar linhas

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Nulls;

$Selection = $Users->select()
   ->order(Orders::Asc, new Identifier('city'), Nulls::Last)
   ->order(Orders::Asc, new Identifier('name'));

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Linus', 'Ada', 'Grace', 'Alan']
```

Cada `order()` acrescenta um termo de `ORDER BY`: uma direção, uma coluna e, opcionalmente, onde fica
o `NULL`. Sem `Nulls`, os engines divergem — o PostgreSQL põe `NULL` por último em ordem ascendente,
MySQL e SQLite primeiro —, então passe `Nulls::First` ou `Nulls::Last` quando a posição importa (veja
**[Agrupamento, having e order](/manual/ADI/Databases/SQL/Builder/Reading/overview/#agrupamento-having-e-order)**).
A paginação por cursor recusa `Nulls`, e recusa uma coluna de ordenação marcada `nullable` (veja
**[Ordenar uma caminhada por cursor](/manual/ADI/Databases/SQL/Repository/Pagination/overview/#ordenar-uma-caminhada-por-cursor)**).

## Fatiar linhas

```php
$Selection = $Users->select()
   ->order(Orders::Asc, new Identifier('id'))
   ->limit(2, 2);

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Linus', 'Alan']
```

O `limit($count, $offset)` define quantas linhas ler e quantas pular antes; o `skip($offset)` define
só o offset. Ordene as linhas antes de fatiá-las: sem `ORDER BY`, o engine as devolve em qualquer
ordem. Uma contagem ou um offset negativo lança
`SQL limit and offset must be non-negative integers.` a partir do `fetch()`; por enquanto, um
`skip()` negativo sem `limit()` é descartado sem erro. O `paginate()` substitui os dois pela fatia da
página que ele lê.

> [!WARNING]
> Por enquanto, `limit($count)` também zera o offset, então um `skip()` chamado antes dele se perde:
> `->skip(2)->limit(2)` lê as duas primeiras linhas, sem erro. Chame `skip()` depois de `limit()`, ou
> passe os dois em `limit(2, 2)`.

## Travar linhas

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Locks;
use Bootgly\ADI\Databases\SQL\Builder\Dialects\SQLite;

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Locked = $Transaction->map(User::class);

$Selection = $Locked->select()->filter(new Identifier('id'), Operators::Equal, 2);

if ($Locked->Dialect instanceof SQLite === false) {
   $Selection->lock(Locks::Update);
}

$Grace = $Locked->hydrate($Database->await($Locked->fetch($Selection)))->entity;
$Grace->city = 'Arlington';
$Database->await($Locked->save($Grace));

$Database->await($Transaction->commit());
```

No PostgreSQL e no MySQL a leitura termina com `FOR UPDATE`: até a transação terminar, nenhuma outra
transação consegue alterar ou travar a linha de Grace, então ninguém a altera entre a leitura e o
`UPDATE`. `Locks::Share` escreve `FOR SHARE`, que deixa outras transações também travarem a linha
para leitura. Trave dentro de uma transação, como acima — fora de uma, cada instrução faz commit
sozinha e o lock termina com ela — e ponha o trabalho num `try`, como
**[Commit ou rollback](/guide/database-transactions/overview/#commit-ou-rollback)** faz. O SQLite não
tem locks de linha e recusa a instrução com `Unable to prepare statement: near "FOR": syntax error`,
então código que também roda nele pula o `lock()`. Veja
**[Locks de linha](/manual/ADI/Databases/SQL/Builder/Reading/overview/#locks-de-linha)** e
**[Dentro de uma transação](/manual/ADI/Databases/SQL/Repository/overview/#dentro-de-uma-transação)**.

## Carregar relações

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$Selection = $Users->select()
   ->filter(new Identifier('id'), Operators::Equal, 1)
   ->load('Posts');

$Ada = $Users->hydrate($Database->await($Users->fetch($Selection)))->entity;

count($Ada->Posts); // 2
```

O `load()` nomeia relações para o `hydrate()` carregar depois da query raiz; ele não muda nada na
instrução que o `fetch()` envia. O nome da relação é o nome da propriedade, a menos que o attribute
defina `name:`, e diferencia maiúsculas de minúsculas: um nome que não é uma relação mapeada lança
`ORM relation is not mapped: …` a partir do `hydrate()`, quando vieram linhas. Este repositório tem
ponte de await, então o `hydrate()` carrega `Posts` sozinho; sem uma, a relação volta em
`$Mapped->loads` — veja
**[Carregar relações](/manual/ADI/Databases/SQL/Repository/overview/#carregar-relações)** e
**[Relações ORM](/manual/ADI/Databases/SQL/Repository/Relations/overview/)**.

## Escopos nomeados

```php
use Bootgly\ADI\Databases\SQL\Repository\Selection;

$Users->scope('active', function (Selection $Selection): void {
   $Selection->filter(new Identifier('active'), Operators::Equal, true);
});

$Selection = $Users->select()
   ->scope('active')
   ->order(Orders::Asc, new Identifier('id'));

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Ada', 'Grace', 'Alan']
```

O `scope()` nomeia um escopo que o repositório registrou com o próprio `scope()` (veja
**[Escopos nomeados](/manual/ADI/Databases/SQL/Repository/overview/#escopos-nomeados)**). O `fetch()`
e o `paginate()` rodam cada closure nomeada na seleção, na ordem em que foram nomeadas, depois dos
predicados que você acrescentou; o `compile()` e o `count()` não as rodam. Um nome que o repositório
não registrou lança `ORM scope is not registered: …` a partir do `fetch()` ou do `paginate()`, não do
`scope()`.

## Inspecionar e contar

```php
$Selection = $Users->select()->filter(new Identifier('active'), Operators::Equal, true);

$Query = $Selection->compile();
$Query->parameters; // [true]

$Database->await($Database->query($Selection->count()))->Result->cell; // 3
```

No PostgreSQL, o `$Query->SQL` e a contagem ficam:

```sql
SELECT "id", "name", "email", "active", "city" FROM "users" WHERE "active" = $1
SELECT COUNT(*) AS "total" FROM "users" WHERE "active" = $1
```

O `compile()` retorna a `Query` que o `fetch()` enviaria — o `SQL` e os `parameters` dela, no dialeto
do repositório — e não muda nada, então chame-o sempre que quiser ver a instrução. O `count()`
compila uma contagem sobre os mesmos predicados, sem a ordem, a fatia e o lock; rode-a pelo
`$Database->query()`. Nenhum dos dois roda escopos nomeados.

## Reutilizar uma seleção

```php
$Active = fn (): Selection => $Users->select()->scope('active');

$First = $Users->hydrate($Database->await($Users->fetch($Active())));
$Again = $Users->hydrate($Database->await($Users->fetch($Active())));

$Again->count; // 3
```

Uma seleção é um objeto mutável. Sem escopos nomeados, faça fetch dela quantas vezes quiser: cada
compilação recomeça do que você chamou. O `paginate()` trabalha numa cópia e deixa a sua como
estava.

Por enquanto, o `fetch()` roda os escopos nomeados na seleção que você passa, e os predicados deles
ficam nela. Fazer fetch da mesma seleção de novo os acrescenta uma segunda vez, como em
`WHERE "active" = $1 AND "active" = $2`, e um escopo que lê um valor ao rodar mantém o valor antigo
também, então o segundo fetch pode retornar as linhas erradas; uma seleção que passou por fetch antes
de você paginá-la os leva para a cópia. Monte uma seleção nova para cada fetch que nomeia escopos,
como `$Active` faz. Um listener de `Selecting` que acrescenta predicados os deixa na seleção do mesmo
jeito.

## Referência

`Bootgly\ADI\Databases\SQL\Repository\Selection`. Todo método, exceto `compile()` e `count()`,
retorna a própria seleção. Os enums — `Operators`, `Junctions`, `Matches`, `Nulls`, `Orders` e
`Locks`, em `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries` — estão listados com o SQL para o qual
cada case compila em **[Enums auxiliares](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#enums-auxiliares)**.

### Métodos

```php
__construct (Model $Model, Dialect $Dialect)
```

Inicia uma seleção vazia da entidade que `$Model` descreve, compilada com `$Dialect`. O
`$Repository->select()` monta uma com o model e o dialeto do repositório.

```php
filter (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null, Junctions $Junction = Junctions::And): static
```

Acrescenta um predicado, ligado ao anterior por `$Junction`. `$Column` é uma propriedade mapeada, uma
coluna ou um case de enum string-backed. O valor é conferido quando a seleção compila.

```php
match (BackedEnum|Stringable $Column, mixed $value, Matches $Match = Matches::Like, Junctions $Junction = Junctions::And): static
```

Acrescenta um predicado de texto no modo `$Match`. Por enquanto ele é compilado depois de todo
predicado de `filter()`.

```php
order (Orders $Order, BackedEnum|Stringable $Column, null|Nulls $Nulls = null): static
```

Acrescenta um termo de `ORDER BY`, com o `NULL` posicionado por `$Nulls` quando dado.

```php
limit (int $count, int $offset = 0): static
```

Define a contagem de linhas e o offset. Por enquanto ele sempre define o offset, então uma chamada
com um argumento zera um `skip()` anterior.

```php
skip (int $offset): static
```

Define só o offset. Sem `limit()`, o PostgreSQL escreve `OFFSET` sozinho, e MySQL e SQLite a
contagem de linhas que cada um lê como "sem limite".

```php
lock (Locks $Lock): static
```

Acrescenta `FOR UPDATE` ou `FOR SHARE` à instrução. Não é conferido contra o dialeto: o SQLite recusa
a instrução quando ela roda.

```php
load (string ...$relations): static
```

Acrescenta nomes de relação para o `hydrate()` carregar depois da query raiz. Conferidos pelo
`hydrate()`, contra as relações da entidade.

```php
scope (string $name): static
```

Acrescenta um escopo nomeado para o `fetch()` e o `paginate()` rodarem. Conferido por eles, contra os
escopos que o repositório registrou.

```php
compile (): Query
```

Compila a instrução que o `fetch()` envia, sem escopos nomeados: toda coluna mapeada da tabela da
entidade, os predicados, a ordem, a fatia e o lock. Lança `InvalidArgumentException` para um
identificador de enum int-backed e para um valor que o builder recusa.

```php
count (): Query
```

Compila `SELECT COUNT(*) AS "total"` sobre os predicados — filtros, matches e keysets — sem a ordem,
a fatia, o lock e os escopos nomeados. A paginação por página o roda para o total.

```php
seek (array $orders, array $values): static
```

Restringe a seleção às linhas estritamente depois de uma posição de keyset — o predicado que a
paginação por cursor acrescenta a cada página. `$orders` lista pares
`['column' => …, 'order' => Orders::…]` de nomes de coluna resolvidos, o desempate único por último,
e `$values` guarda um valor por par. Lança `InvalidArgumentException`
(`ORM keyset seek requires matching order columns and values.`) quando as listas estão vazias ou têm
tamanhos diferentes.

### Propriedades

```php
public private(set) Model $Model
```

A metadata compilada da entidade que a seleção lê.

```php
public private(set) Dialect $Dialect
```

O dialeto do Query Builder com que ela compila.

```php
public private(set) array $loads = []
```

Os nomes de relação acrescentados por `load()`, em ordem.

```php
public private(set) array $scopes = []
```

Os nomes de escopo acrescentados por `scope()`, em ordem.

```php
public private(set) array $orders = []
```

Os termos de `ORDER BY` acrescentados por `order()`: uma entrada
`['order' => Orders, 'column' => …, 'nulls' => null|Nulls]` cada. A paginação os lê para montar o
keyset dela.
