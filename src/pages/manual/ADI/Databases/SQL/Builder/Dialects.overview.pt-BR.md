# Dialetos de query

O builder tem uma API fluente única. O dialeto ativo controla quote de identificadores,
placeholders e alguns recursos SQL.

## Escolhendo o dialeto

`SQL::table()` e `Transaction::table()` usam o dialeto da config SQL:

```php
new SQL;                       // PostgreSQL
new SQL(['driver' => 'mysql']);
new SQL(['driver' => 'sqlite']);
```

Você também pode compilar o mesmo builder por outro dialeto:

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL;

$Query = $Builder->compile(new MySQL);
```

## Mesmo builder, SQL diferente

```php
$Builder = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Id, 1)
   ->set(Columns::Name, 'Ada')
   ->upsert(Columns::Id);
```

PostgreSQL:

```sql
INSERT INTO "users" ("id", "name") VALUES ($1, $2) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name"
```

MySQL:

```sql
INSERT INTO `users` (`id`, `name`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`)
```

SQLite:

```sql
INSERT INTO "users" ("id", "name") VALUES (?1, ?2) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name"
```

## Diferenças que importam

| Recurso | PostgreSQL | MySQL | SQLite |
|---------|------------|-------|--------|
| Quote de identificador | `"name"` | `` `name` `` | `"name"` |
| Placeholders | `$1`, `$2` | `?`, `?` | `?1`, `?2` |
| `output()` | `RETURNING` | rejeitado | `RETURNING` |
| `upsert()` | `ON CONFLICT` | `ON DUPLICATE KEY UPDATE` | `ON CONFLICT` |
| `Matches::Insensitive` | `ILIKE` | `LOWER(...) LIKE LOWER(...)` | `LIKE ... COLLATE NOCASE` |
| `Matches::Text` | `to_tsvector(...) @@ plainto_tsquery(...)` | `MATCH (...) AGAINST (...)` | `MATCH` |
| `Nulls::First/Last` | cláusula `NULLS` nativa | expressão booleana de ordenação | cláusula `NULLS` nativa |

## Capabilities

O builder usa `Capabilities` para rejeitar recursos sem suporte cedo:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Capabilities;

$Database->Dialect->check(Capabilities::Output); // false no MySQL
$Database->Dialect->check(Capabilities::Upsert); // true nos dialetos suportados
```

Chamar `output()` em um builder MySQL lança `InvalidArgumentException` antes de produzir SQL
quebrado.

## Defaults de Identifier

Chamadas diretas a `Identifier::quote()` usam PostgreSQL por padrão. Você pode configurar
esse default do processo:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL;

Identifier::configure(new MySQL);

$quoted = Identifier::quote(Columns::Name); // `name`

Identifier::configure(); // reseta para o padrão
```

Builders normais não precisam disso. Eles passam seu próprio dialeto para
`Identifier::quote()`.

## Enums auxiliares

Namespace: `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`.

| Enum | Cases |
|------|-------|
| `Aggregates` | `Average`, `Maximum`, `Minimum`, `Sum` |
| `Capabilities` | `Output`, `Upsert` |
| `Joins` | `Full`, `Inner`, `Left`, `Right` |
| `Junctions` | `And`, `Or` |
| `Locks` | `Share`, `Update` |
| `Matches` | `Insensitive`, `Like`, `Text` |
| `Modes` | `Delete`, `Insert`, `Select`, `Update` |
| `Nulls` | `First`, `Last` |
| `Operators` | `Between`, `Equal`, `Greater`, `GreaterOrEqual`, `In`, `IsFalse`, `IsNotNull`, `IsNull`, `IsTrue`, `Less`, `LessOrEqual`, `Unequal` |
| `Orders` | `Asc`, `Desc` |

`Auxiliaries::check($class)` retorna se uma classe é um dos enums auxiliares registrados do
builder.

## Executando os dialetos

Desde a v0.22.0, todo dialeto tem um wire driver nativo correspondente — o SQL que os
dialetos MySQL e SQLite geram agora executa de ponta a ponta, com o mesmo Pool, Transações
e ORM usados pelo PostgreSQL. Veja
**[Drivers SQL](/manual/ADI/Databases/SQL/Drivers/overview/)** para seleção de driver e a
matriz de capacidades.
