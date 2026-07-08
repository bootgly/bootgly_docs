# Escrevendo linhas

Mutações usam o mesmo ciclo do builder das leituras: escolha uma tabela, mude o modo,
atribua valores, adicione guards quando necessário e rode a operação.

## Inserir uma linha

```php
$Query = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Ada')
   ->set(Columns::Active, true)
   ->compile();
```

PostgreSQL:

```sql
INSERT INTO "users" ("name", "active") VALUES ($1, $2)
```

Parâmetros:

```php
['Ada', true]
```

## Inserir várias linhas

Passe vários valores para cada `set()`. Toda coluna inserida deve ter a mesma quantidade de
valores.

```php
$Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Id, 1, 2)
   ->set(Columns::Name, 'Ada', 'Bob');
```

PostgreSQL:

```sql
INSERT INTO "users" ("id", "name") VALUES ($1, $2), ($3, $4)
```

## Retornar output

```php
$Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Id, 1)
   ->set(Columns::Name, 'Ada')
   ->output(Columns::Id, Columns::Name);
```

PostgreSQL adiciona `RETURNING`:

```sql
INSERT INTO "users" ("id", "name") VALUES ($1, $2) RETURNING "id", "name"
```

MySQL e SQLite rejeitam `output()`: MySQL não tem caminho canônico de `RETURNING`, e no
SQLite a extensão `sqlite3` executaria o statement duas vezes, duplicando a escrita. Em
ambos, as chaves geradas chegam via `Result->inserted`.

## Atualizar linhas

```php
$Database
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Active, false)
   ->filter(Columns::Id, Operators::Equal, 7);
```

PostgreSQL:

```sql
UPDATE "users" SET "active" = $1 WHERE "id" = $2
```

`update()` aceita exatamente um valor por coluna atribuída. Se você definir vários valores
antes de chamar `update()`, o builder rejeita essa atribuição anterior.

## Apagar linhas

```php
$Database
   ->table(Tables::Users)
   ->delete()
   ->filter(Columns::Id, Operators::Equal, 7);
```

PostgreSQL:

```sql
DELETE FROM "users" WHERE "id" = $1
```

`update()` e `delete()` exigem pelo menos um `filter()`. Uma mutação global lança
`InvalidArgumentException`.

## Upsert

```php
$Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Id, 1, 2)
   ->set(Columns::Name, 'Ada', 'Bob')
   ->upsert(Columns::Id)
   ->output(Columns::Id, Columns::Name);
```

PostgreSQL:

```sql
INSERT INTO "users" ("id", "name") VALUES ($1, $2), ($3, $4) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name" RETURNING "id", "name"
```

Quando toda coluna atribuída também é coluna de conflito, PostgreSQL e SQLite usam
`DO NOTHING`. MySQL compila o mesmo builder para `ON DUPLICATE KEY UPDATE`.

## Valores SQL confiáveis

Use `Expression` apenas para fragmentos SQL que você controla:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Database
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Name, new Expression('LOWER("name")'))
   ->filter(Columns::Id, Operators::Equal, 1);
```

Valores passados diretamente para `set()` viram parâmetros. Valores `Expression` entram sem
binding.

## Referência

```php
insert (): static
```
Muda para modo INSERT.

```php
update (): static
```
Muda para modo UPDATE e valida que toda atribuição é singular.

```php
delete (): static
```
Muda para modo DELETE.

```php
set (BackedEnum|Stringable $Column, mixed $value, mixed ...$values): static
```
Atribui um ou mais valores a uma coluna. Múltiplos valores são apenas para INSERT multi-row.

```php
output (BackedEnum|Stringable ...$Columns): static
```
Retorna linhas de mutação via `RETURNING` quando o dialeto suporta.

```php
upsert (BackedEnum|Stringable ...$Columns): static
```
Ativa tratamento de conflito para INSERT. Exige pelo menos uma coluna de conflito.
