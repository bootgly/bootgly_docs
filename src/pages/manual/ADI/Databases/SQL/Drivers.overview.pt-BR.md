# Drivers SQL

`Bootgly\ADI\Databases\SQL\Drivers` registra os wire drivers nativos que executam o SQL
gerado pelo Query Builder e pelo Schema. O Bootgly traz três drivers embutidos —
**PostgreSQL**, **MySQL/MariaDB** e **SQLite** — implementados nativamente, com zero
dependências de terceiros.

## Selecionando um driver

A chave de config `driver` seleciona de uma vez o driver, o dialeto do Query Builder e o
dialeto do Schema (DDL):

```php
use Bootgly\ADI\Databases\SQL;

$PostgreSQL = new SQL(['driver' => 'pgsql']);
$MySQL = new SQL(['driver' => 'mysql']);
$SQLite = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);
```

Em um projeto, vincule o driver pelo escopo de config `database` — `DB_CONNECTION`
seleciona o bloco de conexão que será lido:

```bash :toolbar="true";
DB_CONNECTION=mysql DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root php bootgly boot
```

Aliases de driver aceitos pelo adaptador de config: `pgsql`/`postgres`/`postgresql`,
`mysql`/`mariadb` e `sqlite`/`sqlite3`.

## Matriz de capacidades

| Capacidade | PostgreSQL | MySQL/MariaDB | SQLite |
|------------|------------|---------------|--------|
| Modelo de execução | assíncrono (non-blocking) | assíncrono (non-blocking) | síncrono |
| Pipelining no wire | sim | não (FIFO request-response) | — |
| TLS | sim (modos `secure`) | sim (modos `secure`) | — |
| Autenticação | cleartext, MD5, SCRAM-SHA-256 | `mysql_native_password`, `caching_sha2_password` (full auth via TLS ou chave RSA pinada) | — |
| Prepared statements | protocolo estendido + cache LRU | protocolo binário + cache LRU | `SQLite3Stmt` + cache LRU |
| `RETURNING` | sim | não — `Result->inserted` no lugar | não — a extensão `sqlite3` executaria 2 vezes |
| Chaves geradas | linhas do `RETURNING` | `Result->inserted` (pacote OK) | `Result->inserted` (`lastInsertRowID`) |
| Cancelamento | side channel `CancelRequest` | side channel `KILL QUERY` | não suportado |
| DDL transacional | sim | não (commits implícitos) | sim |
| Advisory locks | `pg_advisory_lock` | `GET_LOCK` | — (somente file lock) |

Tudo acima do driver — Pool de conexões, Transações, Query Builder, ORM Repository,
Migrations e Seeders — é agnóstico de driver e funciona de forma idêntica nos três engines.

## Chaves geradas sem RETURNING

Os dialetos MySQL e SQLite não emitem `RETURNING` (no SQLite a extensão `sqlite3` executa
esses statements duas vezes, duplicando a escrita — o driver os falha de imediato). Em vez
disso, o driver reporta o id gerado em `Result->inserted`, e o ORM Repository preenche a
chave da entidade de forma transparente no `hydrate()`:

```php
$Repository = $Database->map(User::class);

$User = new User;
$User->name = 'Ada';

$Operation = $Database->await($Repository->save($User));
$Saved = $Repository->hydrate($Operation)->entity;

$Saved->id; // preenchido a partir de Result->inserted
```

## Notas sobre o Pool

- Cada conexão do pool vincula uma instância de driver — caches de prepared statements
  são por conexão.
- O tamanho do cache de prepared statements é a chave de config `statements` (padrão
  `256`); o statement menos usado recentemente é removido ao atingir o limite. O limite
  também vale do lado do servidor: um statement que o driver deixa de rastrear é fechado no
  wire, e um único statement é preparado por conexão, por mais operações que o peçam ao
  mesmo tempo.
- Um statement só é fechado quando nenhum comando pendente ainda carrega o id dele. Uma
  operação co-localizada grava o id do servidor nos próprios bytes no momento em que é
  criada, e esses bytes podem esperar vários round-trips na FIFO — remover esse statement
  nesse intervalo mandaria o close na frente de um comando que ainda precisa dele.
- Operações criadas antes de a primeira chegar ao socket compartilham esse único prepare.
  A irmã vincula o statement que a dona está preparando em vez de prepará-lo de novo — o
  que no PostgreSQL falharia de imediato (`42P05`) e no MySQL deixaria no servidor um
  statement que nada conseguiria fechar.
- MySQL não tem pipelining no wire: operações co-localizadas entram em uma FIFO onde só a
  cabeça possui o socket. O Pool continua correto — as irmãs bombeiam o stream de leitura
  compartilhado.
- SQLite é síncrono: operações resolvem imediatamente e nunca suspendem. Mantenha
  `pool.max = 1` para bancos `:memory:` (cada handle abriria um banco independente).

## Referência

- **[Driver PostgreSQL](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/)** — wire
  protocol 3.0, autenticação SCRAM, TLS e pipelining.
- **[Driver MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/)** — handshake,
  plugins de autenticação, protocolo binário e `KILL QUERY`.
- **[Driver SQLite](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/)** — bancos em
  arquivo e `:memory:` sem setup.
- **[Dialetos de Query](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** —
  diferenças de geração de SQL entre os engines.
- **[Dialetos de Schema](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — geração
  de DDL, DDL transacional e advisory locks.
