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
$MySQL = new SQL(['driver' => 'mysql', 'port' => 3306, 'username' => 'root']);
$SQLite = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);
```

Uma chave que o array omite recebe o padrão de um PostgreSQL local, seja qual for o `driver`, e
por isso a linha do MySQL define a própria `port` e o próprio `username`:
`new SQL(['driver' => 'mysql'])` sozinho conectaria em `127.0.0.1:5432` como `postgres`. Os padrões,
e os nomes de driver que um array aceita, estão em
**[Chaves e padrões](/manual/ADI/Database/Config/overview/#chaves-e-padrões)** e
**[Nomes de driver](/manual/ADI/Database/Config/overview/#nomes-de-driver)**. Num projeto, o
`DB_CONNECTION` seleciona o driver pelo escopo de config `database` — veja
**[Escolher um driver](/guide/database-dbal/overview/#escolher-um-driver)**.

## Matriz de capacidades

| Capacidade | PostgreSQL | MySQL/MariaDB | SQLite |
|------------|------------|---------------|--------|
| Modelo de execução | assíncrono (non-blocking) | assíncrono (non-blocking) | síncrono |
| Pipelining no wire | sim | não (FIFO request-response) | — |
| TLS | sim (modos `secure`) | sim (modos `secure`) | — |
| Autenticação | cleartext, MD5, SCRAM-SHA-256 (cleartext/MD5, ou SCRAM abaixo de 4096 iterações, exigem TLS ou `disable` num host que não é loopback sob `prefer`) | `mysql_native_password`, `caching_sha2_password` (full auth via TLS ou chave RSA pinada) | — |
| Prepared statements | protocolo estendido + cache LRU | protocolo binário + cache LRU | `SQLite3Stmt` + cache LRU |
| Parâmetros `DateTimeInterface` | recusados — formate o valor antes | vinculados como `Y-m-d H:i:s.u` | vinculados como `Y-m-d H:i:s.u` |
| `RETURNING` | sim | não — `Result->inserted` no lugar | não — a extensão `sqlite3` executaria 2 vezes |
| Chaves geradas | linhas do `RETURNING` | `Result->inserted` (pacote OK) | `Result->inserted` (`lastInsertRowID`) |
| Várias instruções numa string | sem parâmetros, todas rodam e os resultados se misturam | recusadas (`1064`) | só a primeira roda |
| Cancelamento | side channel `CancelRequest` | side channel `KILL QUERY` | nenhum — um statement já terminou quando o `query()` retorna |
| DDL transacional | sim | não (commits implícitos) | sim |
| Advisory locks | `pg_advisory_lock` | `GET_LOCK` | — (somente file lock) |

Tudo acima do driver — Pool de conexões, Transações, Query Builder, ORM Repository, Migrations e
Seeders — é agnóstico de driver: o mesmo código roda nos três engines. O que ainda muda é o que
volta — [Diferenças no resultado](#diferenças-no-resultado), [Erros e códigos](#erros-e-códigos) —
e o que uma única instrução pode fazer ([Limites](#limites)). Como cada driver vincula valores PHP
e decodifica os tipos de coluna está em
**[Tipos SQL](/manual/ADI/Databases/SQL/Drivers/Types/overview/)**.

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

$Saved->id; // backfilled from Result->inserted
```

### Chaves maiores que um int do PHP

Uma chave `BIGINT UNSIGNED` do MySQL pode passar de 2^63, valor que nenhum `int` do PHP
comporta. Em vez de perder o valor, o driver reporta esses ids como **strings decimais
exatas** — então declare a chave aceitando uma:

```php
#[Table('orders')]
class Order
{
   #[Key]
   public null|int|string $id = null;
}
```

Por isso `Result->inserted` é `int|string`: `int` para todo id dentro de `PHP_INT_MAX`,
string apenas acima dele. Uma chave declarada `null|int` que recebe um id desses levanta uma
`RuntimeException` nomeando a propriedade, em vez de guardar um valor estreitado — uma chave
saturada não casaria com linha nenhuma, e o `save()` seguinte atualizaria nada em silêncio.

Isso só aparece quando a tabela de fato guarda ids desse tamanho. Um
`BIGINT UNSIGNED AUTO_INCREMENT` comum nunca chega lá sozinho, mas uma importação que
preserva um id legado acima de 2^63 faz o servidor continuar a sequência a partir dele.

A leitura segue a mesma regra, e ela não se limita a chaves. A hidratação estreita o valor
decodificado para o tipo declarado da propriedade, então qualquer coluna cujo valor passe de
`PHP_INT_MAX` — uma chave, um contador, um `DECIMAL` — levanta a mesma `RuntimeException`
nomeando a propriedade, em vez de saturar. Declare a propriedade como `null|int|string` e ela
hidrata exatamente como o driver decodificou.

## Diferenças no resultado

A mesma instrução pode voltar com `status`, `affected` e `inserted` diferentes em cada driver (os
campos estão descritos em **[Resultado](/manual/ADI/Database/overview/#resultado)**): o PostgreSQL
copia a tag de comando do servidor, o MySQL lê o pacote que encerra o comando, e o SQLite pergunta
ao próprio handle. Com uma tabela `stock` com as linhas `(1, 0)` e `(2, 5)`:

```php
$Update = $Database->await($Database->query('UPDATE stock SET qty = 0'));

$Update->Result->status;   // PostgreSQL and SQLite: UPDATE 2 — MySQL: UPDATE 1
$Update->Result->affected; // PostgreSQL and SQLite: 2 — MySQL: 1

$Select = $Database->await($Database->query('SELECT id FROM stock'));

$Select->Result->status;   // SELECT 2
$Select->Result->affected; // PostgreSQL: 2 — MySQL and SQLite: 0
```

O MySQL conta as linhas que um `UPDATE` alterou, não as que ele casou: a linha 1 já tinha `0`. A
mesma comparação para outras instruções:

| Instrução | PostgreSQL | MySQL | SQLite |
| --- | --- | --- | --- |
| `INSERT` de 3 linhas que recebem os ids 2, 3 e 4 | `INSERT 0 3`, inserted `0` | `INSERT 0 3`, inserted `2` | `INSERT 0 3`, inserted `4` |
| Upsert que atualiza uma linha existente | `INSERT 0 1`, affected `1` | `INSERT 0 2`, affected `2`, inserted: o id dessa linha | `INSERT 0 1`, affected `1` |
| `REPLACE` que substitui uma linha existente | — | `REPLACE 2`, affected `2` | `REPLACE 1`, affected `1` |
| `WITH` … `UPDATE` que altera 2 linhas | `UPDATE 2`, affected `2` | `WITH`, affected `2` | `WITH`, affected `0` |
| `CREATE TABLE` | `CREATE TABLE` | `CREATE` | `CREATE` |

- `status` — o PostgreSQL devolve a própria tag do servidor. O MySQL e o SQLite montam uma nesse
  formato a partir da primeira palavra da instrução: `INSERT 0 <affected>`, `UPDATE <affected>`,
  `DELETE <affected>`, `REPLACE <affected>`, e a palavra-chave pura, em maiúsculas, para qualquer
  outra coisa — ou uma string vazia quando a instrução começa com um comentário. O MySQL escreve
  `SELECT <rows>` para toda instrução que devolve linhas, `SHOW TABLES` e `CALL` incluídos; o SQLite
  só para uma que começa com `SELECT`.
- `affected` — o PostgreSQL pega o número da tag, então um `SELECT` reporta as linhas que devolveu
  e um `UPDATE` as linhas que casou. O MySQL conta linhas alteradas: um
  `INSERT … ON DUPLICATE KEY UPDATE` conta 1 para uma linha que insere, 2 para uma linha que
  atualiza e 0 para uma que fica como estava, e um `REPLACE` que substitui uma linha conta também a
  remoção dela. O SQLite conta as linhas que uma instrução inseriu, atualizou ou apagou. O MySQL e o
  SQLite reportam `0` para um `SELECT`.
- `inserted` — o PostgreSQL sempre reporta `0`: leia as chaves geradas com `RETURNING` (o
  `output()` do Builder). O MySQL reporta o valor `AUTO_INCREMENT` da primeira linha que a
  instrução inseriu — um valor explícito conta —, o id da linha atualizada depois de um upsert que a
  atualizou, e `0` quando nenhuma linha foi inserida ou a tabela não tem coluna `AUTO_INCREMENT`. O
  SQLite reporta o rowid da última linha inserida, que só é a chave numa tabela com chave
  `INTEGER PRIMARY KEY`.

> [!WARNING]
> No SQLite esses campos hoje dependem da primeira palavra da instrução. O `affected` só é lido
> para uma instrução que começa com `INSERT`, `UPDATE`, `DELETE` ou `REPLACE`, e o `inserted` só
> para `INSERT` e `REPLACE`: um `WITH` … `UPDATE`, ou uma escrita atrás de um comentário `--` ou
> `/* */` no início, aplica as mudanças e reporta `affected` `0` e `inserted` `0`. E depois de um
> `INSERT` que não insere nada — `INSERT OR IGNORE`, `ON CONFLICT DO NOTHING`, um
> `INSERT … SELECT` que não seleciona linha nenhuma — ou de um upsert que atualiza em vez de
> inserir, o `inserted` repete o rowid da última linha que a conexão inseriu, em qualquer tabela.
> Leia o `inserted` depois de um `INSERT` simples, e busque a linha de um upsert pela chave única
> dela. O MySQL reporta os números certos nos dois casos; só o `status` dele é o `WITH` puro, ou
> vazio, para uma escrita que começa com `WITH` ou com um comentário.

## Erros e códigos

Uma operação que falhou guarda o código de falha do driver em `code`: uma string, ou `null` quando
a falha não veio do banco (veja **[Leia o resultado](/manual/ADI/Databases/SQL/overview/#leia-o-resultado)**).
As mensagens mudam de driver para driver, e as do MySQL seguem o idioma do servidor
(`lc_messages`), então decida pelo `code`. Uma chave duplicada, detectada em qualquer driver:

```php
use RuntimeException;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Email = 'email'; }

$Insert = $Database->query(
   $Database->table(Tables::Users)->insert()->set(Columns::Email, 'ada@example.com')
);

try {
   $Database->await($Insert);
}
catch (RuntimeException $Exception) {
   $duplicate = match ($Database->Config->driver) {
      'pgsql' => $Insert->code === '23505',
      'mysql' => $Insert->code === '1062',
      'sqlite' => $Insert->code === '2067' || $Insert->code === '1555',
   };

   if ($duplicate === false) {
      throw $Exception;
   }

   // The e-mail is taken: ask for another one.
}
```

O Builder escreve os placeholders de cada driver, então com o `$Database` aberto a partir do escopo
`database` do projeto (veja **[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**)
o bloco roda sem mudanças, seja qual for o driver que o `DB_CONNECTION` seleciona. O SQLite divide
a chave duplicada em dois códigos: `2067` para uma coluna `UNIQUE`, `1555` para a chave primária.

As falhas comuns, por driver:

| Falha | PostgreSQL | MySQL | SQLite |
| --- | --- | --- | --- |
| Chave duplicada | `23505` | `1062` | `2067`; `1555` na chave primária |
| Foreign key: a linha pai não existe | `23503` | `1452` | `787` |
| Foreign key: a linha ainda é referenciada | `23503` | `1451` | `787` |
| `NULL` numa coluna `NOT NULL` | `23502` | `1048` | `1299` |
| Constraint `CHECK` | `23514` | `3819` | `275` |
| Tabela desconhecida | `42P01` | `1146` | `1` |
| Erro de sintaxe | `42601` | `1064` | `1` |
| Arquivo do banco travado | — | — | `5`; `517` sob WAL quando o snapshot de uma transação está desatualizado |

Cada driver monta o `error` do seu jeito:

- O PostgreSQL mantém a mensagem principal do servidor —
  `duplicate key value violates unique constraint "users_email_key"` — e descarta o detalhe, a dica
  e a posição do erro que vêm com ela. O `code` é o SQLSTATE.
- O MySQL escreve `<errno>: <mensagem>` — `1062: Duplicate entry 'ada@example.com' for key 'users.email'`.
  O `code` é o errno; o SQLSTATE que o servidor também envia é descartado.
- O SQLite repassa a mensagem da extensão `sqlite3`, prefixada pela etapa que falhou:
  `Unable to execute statement: UNIQUE constraint failed: users.email` enquanto o statement rodava,
  `Unable to prepare statement: no such table: users` enquanto ele compilava — um statement reusado
  do cache compila de novo enquanto roda, então reporta o mesmo erro com o primeiro prefixo. O
  `code` é o extended result code, então todo erro de compilação — sintaxe, tabela ou coluna
  desconhecida — compartilha o `1`.

Uma falha levantada pelo driver ou pelo pool, e não pelo banco, não traz `code`: um parâmetro que o
driver não consegue vincular (`PostgreSQL parameter must be scalar or null.`), o `RETURNING` recusado
do SQLite, um prazo vencido, uma recusa do pool (veja
**[Erros do pool](/manual/ADI/Database/Pool/overview/#erros)**). No SQLite, um parâmetro posicional
além do último placeholder do statement é recusado pelo engine, não pelo driver, e por isso traz
um: `Unable to bind parameter number 2`, código `25`.

## Limites

### Uma instrução por query

Envie uma instrução por `query()`. Uma string com várias, separadas por `;`, é executada inteira,
recusada ou cortada, conforme o driver:

- O PostgreSQL roda todas as instruções de uma string sem parâmetros e responde com um único
  `Result`: as linhas de todas numa só lista `rows`, com as `columns`, o `status` e o `affected` da
  última — três `INSERT`s reportam `INSERT 0 1` e `affected` `1` depois de gravar três linhas. Com
  parâmetros o servidor recusa a string:
  `cannot insert multiple commands into a prepared statement` (`42601`).
- O MySQL recusa a string inteira antes de rodar qualquer parte dela, com ou sem parâmetros:
  `1064: You have an error in your SQL syntax; …`.
- O SQLite roda a primeira instrução e ignora o resto, sem erro. Os parâmetros são vinculados só a
  essa primeira instrução: um que não tem placeholder nela falha a operação antes de qualquer coisa
  rodar — `Unable to bind parameter number 1` (código `25`) para uma posição,
  `SQLite cannot bind the parameter "x": the statement has no matching placeholder.` para um nome.

No PostgreSQL:

```php
$Batch = $Database->await($Database->query('SELECT 1 AS a; SELECT 2 AS b'));

$Batch->Result->columns; // ['b']
$Batch->Result->rows;    // [['a' => 1], ['b' => 2]]
```

### Procedures armazenadas

No MySQL, o `CALL` devolve o primeiro result set da procedure e drena os outros, então a sessão
continua utilizável:

```php
$Database->await($Database->query('CREATE PROCEDURE totals () BEGIN SELECT 1 AS first; SELECT 2 AS second; END'));

$Call = $Database->await($Database->query('CALL totals()'));

$Call->Result->rows; // [['first' => 1]]
```

Uma procedure que não devolve result set reporta `status` `CALL` e a contagem `affected` da última
instrução dela. Os parâmetros são vinculados como em qualquer outra instrução: `CALL report(?)`. No
PostgreSQL, o `CALL` reporta `status` `CALL` e devolve os parâmetros `INOUT` e `OUT` da procedure
como uma linha. O SQLite não tem procedures armazenadas.

### Carga em massa

- O MySQL recusa `LOAD DATA LOCAL INFILE`. O driver não oferece arquivos locais ao servidor, então
  o MySQL responde
  `3948: Loading local data is disabled; this must be enabled on both the client and server sides`
  mesmo com o `local_infile` do servidor ligado, e a sessão continua utilizável. Um servidor que
  pede um arquivo local mesmo assim não recebe nenhum: o driver fecha a sessão e falha a instrução
  com `MySQL LOCAL INFILE requests are not supported.`
- O PostgreSQL não tem `COPY` de ou para o cliente. `COPY … TO STDOUT` reporta `COPY <n>` e não
  devolve linha nenhuma. `COPY … FROM STDIN` hoje espera o `timeout` inteiro e falha com
  `Database operation timed out after 30 seconds.` (o padrão) — com `timeout` `0`, nunca retorna.

Carregue linhas com `INSERT`s de várias linhas, em lotes — veja
**[Inserir várias linhas](/manual/ADI/Databases/SQL/Builder/Writing/overview/#inserir-várias-linhas)**.

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
- Um batch maior que o buffer do socket é escrito em partes, e a operação que o escreve
  segura o stream até terminar. Se quem a chamou desistir, a próxima operação naquela
  conexão encontra o dono com o prazo vencido e termina o flush ela mesma: a resposta é
  drenada em silêncio, a operação vencida falha com o próprio timeout e nunca é repetida —
  o trabalho dela rodou com um resultado que ninguém viu — e a conexão continua de pé. Um
  batch abandonado antes de qualquer byte chegar ao wire é simplesmente retirado, e uma
  nova tentativa continua válida. Um batch que o chamador **cancelou** nunca é concluído:
  enviar o restante executaria justamente o que foi retirado, então a sessão é descartada e
  o pool abre uma conexão nova. E quando a sessão morre com um batch escrito pela metade, esse
  batch falha com a mesma causa de todas as outras operações dela, em vez de esperar o próprio
  prazo vencer.
- Um statement cujo chamador parou de esperar — o cliente desconectou, uma espera deferred foi
  recusada ou interrompida — mantém a sessão quando o batch dele está inteiro no wire. O driver o
  *destaca*: um stand-in absorve o resto da resposta, o `check()` deixa de contar a conexão como
  ocupada por causa dele, e a próxima operação entregue a essa conexão entra na fila atrás do
  stand-in e o drena antes da própria. A vaga é segurada pela sessão viva pelo tempo real de
  execução do statement, não até o deadline. Um batch ainda sendo escrito é a exceção — os bytes
  restantes nunca poderão ser atribuídos, então a sessão é derrubada — e também um statement
  retirado numa conexão que uma transação reservou. A retirada também marca a sessão mantida
  (`taint`): a liberação que a devolve a `idle`, quando ninguém mais deve trabalho nela, escreve
  primeiro um reset (`reset()`) — advisory locks e `LISTEN` no PostgreSQL, locks nomeados no MySQL,
  mas não as variáveis `SET` — e uma sessão que não consegue recebê-lo é derrubada. Uma sessão
  marcada não recebe novo chamador co-localizado. Uma operação enfileirada atrás de um stand-in
  espera por ele; se essa operação expirar, o que ela já enviou ainda pode rodar no servidor, então
  o resultado dela é desconhecido. Veja
  **[Operações retiradas](/manual/ADI/Database/Pool/overview/#operações-retiradas)**.
- MySQL não tem pipelining no wire: operações co-localizadas entram em uma FIFO onde só a
  cabeça possui o socket. O Pool continua correto — as irmãs bombeiam o stream de leitura
  compartilhado.
- SQLite é síncrono: uma operação que recebe a conexão roda dentro do `query()` e nunca suspende.
  Um banco `:memory:` é privado do handle que o abre, então seu pool é confinado a uma conexão —
  um `pool.max` acima de `1` é reduzido para `1`. Bancos em arquivo mantêm seu pool.

## Referência

- **[Driver PostgreSQL](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/)** — wire
  protocol 3.0, autenticação SCRAM, TLS e pipelining.
- **[Driver MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/)** — handshake,
  plugins de autenticação, protocolo binário e `KILL QUERY`.
- **[Driver SQLite](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/)** — bancos em
  arquivo e `:memory:` sem setup.
- **[Tipos SQL](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** — vínculo de parâmetros e
  tipos de resultado, driver a driver.
- **[Dialetos de Query](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** —
  diferenças de geração de SQL entre os engines.
- **[Dialetos de Schema](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — geração
  de DDL, DDL transacional e advisory locks.

### Contrato de driver e Pool para trabalho retirado

Estes são os membros do `Driver` — e o método do `Pool` — usados para reconciliar o wire quando o
Pool finaliza uma operação de fora. O SQLite herda os padrões do `Driver`, e o Redis herda o
`detach()` e o `reset()` — o `abandon()` dele é próprio.

```php
detach (Operation $Operation): void
```

Reconcilia o wire de uma operação cujo chamador parou de esperar (`Pool::withdraw()`), mantendo
sempre uma sessão drenável quando o batch está inteiro no wire: a resposta restante fica com um
stand-in destacado, e nenhum leitor é exigido. Um batch cujos bytes restantes nunca poderão ser
atribuídos — escrito pela metade — ainda derruba a sessão. O padrão delega ao `abandon()`; um
driver cujo `abandon()` chama `detach()` precisa sobrescrevê-lo, ou os dois recursam.

```php
abandon (Operation $Operation): void
```

Reconcilia o wire quando o Pool finaliza uma operação de fora por qualquer outro motivo — um
deadline vencido, um cancel que nunca chegou ao servidor, um teardown de transação, uma retirada
numa conexão reservada por uma transação. Ele continua cortando a sessão quando ninguém sobra para
ler a resposta: PostgreSQL, MySQL e Redis só a mantêm enquanto sobra um leitor vivo para bombear a
resposta (uma entrada terminada não é leitora), e PostgreSQL e MySQL, fora isso, reconciliam
exatamente como o `detach()`. O padrão não faz nada.

```php
reset (): bool
```

Reseta o que uma sessão mantida pode carregar depois que o chamador foi embora — um lock concedido
depois que o chamador parou de esperar, uma subscrição. O Pool o pede ao devolver essa sessão a
`idle`, quando ninguém mais deve trabalho nela (`check()`): o driver o escreve na hora, atrás de
tudo o que a sessão ainda deve, então o servidor o executa logo depois que o trabalho abandonado
termina, mesmo que ninguém leia, e a resposta dele é absorvida como a de um stand-in por quem ler a
seguir. O PostgreSQL escreve `SELECT pg_advisory_unlock_all(); UNLISTEN *`; o MySQL escreve
`DO RELEASE_ALL_LOCKS()`. Variáveis de sessão não são resetadas. Um reset ainda devido, sem nada
escrito atrás dele, cobre um pedido repetido. Retorna `false` quando não pode ser escrito inteiro
agora — um batch segura o stream de escrita, o stream aceita menos que o reset inteiro, a sessão
sumiu — e o Pool então corta a sessão, que nenhum chamador mais compartilha. O padrão retorna
`true`: um driver que não guarda esse estado não tem o que resetar.

```php
check (): bool
```

Se o driver ainda deve trabalho a um chamador, de modo que o Pool não deve entregar a conexão
ainda: uma operação em voo que alguém espera ou — no PostgreSQL e no Redis — um batch que outro
chamador ainda está descarregando. Stand-ins destacados não contam: a próxima operação entregue
à conexão entra na fila atrás deles e os drena.

```php
public bool $detached { get; }
```

Se a sessão ainda deve respostas a stand-ins destacados — um reset de sessão pendente conta. O Pool
só mantém o deadline de um statement retirado enquanto isto vale: depois que os stand-ins são
drenados o servidor já respondeu, e um drop posterior da sessão não lhes deve vaga. É `false` por
padrão, para drivers que nunca destacam.

```php
taint (Connection $Connection): void
```

Método do `Pool`. Marca uma sessão emprestada cujo dono ficou órfão — o `withdraw()` marca aquela em
que um statement retirado que chegou ao servidor estava; uma transação adotada marca a reservada
dela —, para que o estado de sessão dela seja resetado antes de a conexão ser entregue de novo. A
próxima liberação que devolveria a conexão a `idle` — aquela depois da qual ninguém mais deve
trabalho nela (`Driver::check()`) — faz o driver escrever o reset dela (`reset()`) atrás de tudo o
que a sessão ainda deve, uma vez; uma sessão que não pode recebê-lo é cortada e derrubada. Até lá
nenhum novo chamador é co-localizado ali: ele rodaria antes do reset. Pensado para uma conexão que o
Pool emprestou, busy ou reservada: uma já idle só é resetada depois do próximo chamador dela. Uma
conexão que o Pool não conta é ignorada, e uma derrubada perde a marca.
