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
aggregate (Aggregates $Aggregate, BackedEnum|Stringable $Column, null|BackedEnum|Stringable $Alias = null): static
```
Adiciona `AVG`, `MAX`, `MIN` ou `SUM`.

```php
count (null|BackedEnum|Stringable $Alias = null): static
```
Adiciona `COUNT(*)`.

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
