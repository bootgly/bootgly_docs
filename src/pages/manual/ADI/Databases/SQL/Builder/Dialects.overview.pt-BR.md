# Dialetos de query

O builder tem uma API fluente única. O dialeto ativo controla quote de identificadores,
placeholders e alguns recursos SQL.

## Escolhendo o dialeto

A fachada pega o dialeto da chave de config `driver` — a chave que também escolhe o wire driver:
`pgsql` (o padrão), `mysql` ou `sqlite`; em um projeto, quem a define é `DB_CONNECTION` (veja
**[Escolher um driver](/guide/database-dbal/overview/#escolher-um-driver)**). Todo builder que a
fachada inicia compila com esse dialeto (veja
**[Pontos de entrada](/manual/ADI/Databases/SQL/Builder/overview/#pontos-de-entrada)**):

```php
use Bootgly\ADI\Databases\SQL;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Bio = 'bio'; }

$Database = new SQL([
   'driver' => 'mysql',
   'host' => '127.0.0.1',
   'port' => 3306,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
]);

$Database->Dialect::class; // Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL
```

Montar a fachada não abre conexão, então isto roda sem servidor. Os exemplos abaixo continuam este
script: usam estes enums, este `$Database` e os imports dos blocos anteriores. Fora de um builder,
o `Identifier::quote()` faz quote por um dialeto
padrão do processo — veja
**[Identificadores dinâmicos](/manual/ADI/Databases/SQL/Builder/Composing/overview/#identificadores-dinâmicos)**.

## Mesmo builder, SQL diferente

`compile($Dialect)` compila um builder para outro dialeto. Como ele reexecuta as chamadas do
builder, e guarda um resultado por classe de dialeto, está em
**[Compile e execute](/manual/ADI/Databases/SQL/Builder/overview/#compile-e-execute)**; como uma
`Query` compilada embutida em uma instrução é escrita, em
**[Subqueries em IN](/manual/ADI/Databases/SQL/Builder/Composing/overview/#subqueries-em-in)**. Aqui
um upsert compila para os três:

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL;
use Bootgly\ADI\Databases\SQL\Builder\Dialects\PostgreSQL;
use Bootgly\ADI\Databases\SQL\Builder\Dialects\SQLite;

$Builder = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Id, 1)
   ->set(Columns::Name, 'Ada')
   ->upsert(Columns::Id);

$Builder->compile(new PostgreSQL);
$Builder->compile(new MySQL);
$Builder->compile(new SQLite);
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

Os parâmetros são `[1, 'Ada']` nos três. Como cada engine trata as colunas de conflito está em
**[Escrevendo linhas](/manual/ADI/Databases/SQL/Builder/Writing/overview/#upsert)**.

## Diferenças que importam

| Recurso | PostgreSQL | MySQL | SQLite |
|---------|------------|-------|--------|
| [Quote de identificador](/manual/ADI/Databases/SQL/Builder/Composing/overview/#identificadores-dinâmicos) | `"name"` | `` `name` `` | `"name"` |
| Placeholders | `$1`, `$2` | `?`, `?` | `?1`, `?2` |
| [`output()`](/manual/ADI/Databases/SQL/Builder/Writing/overview/#retornar-output) | `RETURNING` | rejeitado | rejeitado (a extensão `sqlite3` executaria 2 vezes) |
| [`upsert()`](/manual/ADI/Databases/SQL/Builder/Writing/overview/#upsert) | `ON CONFLICT` | `ON DUPLICATE KEY UPDATE` | `ON CONFLICT` |
| [`skip()` sem `limit()`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#limit-e-offset) | `OFFSET n` | `LIMIT 18446744073709551615 OFFSET n` | `LIMIT -1 OFFSET n` |
| [`lock()`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#locks-de-linha) | `FOR UPDATE`, `FOR SHARE` | `FOR UPDATE`, `FOR SHARE` | emitido, depois recusado pelo SQLite |
| [`Joins::Full`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#joins) | `FULL JOIN` | sem suporte | `FULL JOIN` |
| [`Matches::Like`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#busca-textual) | `LIKE`, sensível a maiúsculas | `LIKE`, pela collation | `LIKE`, insensível a maiúsculas em ASCII |
| [`Matches::Insensitive`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#busca-textual) | `ILIKE` | `LOWER(...) LIKE LOWER(...)` | `LIKE ... COLLATE NOCASE` |
| [`Matches::Text`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#busca-textual) | `to_tsvector(...) @@ plainto_tsquery(...)` | `MATCH (...) AGAINST (...)` | `MATCH` |
| [`Nulls::First/Last`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#agrupamento-having-e-order) | cláusula `NULLS` nativa | expressão booleana de ordenação | cláusula `NULLS` nativa |

Um recurso com link pode falhar em tempo de execução, ou responder diferente, em alguma engine; o
link leva à página que o explica engine por engine.

## Capabilities

O builder usa `Capabilities` para rejeitar recursos sem suporte cedo:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Capabilities;

$Builder = $Database->table(Tables::Users);

$Builder->Dialect->check(Capabilities::Output); // false on MySQL and SQLite
$Builder->Dialect->check(Capabilities::Upsert); // true on the three
```

Chamar `output()` em um builder MySQL ou SQLite lança `InvalidArgumentException` com
`SQL dialect does not support RETURNING output.` antes de produzir SQL quebrado — na chamada, ou
dentro de `compile($Dialect)` quando um builder que usou `output()` é reexecutado em um deles.

Nenhuma capability cobre `lock()`, `Joins::Full` ou `Matches::Text`: decida pela classe de
`$Builder->Dialect`, o dialeto com que um builder compila, como
**[Locks de linha](/manual/ADI/Databases/SQL/Builder/Reading/overview/#locks-de-linha)** faz para o
SQLite.

## Registro de dialetos

`Bootgly\ADI\Databases\SQL\Builder\Dialects` mapeia um nome de driver para um dialeto. A fachada
cria um quando é construída e busca nele o seu `driver`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects;

$Dialects = new Dialects;

$Dialects->fetch()::class;                       // Bootgly\ADI\Databases\SQL\Builder\Dialects\PostgreSQL
$Dialects->fetch('mysqli') === $Dialects->MySQL; // true
$Dialects->fetch('sqlite3')::class;              // Bootgly\ADI\Databases\SQL\Builder\Dialects\SQLite
```

| Nomes | Dialeto |
|-------|---------|
| `pgsql` (o padrão), `postgres`, `postgresql` | `PostgreSQL` |
| `mysql`, `mysqli` | `MySQL` |
| `sqlite`, `sqlite3` | `SQLite` |

- Os nomes casam exatamente, em minúsculas. Qualquer outro — `mariadb`, `PGSQL` — lança
  `InvalidArgumentException` com `SQL builder dialect is not registered: mariadb`, que é o que
  `new SQL()` lança para um `driver` assim.
- O registro aceita mais nomes do que a fachada roda: só `pgsql`, `mysql` e `sqlite` também nomeiam
  um wire driver (veja **[Nomes de driver](/manual/ADI/Database/Config/overview/#nomes-de-driver)**).
- Cada registro guarda uma instância por dialeto, então `fetch()` retorna o mesmo objeto toda vez.
- Ele não tem como receber um dialeto novo: um dialeto próprio vai direto para o builder.

## Escrevendo um dialeto próprio

Um dialeto é uma subclasse de `Bootgly\ADI\Databases\SQL\Builder\Dialect`. Estenda um dos que vêm
com o framework e sobrescreva o que muda — aqui, busca textual pela configuração `english` do
PostgreSQL, que reduz palavras ao radical:

```php
use Bootgly\ADI\Databases\SQL\Builder;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Matches;

class English extends PostgreSQL
{
   public function match (string $column, string $placeholder, Matches $Match): string
   {
      if ($Match === Matches::Text) {
         return "to_tsvector('english', {$column}) @@ plainto_tsquery('english', {$placeholder})";
      }

      return parent::match($column, $placeholder, $Match);
   }
}

$Search = (new Builder(new English))
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->match(Columns::Bio, 'database', Matches::Text);

$Search->compile()->SQL; // SELECT "id" FROM "users" WHERE to_tsvector('english', "bio") @@ plainto_tsquery('english', $1)
```

Rode-o com `query()` em uma fachada PostgreSQL: com as bios `Databases and engines` e
`A database pioneer`, ele encontra as duas linhas, onde o dialeto que vem com o framework encontra
só a segunda.

- **Injete-o** — `new Builder($Dialect)` monta com o dialeto desde o início, e
  `$Builder->compile($Dialect)` reexecuta um builder existente por ele. `SQL::table()` e
  `Transaction::table()` mantêm o dialeto da fachada, já que o registro não recebe um novo.
- **Os hooks** — `Dialect` declara oito métodos abstratos — `quote()`, `mark()`, `rebase()`,
  `order()`, `slice()`, `upsert()`, `match()` e `output()` — mais `check()`, que informa toda
  capability como suportada até você sobrescrevê-lo. Um `false` para `Capabilities::Output` ou
  `Capabilities::Upsert` faz `output()` ou `upsert()` lançar. Os helpers protegidos `segment()` e
  `resolve()` fazem o quote de um nome com pontos e montam uma cláusula `ON CONFLICT`. Cada um está
  na [Referência](#referência).
- **Mantenha-o sem estado** — `compile($Dialect)` guarda o resultado por classe de dialeto, e um
  builder cujo dialeto tem a mesma classe compila com a própria instância. Duas instâncias de uma
  classe com configurações diferentes compilam igual: dê a cada variante uma classe própria.

## Executando os dialetos

Todo dialeto tem um wire driver nativo correspondente, então o SQL que um dialeto gera executa de
ponta a ponta, com o mesmo Pool, transações e ORM nas três engines. Veja
**[Drivers SQL](/manual/ADI/Databases/SQL/Drivers/overview/)** para seleção de driver e a matriz de
capacidades, e **[Mapeamento de tipos](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** para como cada
driver vincula os valores que você passa e decodifica o que volta.

## Referência

A propriedade `$Dialect` do builder e o `compile()` estão na Referência de
**[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/#referência)**, e o
`Identifier::quote()` e o `Identifier::configure()` na de
**[Compondo queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/#referência)**.

### Dialects

```php
__construct ()
```
Cria o registro com uma instância de cada dialeto que vem com o framework.

```php
fetch (string $driver = 'pgsql'): Dialect
```
Retorna o dialeto registrado sob `$driver` — veja [Registro de dialetos](#registro-de-dialetos) para
os nomes. Lança `InvalidArgumentException` com `SQL builder dialect is not registered: <name>` para
qualquer outro.

```php
public private(set) MySQL $MySQL
```
O dialeto MySQL do registro, retornado para `mysql` e `mysqli`.

```php
public private(set) PostgreSQL $PostgreSQL
```
O dialeto PostgreSQL do registro, retornado para `pgsql`, `postgres` e `postgresql`.

```php
public private(set) SQLite $SQLite
```
O dialeto SQLite do registro, retornado para `sqlite` e `sqlite3`.

### Dialect

`Bootgly\ADI\Databases\SQL\Builder\Dialect` é abstrata; `PostgreSQL`, `MySQL` e `SQLite` em
`Bootgly\ADI\Databases\SQL\Builder\Dialects` a estendem.

```php
check (Capabilities $Capability): bool
```
Se o dialeto suporta `$Capability`. A base retorna `true` para todo case; `MySQL` e `SQLite`
retornam `false` para `Capabilities::Output`.

```php
abstract quote (string $name): string
```
Faz o quote de um identificador, nomes com pontos segmento por segmento.

```php
abstract mark (int $position): string
```
Escreve o placeholder do parâmetro na posição `$position`, contada a partir de 1 — `$1`, `?` ou
`?1` nos dialetos que vêm com o framework.

```php
abstract rebase (string $sql, int $offset): string
```
Renumera os placeholders de uma instrução embutida por `$offset`, a quantidade de parâmetros antes
dela. Os `?` do MySQL não precisam disso, então o dialeto dele retorna o SQL sem mudança.

```php
abstract order (string $column, Orders $Order, null|Nulls $Nulls = null): string
```
Escreve um item de `ORDER BY`, com a posição `NULLS FIRST` ou `NULLS LAST` de `$Nulls`.

```php
abstract slice (null|int $limited, int $offset): string
```
Escreve o texto de `LIMIT` e `OFFSET`, com um espaço na frente, ou uma string vazia quando nenhum
dos dois está definido.

```php
abstract upsert (array $assignments, array $conflicts): string
```
Escreve a cláusula de conflito de um `INSERT`, com um espaço na frente, a partir das colunas
atribuídas com quote (as chaves de `$assignments`) e das `$conflicts` com quote; uma string vazia
quando `$conflicts` está vazio.

```php
abstract match (string $column, string $placeholder, Matches $Match): string
```
Escreve o predicado de texto para `$Match` em `$column`.

```php
abstract output (string $sql, array $columns): string
```
Acrescenta as colunas de `RETURNING` a uma escrita, ou retorna `$sql` sem mudança quando `$columns`
está vazio. O `MySQL` lança `SQL dialect does not support RETURNING output.` para uma lista não
vazia.

```php
protected segment (string $name, string $open, string $close, string $escape): string
```
Divide `$name` nos pontos e envolve cada segmento em `$open` e `$close`, trocando `$close` dentro
dele por `$escape`; um segmento `*` fica sem quote. Lança `InvalidArgumentException` com
`SQL identifier segment cannot be empty.` para um segmento vazio.

```php
protected resolve (array $assignments, array $conflicts, string $source = 'EXCLUDED'): string
```
Monta `ON CONFLICT (...) DO UPDATE SET column = EXCLUDED.column, ...` — com `$source` no lugar de
`EXCLUDED` — para toda coluna atribuída que não é coluna de conflito, ou
`ON CONFLICT (...) DO NOTHING` quando não sobra nenhuma, com um espaço na frente; uma string vazia
quando `$conflicts` está vazio. O `upsert()` do PostgreSQL e do SQLite o retorna.

### Auxiliaries

```php
static check (string $class): bool
```
Se `$class` é um dos enums auxiliares do builder.

```php
const array ENUMS
```
As classes de enum auxiliares, como listadas em [Enums auxiliares](#enums-auxiliares).

### Enums auxiliares

Namespace `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`. Cada case vem seguido do SQL para o
qual compila, quando esse SQL é fixo:

| Enum | Cases |
|------|-------|
| `Aggregates` | `Average` (`AVG`), `Count` (`COUNT`, desde a 1.0.3), `Maximum` (`MAX`), `Minimum` (`MIN`), `Sum` (`SUM`) |
| `Capabilities` | `Output`, `Upsert` |
| `Joins` | `Full` (`FULL JOIN`), `Inner` (`JOIN`), `Left` (`LEFT JOIN`), `Right` (`RIGHT JOIN`) |
| `Junctions` | `And` (`AND`), `Or` (`OR`) |
| `Locks` | `Share` (`FOR SHARE`), `Update` (`FOR UPDATE`) |
| `Matches` | `Insensitive`, `Like`, `Text` — cada dialeto escreve o seu, veja [Diferenças que importam](#diferenças-que-importam) |
| `Modes` | `Delete`, `Insert`, `Select`, `Update` |
| `Nulls` | `First` (`NULLS FIRST`), `Last` (`NULLS LAST`) — o MySQL escreve uma ordenação por `IS NULL` no lugar |
| `Operators` | `Between` (`BETWEEN … AND …`), `Equal` (`=`), `Greater` (`>`), `GreaterOrEqual` (`>=`), `In` (`IN (…)`), `IsFalse` (`IS FALSE`), `IsNotNull` (`IS NOT NULL`), `IsNull` (`IS NULL`), `IsTrue` (`IS TRUE`), `Less` (`<`), `LessOrEqual` (`<=`), `Unequal` (`<>`) |
| `Orders` | `Asc` (`ASC`), `Desc` (`DESC`) |
