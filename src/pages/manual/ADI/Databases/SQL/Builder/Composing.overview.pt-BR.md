# Compondo queries

Use esta página quando a query precisa de mais do que um `SELECT` plano: identificadores
dinâmicos, expressões confiáveis, predicados agrupados, subqueries, tabelas derivadas e CTEs.

## Identificadores dinâmicos

Prefira enums para nomes estáveis. Use `Identifier` quando o nome for dinâmico:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Query = $Database
   ->table(new Identifier('public.users'))
   ->select(new Identifier('id'))
   ->compile();
```

PostgreSQL:

```sql
SELECT "id" FROM "public"."users"
```

Nomes pontilhados recebem quote segmento por segmento. Segmentos vazios são rejeitados.

## Expressões confiáveis

`Expression` é a saída para SQL cru:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Now = new Expression('NOW()');
$LowerName = new Expression('LOWER("name")');

$Database
   ->table(Tables::Users)
   ->select($Now)
   ->alias($Now, Aliases::Current)
   ->filter($LowerName, Operators::Equal, 'ada');
```

PostgreSQL:

```sql
SELECT NOW() AS "current" FROM "users" WHERE LOWER("name") = $1
```

`Expression` não carrega bindings. Mantenha valores de usuário em `filter()` e `set()`.

## Filtros aninhados

```php
use Bootgly\ADI\Databases\SQL\Builder;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Junctions;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->nest(function (Builder $Group): void {
      $Group
         ->filter(Columns::Active, Operators::IsTrue)
         ->filter(Columns::Name, Operators::Equal, 'Ada', Junctions::Or);
   })
   ->filter(Columns::Id, Operators::Greater, 10);
```

PostgreSQL:

```sql
SELECT "id" FROM "users" WHERE ("active" IS TRUE OR "name" = $1) AND "id" > $2
```

`nest()` se aplica a filtros `WHERE`. O grupo deve adicionar pelo menos um `filter()`.

## Subqueries em IN

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

Parâmetros da subquery são mesclados depois dos parâmetros externos. Placeholders numerados
de PostgreSQL e SQLite são rebased automaticamente; MySQL usa placeholders anônimos `?`.

## Tabelas derivadas

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

Fontes derivadas exigem alias e só são válidas para SELECT.

## Common table expressions

```php
$Recent = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Query = $Database
   ->define(new Identifier('recent'), $Recent)
   ->table(new Identifier('recent'))
   ->select(Columns::Id)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->compile();
```

PostgreSQL:

```sql
WITH "recent" AS (SELECT "id", "name" FROM "users" WHERE "active" = $1) SELECT "id" FROM "recent" WHERE "name" = $2
```

Passe `recursive: true` para emitir `WITH RECURSIVE`.

## Referência

```php
new Identifier(string $name)
```
Envolve um nome de tabela ou coluna em runtime para o dialeto fazer quote.

```php
new Expression(string $sql)
```
Envolve SQL cru confiável para o builder não aplicar quote nem binding.

```php
nest (Closure $Group, Junctions $Junction = Junctions::And): static
```
Adiciona um escopo agrupado de predicados `WHERE`.

```php
define (BackedEnum|Stringable $Name, Builder|Query $Query, bool $recursive = false): static
```
Adiciona uma CTE antes da instrução principal.

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): static
```
Define uma tabela base ou fonte SELECT derivada. Fontes derivadas exigem alias.
