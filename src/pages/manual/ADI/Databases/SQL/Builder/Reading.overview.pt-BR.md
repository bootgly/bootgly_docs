# Lendo linhas

Comece com `$Database->table(...)`, escolha colunas e então adicione filtros e formato do
resultado.

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true)
   ->order(Orders::Asc, Columns::Name)
   ->limit(10, 5)
   ->compile();
```

PostgreSQL:

```sql
SELECT "id", "name" FROM "users" WHERE "active" = $1 ORDER BY "name" ASC LIMIT 10 OFFSET 5
```

## Select e distinct

```php
$Database->table(Tables::Users)->select(Columns::Id, Columns::Name);
$Database->table(Tables::Users)->select(); // SELECT *
$Database->table(Tables::Users)->distinct()->select(Columns::Name);
```

`select()`, `count()` e `aggregate()` adicionam projeções na ordem das chamadas:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Aggregates;

$Database
   ->table(Tables::Users)
   ->aggregate(Aggregates::Maximum, Columns::Id, Aliases::Total)
   ->select(Columns::Name);
```

Compila para:

```sql
SELECT MAX("id") AS "total", "name" FROM "users"
```

## Filtros

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Id, Operators::Between, [1, 10])
   ->filter(Columns::Name, Operators::IsNotNull);
```

Operadores:

| Case | SQL |
|------|-----|
| `Equal`, `Unequal` | `=`, `<>` |
| `Greater`, `GreaterOrEqual`, `Less`, `LessOrEqual` | comparações |
| `Between` | dois valores |
| `In` | array não vazio ou subquery |
| `IsNull`, `IsNotNull`, `IsTrue`, `IsFalse` | sem valor |

`Between` deve receber exatamente dois valores. `In` deve receber um array não vazio ou um
builder/query compilada. Filtros literais rejeitam valores.

## Busca textual

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Matches;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->match(Columns::Name, 'Ada%')
   ->match(Columns::Bio, 'database', Matches::Text);
```

`Matches::Like` é o padrão. `Matches::Insensitive` e `Matches::Text` compilam pelo dialeto
ativo.

## Joins e aliases

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Joins;

$Query = $Database
   ->table(Tables::Users)
   ->alias(Tables::Users, Aliases::U)
   ->select(Columns::UsersId)
   ->join(Tables::Profiles, Columns::UsersId, Operators::Equal, Columns::ProfilesUser, Joins::Left)
   ->alias(Tables::Profiles, Aliases::P)
   ->filter(Columns::ProfilesUser, Operators::IsNotNull)
   ->compile();
```

Aliases reescrevem referências qualificadas em `SELECT`, `JOIN`, `WHERE`, `GROUP BY` e
`ORDER BY`. Você pode registrar alias de tabela antes ou depois de `table()` / `join()`.

## Agrupamento, having e order

```php
$Database
   ->table(Tables::Users)
   ->distinct()
   ->select(Columns::Name)
   ->group(Columns::Name)
   ->having(Columns::Name, Operators::IsNotNull)
   ->order(Orders::Asc, Columns::Name);
```

Ordenação pode incluir posição de nulos:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Nulls;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->order(Orders::Asc, Columns::Name, Nulls::Last);
```

## Contagem e agregações

Conte por grupo com `Aggregates::Count` — aqui, quantos posts cada usuário escreveu:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Aggregates;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Joins;

$Query = $Database
   ->table(Tables::Users)
   ->alias(Tables::Users, Aliases::U)
   ->select(Columns::UsersId)
   ->aggregate(Aggregates::Count, Columns::PostsId, Aliases::Posts)
   ->join(Tables::Posts, Columns::PostsUser, Operators::Equal, Columns::UsersId, Joins::Left)
   ->alias(Tables::Posts, Aliases::P)
   ->group(Columns::UsersId)
   ->compile();
```

PostgreSQL:

```sql
SELECT "u"."id", COUNT("p"."id") AS "posts" FROM "users" AS "u" LEFT JOIN "posts" AS "p" ON "p"."user_id" = "u"."id" GROUP BY "u"."id"
```

Conte a coluna da junção, não as linhas. Um usuário sem posts ainda recebe uma linha do
`LEFT JOIN`, com todas as colunas de `posts` em `NULL`: `count()` compila `COUNT(*)` e
mostra esse usuário com 1 post, enquanto `COUNT("p"."id")` ignora o `NULL` e mostra 0. A
coluna agregada segue os aliases de tabela como qualquer outra referência, com o alias
registrado antes ou depois de `aggregate()`.

Para filtrar pela contagem, passe um `Expression` ao `having()`, antes do `compile()`. O texto
dele chega ao banco como foi escrito, então escreva os aliases de tabela nele:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Query = $Database
   ->table(Tables::Users)
   ->alias(Tables::Users, Aliases::U)
   ->select(Columns::UsersId)
   ->aggregate(Aggregates::Count, Columns::PostsId, Aliases::Posts)
   ->join(Tables::Posts, Columns::PostsUser, Operators::Equal, Columns::UsersId, Joins::Left)
   ->alias(Tables::Posts, Aliases::P)
   ->group(Columns::UsersId)
   ->having(new Expression('COUNT("p"."id")'), Operators::Greater, 1)
   ->compile();
```

A instrução termina em `GROUP BY "u"."id" HAVING COUNT("p"."id") > $1`.

`distinct: true` agrega cada valor distinto uma vez:

```php
$Database
   ->table(Tables::Users)
   ->aggregate(Aggregates::Count, Columns::City, Aliases::Cities, distinct: true);
```

Compila para:

```sql
SELECT COUNT(DISTINCT "city") AS "cities" FROM "users"
```

Funciona com qualquer agregação. Não é o `distinct()`, que remove linhas duplicadas do
resultado (`SELECT DISTINCT`) e nunca entra na agregação.

> Desde a 1.0.3 — antes, `Aggregates` não tinha `Count`, `aggregate()` não tinha o argumento
> `distinct`, e a coluna agregada ignorava os aliases de tabela.

## Limit, offset e locks

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Locks;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->limit(25)
   ->skip(50)
   ->lock(Locks::Update);
```

`limit($count, $offset)` define os dois valores. `skip($offset)` define só o offset. Ambos
rejeitam inteiros negativos. Locks adicionam `FOR UPDATE` ou `FOR SHARE`.

Pular sem limite se escreve de um jeito em cada dialeto, e o builder resolve isso para você.
Só a gramática do PostgreSQL aceita um `OFFSET n` sozinho; MySQL e SQLite exigem uma contagem
de linhas antes dele, então o builder fornece a que cada um lê como "sem limite" —
`18446744073709551615` no MySQL, `-1` no SQLite. As duas não são intercambiáveis: cada engine
rejeita a do outro. Escreva `skip(50)` e a mesma query roda em qualquer lugar.

## Referência

```php
select (BackedEnum|Stringable ...$Columns): static
```
Muda para modo SELECT e adiciona colunas selecionadas. Sem colunas significa `*`.

```php
distinct (): static
```
Muda para modo SELECT e emite `SELECT DISTINCT`.

```php
filter (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null): static
```
Adiciona um predicado `WHERE`. Use `->or->filter(...)` ou `->and->filter(...)` para escolher a junção do próximo predicado.

```php
match (BackedEnum|Stringable $Column, mixed $value, Matches $Match = Matches::Like): static
```
Adiciona um predicado textual. O valor deve ser string. Use `->or->match(...)` ou `->and->match(...)` para junções explícitas.

```php
join (BackedEnum|Stringable $Table, BackedEnum|Stringable $Left, Operators $Operator, BackedEnum|Stringable $Right, Joins $Join = Joins::Inner): static
```
Adiciona um join de tabela com comparação entre identificadores.

```php
alias (BackedEnum|Stringable $Identifier, BackedEnum|Stringable $Alias): static
```
Cria alias para tabela, coluna ou expressão.

```php
aggregate (Aggregates $Aggregate, BackedEnum|Stringable $Column, null|BackedEnum|Stringable $Alias = null, bool $distinct = false): static
```
Adiciona `AVG`, `COUNT`, `MAX`, `MIN` ou `SUM` sobre uma coluna. A coluna é resolvida pelos aliases de tabela na compilação. `distinct: true` compila `FUNC(DISTINCT coluna)`. Uma coluna `*` pura é recusada — `COUNT(*)` é o `count()`. Desde a 1.0.3 para `Count`, `distinct` e a resolução de aliases.

```php
count (null|BackedEnum|Stringable $Alias = null): static
```
Adiciona `COUNT(*)`, que conta linhas — inclusive a linha preenchida com `NULL` que um `LEFT JOIN` produz para um pai sem correspondência. Para contar os valores não `NULL` de uma coluna, use `aggregate(Aggregates::Count, ...)`.

```php
group (BackedEnum|Stringable ...$Columns): static
```
Adiciona colunas ao `GROUP BY`.

```php
having (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null): static
```
Adiciona um predicado `HAVING`. Use `->or->having(...)` ou `->and->having(...)` para junções explícitas.

```php
order (Orders $Order, BackedEnum|Stringable $Column, null|Nulls $Nulls = null): static
```
Adiciona uma expressão `ORDER BY`.

```php
limit (int $count, int $offset = 0): static
```
Define `LIMIT` e `OFFSET` opcional.

```php
skip (int $offset): static
```
Define `OFFSET`.

```php
lock (Locks $Lock): static
```
Adiciona um lock de linha.
