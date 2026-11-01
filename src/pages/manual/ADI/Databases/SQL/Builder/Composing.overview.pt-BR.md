# Compondo queries

Use esta página quando a query precisa de mais do que um `SELECT` plano: identificadores tipados e
dinâmicos, expressões confiáveis, subqueries, tabelas derivadas e CTEs.

Os exemplos usam um `$Database` aberto como em
**[O ciclo](/manual/ADI/Databases/SQL/Builder/overview/#o-ciclo)**, estes enums e uma tabela
`users` em que Ada (id `1`) está ativa e Grace (id `2`) não. O SQL mostrado é o do PostgreSQL:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;

enum Tables: string { case Users = 'users'; }
enum Columns: string
{
   case Id = 'id';
   case Name = 'name';
   case Active = 'active';
   case Created = 'created';
   case Updated = 'updated';
}
enum Aliases: string { case Current = 'current'; case U = 'u'; }
```

## Identificadores dinâmicos

Todo nome que o builder recebe — uma tabela, uma coluna, um alias, o nome de uma CTE — é um case de
enum backed por string ou um objeto `Stringable`, nunca uma `string` simples. Cases de enum são para
os nomes que sua aplicação conhece. Envolva com `Identifier` um nome que só existe em runtime, como
um lido da configuração:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Query = $Database
   ->table(new Identifier('public.users'))
   ->select(new Identifier('users.*'))
   ->compile();
```

PostgreSQL:

```sql
SELECT "users".* FROM "public"."users"
```

O dialeto divide um nome em cada ponto e faz quote de cada segmento, dobrando o caractere de aspas
dentro dele, então um nome lido em runtime não consegue escapar das aspas — e um ponto nunca pode
fazer parte de um segmento:

| Nome | PostgreSQL e SQLite | MySQL |
| --- | --- | --- |
| `Columns::Id` (valor `'id'`) | `"id"` | `` `id` `` |
| `new Identifier('users.id')` | `"users"."id"` | `` `users`.`id` `` |
| `new Identifier('users.*')` | `"users".*` | `` `users`.* `` |
| `new Identifier('*')` | `*` | `*` |
| `new Identifier('na"me')` | `"na""me"` | `` `na"me` `` |

Um segmento `*` fica sem aspas. Um case de enum também pode guardar um nome qualificado —
`case UsersId = 'users.id'` — que é a forma que os aliases de tabela reescrevem (veja
**[Lendo linhas](/manual/ADI/Databases/SQL/Builder/Reading/overview/)**).

Um nome que o builder não consegue colocar entre aspas lança uma `InvalidArgumentException`:

| Nome | Mensagem | Lançada por |
| --- | --- | --- |
| `new Identifier('')` | `SQL identifier cannot be empty.` | O construtor |
| `new Identifier('public.')`, `new Identifier('a..b')` | `SQL identifier segment cannot be empty.` | A chamada que o recebe |
| Um case de enum backed por int, ou um case backed por string cujo valor é `''` | `SQL enum identifiers must be non-empty strings.` | A chamada que o recebe |
| Um `Stringable` cuja string é `''` | `SQL object identifiers must render to non-empty strings.` | A chamada que o recebe |

Uma `string` simples nem chega até ali: a checagem de tipos do PHP a recusa com um `TypeError`.

Aspas impedem injeção, não acesso. Um nome vindo de uma requisição pode nomear qualquer tabela ou
coluna que o papel do banco consegue ler — `password_hash`, por exemplo —, então confira-o contra os
nomes que você permite antes de usá-lo: `Columns::tryFrom($input)` retorna o case de um nome
permitido e `null` para qualquer outro, então ele confere o nome e o tipa ao mesmo tempo.

Os builders fazem quote dos nomes com o próprio dialeto. Para fazer quote de um nome para um SQL
que você mesmo escreve, chame `Identifier::quote()` com o dialeto. Sem um, ele usa um padrão do
processo: PostgreSQL, até que o `Identifier::configure()` defina outro, e de novo depois de um
`configure()` sem argumento.

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL;

Identifier::quote(Columns::Name, new MySQL); // `name`
Identifier::quote(Columns::Name);            // "name"

Identifier::configure(new MySQL);
Identifier::quote(Columns::Name);            // `name`

Identifier::configure();
```

## Expressões confiáveis

`Expression` é a saída para SQL raw. O builder escreve o texto dela onde você a coloca — nunca entre
aspas, nunca vinculado, nunca reescrito para o dialeto:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Now = new Expression('NOW()');
$LowerName = new Expression('LOWER("name")');

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, $Now)
   ->alias($Now, Aliases::Current)
   ->filter($LowerName, Operators::Equal, 'ada')
   ->filter(Columns::Updated, Operators::Greater, new Expression('"created"'))
   ->compile();
```

PostgreSQL:

```sql
SELECT "id", NOW() AS "current" FROM "users" WHERE LOWER("name") = $1 AND "updated" > "created"
```

O `$Query->parameters` é `['ada']`: uma expressão não adiciona parâmetro. Uma `Expression` é
aceita:

- onde quer que vá um nome — uma coluna selecionada, a coluna de `filter()`, `having()`, `group()`,
  `order()` ou `aggregate()`, o alvo de `alias()`;
- como valor de `filter()` ou `having()`, e como cada valor de um array de `In` ou de um par de
  `Between`: o texto dela toma o lugar do placeholder, que é como você compara duas colunas, como
  acima;
- como valor de `set()`: `set(Columns::Name, new Expression('LOWER("name")'))` compila
  `"name" = LOWER("name")` (veja **[Escrevendo linhas](/manual/ADI/Databases/SQL/Builder/Writing/overview/)**).

O `match()` é a exceção: o valor dele precisa ser uma string, e uma `Expression` ali lança
`SQL text match value must be a string.`

Escreva o texto para o seu engine, já que o builder não o traduz: `NOW()` não existe no SQLite, e
o MySQL, por padrão, lê `"created"` como a string `'created'`, não como uma coluna (ele
escreve `` `created` ``). Nunca monte uma `Expression` a partir de entrada do usuário — um valor
passa por `filter()` ou `set()`, que o vinculam. Um texto vazio lança
`SQL expression cannot be empty.`

Uma `Expression` em que você aplica `alias()` é escrita como o alias dela também em `GROUP BY`,
`HAVING` e `ORDER BY`. Por enquanto isso inclui o `HAVING`, onde o PostgreSQL recusa um alias de
saída: uma expressão com alias `total` falha ali com `column "total" does not exist`. Para filtrar
por um agregado, dê o alias dele pelo `aggregate()` e passe ao `having()` uma expressão sem alias,
como em **[Lendo linhas](/manual/ADI/Databases/SQL/Builder/Reading/overview/)**.

## Filtros aninhados

Agrupar predicados entre parênteses com `nest()`, e ligar um grupo com `OR` por `->or->nest()`, faz
parte de filtrar: os dois estão em
**[OR e AND](/manual/ADI/Databases/SQL/Builder/Reading/overview/#or-e-and)**. A closure roda de novo
sempre que o `compile()` reexecuta o builder para outro dialeto, então mantenha-a sem efeitos
colaterais (veja **[Compile e execute](/manual/ADI/Databases/SQL/Builder/overview/#compile-e-execute)**).

## Subqueries em IN

O `Operators::In` aceita um builder ou uma `Query` compilada no lugar de um array de valores, em
`filter()` e em `having()`:

```php
$Subquery = $Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Name, Operators::Equal, 'Ada');

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Active, Operators::Equal, true)
   ->filter(Columns::Id, Operators::In, $Subquery)
   ->compile();
```

PostgreSQL:

```sql
SELECT "id" FROM "users" WHERE "active" = $1 AND "id" IN (SELECT "id" FROM "users" WHERE "name" = $2)
```

MySQL:

```sql
SELECT `id` FROM `users` WHERE `active` = ? AND `id` IN (SELECT `id` FROM `users` WHERE `name` = ?)
```

SQLite:

```sql
SELECT "id" FROM "users" WHERE "active" = ?1 AND "id" IN (SELECT "id" FROM "users" WHERE "name" = ?2)
```

Os parâmetros da subquery entram onde a subquery aparece, então `$Query->parameters` segue os
placeholders na ordem do texto SQL — aqui `[true, 'Ada']`. Os placeholders numerados do PostgreSQL
e do SQLite são renumerados para casar; o MySQL usa placeholders anônimos `?`.

Toda instrução embutida em outra — uma subquery em `IN`, uma [tabela derivada](#tabelas-derivadas)
ou uma [CTE](#common-table-expressions) — segue as mesmas regras:

- Um builder é compilado com o dialeto do builder externo, então passe o builder quando puder.
- Uma `Query` compilada entra como está escrita, exceto que os placeholders dela no estilo do
  dialeto externo — `$n` no PostgreSQL, `?n` no SQLite — são renumerados depois dos parâmetros
  anteriores a ela. Numere-os a partir de 1 (`$1`, `?1`), como o `compile()` faz.
- Por enquanto nada confere o dialeto de uma `Query` compilada: uma compilada por `new Builder`
  (PostgreSQL) dentro de uma instrução MySQL falha no servidor com um erro de sintaxe, então
  compile-a com o dialeto do builder externo, como o `$Database->table()` faz. A renumeração
  também reescreve texto que só parece um placeholder, como um `$1` dentro de um literal de string
  da `Query`, o que altera o literal sem aviso: vincule um valor assim como parâmetro.
- Termine um builder embutido antes de compilar ou executar a instrução externa: uma mudança feita
  depois que o builder externo compilou não alcança a memória dele (veja
  **[Compile e execute](/manual/ADI/Databases/SQL/Builder/overview/#compile-e-execute)**).

Só o `Operators::In` aceita uma subquery. Para qualquer outro operador um builder é um valor que
não serve, e ele falha como **[Filtros](/manual/ADI/Databases/SQL/Builder/Reading/overview/#filtros)**
descreve.

## Tabelas derivadas

Um builder ou uma `Query` compilada passados ao `table()` com um alias viram a fonte do `FROM`:

```php
$Source = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Query = $Database
   ->table($Source, Aliases::U)
   ->select(new Identifier('u.id'))
   ->filter(new Identifier('u.name'), Operators::Equal, 'Ada')
   ->compile();
```

PostgreSQL:

```sql
SELECT "u"."id" FROM (SELECT "id", "name" FROM "users" WHERE "active" = $1) AS "u" WHERE "u"."name" = $2
```

Refira-se às colunas da fonte pelo alias, como `new Identifier('u.id')` ou um case de enum como
`case UId = 'u.id'`. O alias é obrigatório: sem ele, o `table()` lança
`SQL derived table requires an alias.` Uma tabela derivada só vale para um `SELECT`; com
`insert()`, `update()`, `delete()` ou `upsert()`, o `compile()` lança
`SQL derived tables are only valid for SELECT.`

## Common table expressions

O `define()` adiciona uma instrução nomeada a uma cláusula `WITH` antes da principal. Ele é um
método do builder — a fachada `SQL` não tem um — então encadeie-o depois de `table()`:

```php
$Recent = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Query = $Database
   ->table(new Identifier('recent'))
   ->define(new Identifier('recent'), $Recent)
   ->select(Columns::Id)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->compile();
```

PostgreSQL:

```sql
WITH "recent" AS (SELECT "id", "name" FROM "users" WHERE "active" = $1) SELECT "id" FROM "recent" WHERE "name" = $2
```

A cláusula `WITH` é compilada primeiro onde quer que você chame `define()`, então os parâmetros da
CTE vêm primeiro: `[true, 'Ada']`. Cada `define()` adiciona uma CTE, na ordem das chamadas. Ela
aceita um builder ou uma `Query` compilada, embutidos como [Subqueries em IN](#subqueries-em-in)
descreve: numere os placeholders da própria `Query` a partir de 1, onde quer que a CTE dela fique.

Uma CTE recursiva se refere a si mesma, o que um builder não consegue expressar, então passe o corpo
dela como uma `Query` escrita para o seu engine e defina `recursive: true`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Query;

$Numbers = new Query('SELECT 1 AS n UNION ALL SELECT n + 1 FROM "numbers" WHERE n < $1', [3]);

$Query = $Database
   ->table(new Identifier('numbers'))
   ->define(new Identifier('numbers'), $Numbers, recursive: true)
   ->select(new Identifier('n'))
   ->compile();
```

PostgreSQL:

```sql
WITH RECURSIVE "numbers" AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM "numbers" WHERE n < $1) SELECT "n" FROM "numbers"
```

Ela retorna três linhas, com `n` em `1`, `2` e `3`. Uma CTE recursiva torna a cláusula inteira
`WITH RECURSIVE`. No MySQL o corpo é escrito com `?` e crases, no SQLite com `?1`.

A cláusula `WITH` vai antes da instrução em todo modo. O MySQL só a aceita antes de `SELECT`,
`UPDATE` e `DELETE`: uma CTE em um `insert()` é um erro de sintaxe ali.

Por enquanto, uma CTE que escreve — um `INSERT`, `UPDATE` ou `DELETE` dentro do `WITH`, que o
PostgreSQL permite — não torna a instrução uma escrita: um `SELECT` sobre ela continua marcado como
`reading`. Com réplicas de leitura configuradas, o `query()` a envia para uma réplica e não abre
janela de read-after-write. Rode uma instrução assim como SQL raw: o `query()` mantém no primário
um `WITH` raw que contém uma escrita.

## Referência

O `nest()` e os outros verbos de filtro estão na Referência de
**[Lendo linhas](/manual/ADI/Databases/SQL/Builder/Reading/overview/#referência)**.

### Identifier

`Bootgly\ADI\Databases\SQL\Builder\Identifier` implementa `Stringable`.

```php
__construct (string $name)
```

Envolve um nome de tabela, coluna ou alias que só existe em runtime. Lança
`InvalidArgumentException` com `SQL identifier cannot be empty.` para `''`; os segmentos são
conferidos quando o nome recebe aspas.

```php
public private(set) string $name
```

O nome como foi dado, sem aspas. O `__toString()` o retorna.

```php
static quote (BackedEnum|Stringable $Identifier, null|Dialect $Dialect = null): string
```

Coloca entre aspas um case de enum ou um `Stringable` com `$Dialect`, segmento por segmento, ou com
o padrão do processo quando `$Dialect` é `null` — PostgreSQL, a menos que o `configure()` tenha
definido outro. Os builders passam o próprio dialeto. Lança os erros de identificador listados em
[Identificadores dinâmicos](#identificadores-dinâmicos).

```php
static configure (null|Dialect $Dialect = null): void
```

Define o dialeto que o `quote()` usa quando não recebe nenhum. Sem argumento, volta o padrão para
PostgreSQL. Os builders não o leem.

### Expression

`Bootgly\ADI\Databases\SQL\Builder\Expression` implementa `Stringable`.

```php
__construct (string $sql)
```

Envolve um fragmento SQL confiável que o builder escreve como está, sem aspas nem binding. Lança
`InvalidArgumentException` com `SQL expression cannot be empty.` para `''`.

```php
public private(set) string $SQL
```

O fragmento. O `__toString()` o retorna.

### Builder

```php
table (BackedEnum|Stringable|self|Query $Table, null|BackedEnum|Stringable $Alias = null): static
```

Define a tabela, ou uma fonte `SELECT` derivada: outro builder ou uma `Query` compilada, que exige
`$Alias`. Sem ele, lança `InvalidArgumentException` com `SQL derived table requires an alias.`

```php
define (BackedEnum|Stringable $Name, self|Query $Query, bool $recursive = false): static
```

Adiciona uma CTE chamada `$Name` antes da instrução principal. Um builder é compilado com o dialeto
deste builder; uma `Query` entra como está escrita, com os placeholders renumerados (veja
[Subqueries em IN](#subqueries-em-in)). `recursive: true` em qualquer CTE emite `WITH RECURSIVE`.

### Enums desta página

Namespace `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`. Todo case de todo enum do builder, e o
SQL para o qual ele compila, está em
**[Enums auxiliares](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#enums-auxiliares)**.

| Enum | Cases usados aqui |
| --- | --- |
| `Operators` | `Between`, `Equal`, `Greater`, `In` |
