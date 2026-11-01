# Driver SQLite

`Bootgly\ADI\Databases\SQL\Drivers\SQLite` executa SQL em bancos em arquivo ou em memória
através da extensão PHP `sqlite3` — sem servidor, sem credenciais, zero setup. Ele
sustenta protótipos rápidos e testes end-to-end reais do Query Builder, Schema e ORM.

> Requer `ext-sqlite3` (`sudo apt install php8.4-sqlite3`). Sem a extensão, toda operação
> falha com `SQLite driver requires the sqlite3 extension.`

## Banco sem setup

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);

$Database->await($Database->query('CREATE TABLE fruits (id INTEGER PRIMARY KEY, name TEXT)'));
$Database->await($Database->query("INSERT INTO fruits (name) VALUES ('apple'), ('grape')"));

$Select = $Database->await($Database->query('SELECT id, name FROM fruits ORDER BY id'));
$Select->Result->rows;  // [['id' => 1, 'name' => 'apple'], ['id' => 2, 'name' => 'grape']]
```

O driver é síncrono: uma operação que recebe a conexão roda o statement dentro do `query()`, então
o `await()` retorna na hora. Aguarde mesmo assim — ele lança uma `RuntimeException` quando o
statement falhou (veja **[Leia o resultado](/manual/ADI/Databases/SQL/overview/#leia-o-resultado)**),
e recusa uma operação ainda estacionada atrás de uma transação (veja
[Dimensionamento do Pool](#dimensionamento-do-pool)).

Para um banco persistente, aponte `database` para um caminho de arquivo:

```php
$File = new SQL(['driver' => 'sqlite', 'database' => '/var/data/app.db']);
```

Construir a facade não abre nada: a primeira operação abre o arquivo, e o cria quando ele não
existe. Um caminho relativo é resolvido a partir do diretório de trabalho atual do processo, e o
padrão também — omita `database` e o driver abre um arquivo chamado `bootgly` nesse diretório. Um
caminho que não pode ser aberto falha a operação com
`Unable to open database: unable to open database file`.

Das chaves de conexão, o driver lê só `driver`, `database`, `timeout`, `pool` e `statements` (veja
**[SQLite](/manual/ADI/Database/Config/overview/#sqlite)** na página de configuração). O `timeout`
dele não é prazo para um statement que recebe a conexão — um lento roda até o fim —, e sim quanto
esse statement espera por um arquivo de banco travado. A exceção é uma operação estacionada atrás
de uma transação: ela mantém o prazo dela — veja
**[Timeout](/manual/ADI/Database/Config/overview/#timeout)** e
[Dimensionamento do Pool](#dimensionamento-do-pool).

## Parâmetros

O dialeto SQLite emite placeholders posicionais `?N`. Uma lista vincula `?N` — e um `?` puro — por
posição, e parâmetros nomeados vinculam placeholders `:name`, com ou sem o prefixo `:`:

```php
$Database->await($Database->query('SELECT name FROM fruits WHERE id = ?1', [1]));
$Database->await($Database->query('SELECT id FROM fruits WHERE name = :name', ['name' => 'apple']));
```

Placeholders `@name` e `$name` não podem ser vinculados por nome: escreva-os como `:name`.

Um parâmetro nomeado precisa casar com um placeholder do statement. Um que não casa com
nenhum — um typo, ou um placeholder renomeado sem atualizar quem chama — falha a operação
em vez de ser descartado:

```php
$Insert = $Database->query('INSERT INTO fruits (name) VALUES (:name)', ['nmae' => 'apple']);

$Insert->error;
// SQLite cannot bind the parameter "nmae": the statement has no matching placeholder.
```

Nada é gravado. Sem essa checagem o placeholder manteria o valor padrão — `NULL` — então a
linha seria gravada com a coluna em branco enquanto a operação reportava sucesso.

Os valores são vinculados pelo tipo PHP: `int` → INTEGER, `float` → REAL, `null` → NULL, `bool` →
INTEGER `0`/`1`, `string` → TEXT. Um `DateTimeInterface` é vinculado como TEXT em `Y-m-d H:i:s.u` —
o horário de relógio dele sem o offset, então converta-o antes para o fuso horário que você grava.
Um array ou qualquer outro objeto — um `BackedEnum`, um `Stringable` — falha a operação com
`SQLite cannot bind the parameter "status".`, nomeando a chave dele, ou a posição contada a partir
de `0`; passe o `value` do enum no lugar. SQLite não tem tipo de coluna booleano — booleans voltam
como inteiros `0`/`1`. O que cada tipo de coluna devolve está em
**[Tipos SQL](/manual/ADI/Databases/SQL/Drivers/Types/overview/)**.

> [!WARNING]
> Duas lacunas de vínculo hoje reportam sucesso. Um placeholder que os parâmetros omitem é gravado
> como `NULL`: `INSERT INTO fruits (id, name) VALUES (:id, :name)` só com `id` grava a linha sem o
> nome, e o `error` fica `null` — passe um valor para cada placeholder. E uma string com um byte
> NUL é gravada inteira como TEXT, mas volta cortada no primeiro deles: `"sess\0alice"` e
> `"sess\0bob"` voltam os dois como `sess`. Grave dados binários através de `CAST(?1 AS BLOB)` —
> um `BLOB` volta inteiro — e leia um valor já gravado como texto com `CAST(column AS BLOB)`.

## Foreign keys

O SQLite vem com foreign keys **desligadas** por conexão; o driver as liga
(`PRAGMA foreign_keys = ON`) em todo handle que abre, então as constraints `REFERENCES`
emitidas pelo Schema se comportam como no PostgreSQL/MySQL — um insert de filho órfão
falha com `Unable to execute statement: FOREIGN KEY constraint failed`, código `787`.

## Chaves geradas

```php
$Insert = $Database->await($Database->query("INSERT INTO fruits (name) VALUES ('fig')"));
$Insert->Result->inserted; // 3, the row id of the new row
```

O `inserted` é o row id da última linha que a instrução inseriu: a última de um `INSERT` de várias
linhas, e a própria chave só numa tabela com chave `INTEGER PRIMARY KEY` — uma tabela com chave
`TEXT` reporta o row id oculto dela.

> **RETURNING é bloqueado** — a extensão `sqlite3` executa statements com cláusula
> `RETURNING` duas vezes (um step interno + reset roda antes do fetch), o que
> duplicaria a escrita silenciosamente. O driver falha esses statements de imediato com
> `SQLite RETURNING is not supported: the sqlite3 extension executes the statement twice, duplicating the write. Read generated ids from Result->inserted.`,
> e o dialeto SQLite mantém a capability `output()` do Builder desligada — o ORM
> preenche as chaves geradas via `Result->inserted` automaticamente, como no MySQL.

## Linhas afetadas e status

O `affected` vem de `SQLite3::changes()`: as linhas que a instrução inseriu, atualizou ou apagou. O
`status` imita a tag de comando do PostgreSQL — `SELECT 2`, `INSERT 0 1`, `UPDATE 2` — e é a
palavra-chave pura para qualquer outra coisa (`CREATE`, `PRAGMA`, `WITH`). A comparação com o
PostgreSQL e o MySQL está em
**[Diferenças no resultado](/manual/ADI/Databases/SQL/Drivers/overview/#diferenças-no-resultado)**.

> [!WARNING]
> Hoje o driver escolhe o que ler pela primeira palavra da instrução. Uma escrita que começa com
> `WITH`, ou atrás de um comentário `--` ou `/* */` no início, aplica as mudanças e reporta
> `affected` `0`, `inserted` `0` e o `status` `WITH` ou vazio; um `WITH` … `SELECT` devolve as
> linhas com o `status` `WITH`. E um `INSERT` que não insere nada — `INSERT OR IGNORE`,
> `ON CONFLICT DO NOTHING`, um `INSERT … SELECT` que não seleciona linha nenhuma — ou um upsert que
> atualiza em vez de inserir reporta no `inserted` o row id da última linha que a conexão inseriu,
> em qualquer tabela. Comece as escritas pelo verbo delas, e busque a linha de um upsert pela chave
> única dela.

## Transações e migrations

Transações, savepoints, migrations e seeders funcionam sem mudanças — o SQLite executa até
DDL transacionalmente, então cada migration é envolvida em `BEGIN`/`COMMIT`:

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->query('INSERT INTO fruits (name) VALUES (?1)', ['plum']));
$Database->await($Transaction->commit());
```

> [!WARNING]
> Por enquanto, um `COMMIT` recusado com `database is locked` — outra conexão mantém um lock de
> leitura, fora do WAL — ou numa foreign key `DEFERRABLE INITIALLY DEFERRED` deixa a transação
> aberta na conexão dela, enquanto a `Transaction` a dá por encerrada (o `rollback()` é recusado
> com `SQL transaction is not active.`). O pool entrega essa conexão de novo: o que roda ali depois
> nunca é commitado, e um `begin()` ali falha com
> `Unable to execute statement: cannot start a transaction within a transaction`. Sob WAL, leitores
> nunca seguram um `COMMIT`.

## Dimensionamento do Pool

`:memory:` — e o nome de banco vazio — mantêm **uma conexão**, e a configuração garante
isso: um `pool.max` acima de `1` é reduzido para `1`. Um pool configurado para não abrir
nada (`pool.max = 0`) fica como está. **Um banco em arquivo mantém o pool que você deu.**

Os dois não são o mesmo tipo de banco:

- `:memory:` é privado do handle que o abre, e cada conexão do pool abre seu **próprio**
  handle `SQLite3` — então uma segunda conexão é um segundo banco, vazio, e uma linha
  escrita por um handle é invisível para o outro sem que nada dê erro;
- um arquivo é um banco só, qualquer que seja o handle que o abra. Os handles disputam seu
  lock: uma escrita feita enquanto outro handle mantém uma transação de escrita espera até o
  `timeout` e então falha com `Unable to execute statement: database is locked` (código `5`), que
  é o SQLite pedindo para você tentar de novo. Um `timeout` `0` a falha na hora.

Planeje uma consequência de um pool de uma conexão — enquanto uma transação mantém a
conexão, todo outro `query()` naquela facade fica estacionado em `pending`, e aguardá-lo falha com
`Database pool has no capacity for the operation.` Execute-o pela transação, ou emita-o
antes do `begin()` ou depois do teardown. Um que você não aguarda roda quando a transação termina —
a menos que o prazo dele vença antes: aí ele falha com
`Database operation timed out after 30 seconds.` (o `timeout` padrão) e nunca roda.

Para outros processos lerem um banco em arquivo enquanto um escreve, aplique o modo WAL uma vez:

```php
$Database->await($Database->query('PRAGMA journal_mode=WAL'));
```

Sob WAL, uma transação lê de um snapshot tirado na primeira leitura dela. Se outra conexão faz
commit depois disso, a primeira escrita da transação falha na hora — seja qual for o `timeout` —
com a mesma mensagem `database is locked` e o código `517`: repetir o statement não adianta, então
faça rollback e repita a transação inteira.

> [!WARNING]
> Por enquanto, um statement com parâmetros que falha com `database is locked` (código `5` ou
> `517`) fica inacabado e mantém a conexão dele dentro de uma transação aberta. As leituras ali
> mantêm o lock delas no arquivo, então um `COMMIT` em outra conexão espera o `timeout` dele inteiro
> e falha com o mesmo erro; sob WAL elas continuam lendo os dados como estavam, então uma transação
> repetida ali depois de um `517` falha com `517` de novo. E depois de uma escrita recusada com
> código `5`, uma escrita ali pode reportar sucesso e nunca ser commitada: rodar de novo o SQL
> recusado faz o rollback dela, e fechar a conexão também. Defina `statements` como `0` para evitar
> tudo isso — um statement que falhou passa a ser descartado na hora.

## Cancelamento

Não há nada para interromper. Uma operação que recebeu a conexão já terminou quando o `query()`
retorna, então o `cancel()` só a marca como `revoked` e mantém o resultado dela:

```php
$Select = $Database->query('SELECT name FROM fruits WHERE id = ?1', [1]);

$Database->cancel($Select);

$Select->revoked;     // true
$Select->Result->row; // ['name' => 'apple']
```

Uma operação estacionada em `pending` atrás de uma transação falha com
`Database operation has no protocol to cancel.` O `cancel()` do próprio driver, que a facade nunca
alcança para uma operação terminada, falha com `Database driver does not support cancellation.` —
a extensão `sqlite3` não tem interrupção. Veja
**[Cancele um statement em execução](/manual/ADI/Database/Pool/overview/#cancele-um-statement-em-execução)**.

## Referência

```php
query (string $sql, array $parameters = []): Operation
```

Cria e executa sincronamente uma operação. O `Result` carrega `rows`, `columns`,
`affected` (de `SQLite3::changes()`), `inserted` (de `SQLite3::lastInsertRowID()`) e uma
tag de status no estilo PostgreSQL (`SELECT 2`, `INSERT 0 1`, ...) — veja
[Linhas afetadas e status](#linhas-afetadas-e-status).

```php
prepare (Operation $Operation): Operation
```

Abre o handle do banco no primeiro uso e executa a operação — SQL parametrizado roda por
um cache de `SQLite3Stmt` por conexão (limitado pela chave de config `statements`, remoção
LRU). `statements => 0` desliga o cache: cada statement fecha logo após o comando
concluir.

Um statement que o engine rejeitou — violação de UNIQUE ou FOREIGN KEY — permanece no cache e é
reusado. Só a operação que gerou o erro falha com ele; a operação seguinte sobre o mesmo SQL roda
normalmente, com quaisquer parâmetros. Uma linha rejeitada, portanto, nunca custa a linha seguinte.
Um statement recusado com `database is locked` também permanece no cache, mas por enquanto mantém a
conexão dele dentro de uma transação aberta — veja
[Dimensionamento do Pool](#dimensionamento-do-pool).

```php
advance (Operation $Operation): Operation
```

No-op após a execução síncrona; reexecuta operações promovidas da fila pending do pool.

```php
cancel (Operation $Operation): Operation
```

Herdado do `Driver`: falha a operação com `Database driver does not support cancellation.` O
contrato do Pool de conexões é satisfeito por um stream placeholder — não existe socket de wire.
