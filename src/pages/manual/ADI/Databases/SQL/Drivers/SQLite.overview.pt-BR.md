# Driver SQLite

`Bootgly\ADI\Databases\SQL\Drivers\SQLite` executa SQL em bancos em arquivo ou em memória
através da extensão PHP `sqlite3` — sem servidor, sem credenciais, zero setup. Ele
sustenta protótipos rápidos e testes end-to-end reais do Query Builder, Schema e ORM.

> Requer `ext-sqlite3` (`sudo apt install php8.4-sqlite3`). Sem a extensão, as operações
> falham graciosamente com uma mensagem clara.

## Banco sem setup

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);

$Database->query('CREATE TABLE fruits (id INTEGER PRIMARY KEY, name TEXT)');
$Database->query("INSERT INTO fruits (name) VALUES ('apple'), ('grape')");

$Select = $Database->query('SELECT id, name FROM fruits ORDER BY id');
$Select->Result->rows;  // [['id' => 1, 'name' => 'apple'], ['id' => 2, 'name' => 'grape']]
```

O driver é síncrono: toda operação resolve antes de `query()` retornar — nenhum `await()`
é necessário (chamá-lo é inofensivo).

Para um banco persistente, aponte `database` para um caminho de arquivo:

```php
$Database = new SQL(['driver' => 'sqlite', 'database' => '/var/data/app.db']);
```

## Parâmetros

O dialeto SQLite emite placeholders posicionais `?N`. Parâmetros nomeados funcionam com ou
sem o prefixo `:`:

```php
$Database->query('SELECT name FROM fruits WHERE id = ?1', [1]);
$Database->query('SELECT id FROM fruits WHERE name = :name', ['name' => 'apple']);
```

Os tipos mapeiam nativamente: `int` → INTEGER, `float` → REAL, `null` → NULL, `bool` →
INTEGER `0/1`, `DateTimeInterface` → TEXT (`Y-m-d H:i:s.u`), o restante → TEXT. SQLite não
tem tipo booleano — booleans voltam como inteiros `0`/`1`.

## Foreign keys

O SQLite vem com foreign keys **desligadas** por conexão; o driver as liga
(`PRAGMA foreign_keys = ON`) em todo handle que abre, então as constraints `REFERENCES`
emitidas pelo Schema se comportam como no PostgreSQL/MySQL — um insert de filho órfão
falha com `FOREIGN KEY constraint failed`.

## Chaves geradas

```php
$Insert = $Database->query("INSERT INTO fruits (name) VALUES ('fig')");
$Insert->Result->inserted; // último row id gerado
```

> **RETURNING é bloqueado** — a extensão `sqlite3` executa statements com cláusula
> `RETURNING` duas vezes (um step interno + reset roda antes do fetch), o que
> duplicaria a escrita silenciosamente. O driver falha esses statements de imediato,
> e o dialeto SQLite mantém a capability `output()` do Builder desligada — o ORM
> preenche as chaves geradas via `Result->inserted` automaticamente, como no MySQL.

## Transações e migrations

Transações, savepoints, migrations e seeders funcionam sem mudanças — o SQLite executa até
DDL transacionalmente, então cada migration é envolvida em `BEGIN`/`COMMIT`:

```php
$Transaction = $Database->begin();
$Transaction->query('INSERT INTO fruits (name) VALUES (?1)', ['plum']);
$Transaction->commit();
```

## Dimensionamento do Pool

Mantenha o padrão `pool.max = 1`:

- cada conexão do pool abre seu **próprio** handle `SQLite3` — com `:memory:` isso
  significa um banco independente e vazio por handle;
- bancos em arquivo evitam contenção `SQLITE_BUSY` com um único handle escritor. O
  `timeout` configurado vira o `busyTimeout` do handle.

Para habilitar leitores concorrentes em um banco em arquivo, aplique o modo WAL uma vez:

```php
$Database->query('PRAGMA journal_mode=WAL');
```

## Referência

```php
query (string $sql, array $parameters = []): Operation
```

Cria e executa sincronamente uma operação. O `Result` carrega `rows`, `columns`,
`affected` (de `SQLite3::changes()`), `inserted` (de `SQLite3::lastInsertRowID()`) e uma
tag de status no estilo PostgreSQL (`SELECT 2`, `INSERT 0 1`, ...).

```php
prepare (Operation $Operation): Operation
```

Abre o handle do banco no primeiro uso e executa a operação — SQL parametrizado roda por
um cache de `SQLite3Stmt` por conexão (limitado pela chave de config `statements`, remoção
LRU). `statements => 0` desliga o cache: cada statement fecha logo após o comando
concluir.

```php
advance (Operation $Operation): Operation
```

No-op após a execução síncrona; reexecuta operações promovidas da fila pending do pool.

Cancelamento não é suportado (`cancel()` falha): a extensão `sqlite3` não tem interrupção
entre handles. O contrato do Pool de conexões é satisfeito por um stream placeholder — não
existe socket de wire.
