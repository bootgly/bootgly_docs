# Núcleo do DBAL

`Bootgly\ADI\Database` é o núcleo baixo nível da camada de banco do Bootgly. Ele é agnóstico de
transporte: mantém a configuração da conexão, uma conexão, o pool e as operações pendentes, enquanto
as fachadas de paradigma adicionam os verbos — `Bootgly\ADI\Databases\SQL` adiciona `query()`,
`table()` e `begin()`, `Bootgly\ADI\Databases\KV` adiciona `command()`. `query()` e `command()` são
assíncronos: cada um retorna na hora uma `Operation` pendente, e a operação é avançada até ter um
`Result` ou um `error` (no SQLite, uma operação que consegue a conexão roda dentro de `query()` —
veja [Execute uma operação](#execute-uma-operação)). `table()` retorna um `Builder` de query, e
`begin()` uma `Transaction` cujo `BEGIN` é uma operação dessas (`$Transaction->Operation`).

## Camadas

- `Database` — o núcleo abstrato que toda fachada estende: cria a configuração, a primeira conexão
  e os pools, e retira operações que ninguém espera (`withdraw()`).
- `Databases` — o registry e a factory de paradigmas. Só `sql` é registrado:
  `create('sql', [...])` cria um `SQL`, e `create('kv')` lança
  `Database paradigm is not registered: kv.` — crie a fachada key-value com `new KV([...])`.
- `Databases\SQL` — a fachada SQL: normaliza SQL raw, builders e objetos `Query` compilados em
  operações SQL, e roteia leituras para réplicas de leitura.
- `Databases\KV` — a fachada key-value: um único verbo `command()`, atendido pelo driver Redis.
- `Config` — host, porta, credenciais, timeout, TLS, pool e réplicas — veja
  **[Configuração](/manual/ADI/Database/Config/overview/)**.
- `Connection` — o stream não bloqueante e o estado de protocolo dele.
- `Pool` / `Pools` — o pool de conexões por endpoint, com conexões `idle` e `busy` e uma fila
  `pending`, e o registry dos pools de uma fachada — veja
  **[Pool de conexões](/manual/ADI/Database/Pool/overview/)**.
- `Operation` / `Result` — o trabalho pendente e, depois, suas linhas, colunas, tag de comando,
  contagem de afetados e último id gerado (`inserted`) — veja [Operação](#operação) e
  [Resultado](#resultado).
- `Driver` / `Drivers` — implementações de protocolo de wire e o registry delas por paradigma:
  PostgreSQL, MySQL/MariaDB e SQLite para SQL, Redis para KV.

## Execute uma operação

```php
use RuntimeException;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
]);

$Operation = $Database->query('SELECT $1::int AS value', [42]);
$Operation->state->value; // operation.queued

try {
   $Database->await($Operation);

   $Operation->Result->cell; // 42
}
catch (RuntimeException $Exception) {
   echo "Query failed: {$Operation->error}\n";
}
```

`query()` cria uma `Operation` e a atribui ao pool na hora. O pool escolhe uma conexão idle, abre
uma nova enquanto tem espaço, deixa a operação dividir uma ocupada, ou a estaciona em `pending`; o
driver vinculado à conexão prepara os bytes de protocolo, e nada é enviado ainda — a operação fica
`Queued`. Cada `advance()` a move adiante — abertura da conexão, TLS, autenticação, escrita,
leitura — até ela resolver com um `Result` ou falhar com um `error`. `await()` a avança até ela
terminar, e lança uma `RuntimeException` com `$Operation->error` quando ela falha: veja
[Aguarde de forma síncrona](/manual/ADI/Database/Pool/overview/#aguarde-de-forma-síncrona) para esse
contrato e para os casos em que o pool se recusa a esperar. O SQLite é síncrono quando a operação
consegue a conexão: o statement roda dentro de `query()`, que devolve a operação já terminada. Uma
que não encontra conexão livre — a única conexão de um banco `:memory:` segurada por uma transação,
por exemplo — é estacionada em `pending` como qualquer outra (veja
[Dimensionamento do Pool](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/#dimensionamento-do-pool)).

Dentro de um projeto, abra o banco a partir do escopo de configuração `database` do projeto em vez
de um array — `new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure())`,
veja **[DBAL de banco](/guide/database-dbal/overview/)** — e, em rotas HTTP, prefira os
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** do WPI e
`$Response->Database` em vez de chamar `Pool->wait()` ou `advance()` manualmente.

### Falhas

```php
$Operation = $Database->query('SELECT * FROM missing_table');

try {
   $Database->await($Operation);
}
catch (RuntimeException $Exception) {
   $Operation->state->value; // operation.failed
   $Operation->Result;       // null
   $Operation->code;         // 42P01
}
```

Uma operação que falhou está `finished`, o estado dela é `Failed`, o `Result` continua `null` e
`error` traz a mensagem. Uma operação SQL também carrega `code`: a identidade de falha legível por
máquina do driver — SQLSTATE do PostgreSQL, errno do MySQL ou o código de resultado estendido do
SQLite — pareada com `error` e limpa em `retry()`. É `null` quando a falha não carrega nenhuma, como
uma recusa do framework ou uma perda de transporte, e operações key-value não têm `code`. Cada
falha SQL é anunciada uma vez através de `SQL\Events::Failed` — veja
**[Events](/guide/events/overview/)**.

| Driver | `error` | `code` |
| --- | --- | --- |
| PostgreSQL | `relation "missing_table" does not exist` | `42P01` |
| MySQL | `1146: Table 'app.missing_table' doesn't exist` | `1146` |
| SQLite | `Unable to prepare statement: no such table: missing_table` | `1` |

Uma conexão que não pode ser aberta falha a operação com um `error` que nomeia o endpoint e a causa
— `MySQL connection failed: 127.0.0.1:3306 refused the connection (ECONNREFUSED).` (os drivers
PostgreSQL e Redis usam o mesmo texto). A causa é lida do socket quando a `ext-sockets` está
carregada; sem ela a mensagem lista as quatro de sempre:

| Causa | Texto depois de `<Driver> connection failed: ` |
| --- | --- |
| Recusada | `<host>:<port> refused the connection (ECONNREFUSED).` |
| Resetada | `<host>:<port> reset the connection (ECONNRESET).` |
| Sem rota para o host | `<host>:<port> is unreachable: no route to host (EHOSTUNREACH).` |
| Rede inalcançável | `<host>:<port> is unreachable: network is unreachable (ENETUNREACH).` |
| Expirada | `the connection to <host>:<port> timed out (ETIMEDOUT).` |
| Qualquer outro errno | `the connection to <host>:<port> failed (errno <n>).` |
| Sem `ext-sockets` | `the connection to <host>:<port> failed: refused, unreachable, reset or timed out.` |

Uma discagem apenas lenta — o primeiro SYN descartado e retransmitido — é aguardada, nunca relatada
como recusada: o `timeout` limita a espera e, sem `timeout`, o limite do próprio kernel a encerra
como `timed out (ETIMEDOUT)`. Uma discagem que falha antes de começar, como um nome de host que não
resolve, traz em vez disso o erro de stream do próprio PHP, então o texto varia conforme a
plataforma — no Linux:
`Database connection failed: php_network_getaddresses: getaddrinfo for db.invalid failed: Name or service not known`.

Um servidor MySQL ou PostgreSQL que aceita a conexão TCP e desliga antes de enviar um único byte
também é nomeado:
`MySQL connection failed: 127.0.0.1:3306 closed the connection before sending its greeting; the server may still be starting.`
(o PostgreSQL diz `during SSL negotiation` ou `during startup`). É o que uma porta publicada do
Docker faz enquanto o banco dentro do container ainda está inicializando: espere o servidor ficar
pronto e inicie de novo. Um servidor que desliga depois de ter respondido mantém a mensagem simples
de transporte (`socket closed`, `socket read failed`).

O pool acrescenta falhas próprias — falta de capacidade, prazos, cancelamento, retirada —
listadas em [Erros do pool](/manual/ADI/Database/Pool/overview/#erros).

## Operação

`Bootgly\ADI\Database\Operation` é o trabalho pendente que toda fachada retorna.

| Campo | Tipo | Significado |
| --- | --- | --- |
| `state` | `OperationStates` | Onde a operação está — veja [Estados da operação](#estados-da-operação). |
| `finished` | `bool` | `true` depois que ela resolveu ou falhou. Somente leitura. |
| `Result` | `null\|Result` | O desfecho; `null` até ela resolver, e em caso de falha. Somente leitura. |
| `error` | `null\|string` | A mensagem de falha; `null` a menos que ela tenha falhado. Somente leitura. |
| `parameters` | `array` | Os parâmetros vinculados. |
| `timeout` | `float` | Os segundos que ela recebeu — o `timeout` do pool para o qual foi criada, mantido quando uma leitura de réplica que falhou é refeita no primário; `0.0` ou menos significa sem prazo. |
| `deadline` | `float` | O timestamp de `microtime(true)` em que ela expira; `0.0` quando não tem prazo. Somente leitura. |
| `Pool` | `null\|Pool` | O pool que é dono dela agora. |
| `FallbackPool` | `null\|Pool` | Onde uma leitura que falhou é refeita: o pool primário, para uma leitura roteada a uma réplica. |
| `Connection` | `null\|Connection` | A conexão que ela recebeu, ou à qual está presa dentro de uma transação. |
| `cancelled` | `bool` | Um pedido de cancel chegou ao wire (`CancelRequest`, `KILL QUERY`). |
| `revoked` | `bool` | Quem chamou desistiu dela — `cancel()` ou `withdraw()` — mesmo quando nada foi enviado; nenhum fallback a refaz. |
| `fallback` | `bool` | Ela foi refeita no pool de fallback. |
| `quarantine` | `bool` | Marcado pelo driver numa falha de conexão, que conta contra a saúde de um pool de réplica — veja [Saúde das réplicas](/manual/ADI/Database/Pool/overview/#saúde-das-réplicas). |

Os demais campos pertencem ao pool e aos drivers: `Protocol` (o driver vinculado à operação),
`Readiness` (o socket e a direção a esperar em seguida), `lock` / `unlock` (a reserva da conexão
pela transação) e `Waker` (um hook de conclusão para quem aguarda estacionado).

Uma operação SQL (`Bootgly\ADI\Databases\SQL\Operation`) acrescenta `SQL` — o texto do statement —
e `code`, mais `status`, `rows`, `columns` e `affected`, que o driver preenche enquanto lê e que
coincidem com o `Result` quando a operação resolve; ela não tem `inserted`, que só o `Result`
carrega. A propriedade estática `$slow` define o limite de query lenta em segundos (`0.0`, o
padrão, desliga a verificação) — veja **[Events](/guide/events/overview/)**. `statement`,
`portal`, `prepared`, `write`, `types` e `parameterTypes` são o estado de protocolo do driver. Uma
operação key-value (`Bootgly\ADI\Databases\KV\Operation`) carrega `command` e `arguments`, e a
resposta decodificada em `response`.

### Estados da operação

`Bootgly\ADI\Database\Operation\OperationStates` é um enum com valores string; os valores têm
prefixo para que logs nunca os confundam com estados de conexão.

| Caso | Valor | Significado |
| --- | --- | --- |
| `Pending` | `operation.pending` | Fora de uma conexão: recém-criada, estacionada na fila `pending` do pool, ou rearmada por `retry()`. |
| `Queued` | `operation.queued` | Recebeu uma conexão; o comando está composto, mas nada foi escrito. |
| `Connecting` | `operation.connecting` | Abrindo a conexão. |
| `Startup` | `operation.startup` | Trocando o handshake inicial — a mensagem de startup do PostgreSQL, o greeting do MySQL. |
| `SSLRequest` | `operation.ssl_request` | Pedindo TLS ao servidor. |
| `SSLResponse` | `operation.ssl_response` | Esperando a resposta do PostgreSQL a esse pedido. |
| `SSLHandshake` | `operation.ssl_handshake` | Executando o handshake TLS. |
| `Authenticating` | `operation.authenticating` | Lendo as mensagens de autenticação do servidor. |
| `Password` | `operation.password` | Enviando uma senha ou uma resposta de autenticação. |
| `Querying` | `operation.querying` | Escrevendo o comando; um batch grande é escrito em partes. |
| `Reading` | `operation.reading` | O batch está inteiro no wire; lendo a resposta. |
| `Finished` | `operation.finished` | Resolvida com um `Result`. |
| `Failed` | `operation.failed` | Falhou com um `error`. |

## Resultado

```php
$Database->await($Database->query('CREATE TABLE items (id serial PRIMARY KEY, name text)'));

$Insert = $Database->await($Database->query("INSERT INTO items (name) VALUES ('a'), ('b')"));
$Insert->Result->status;   // INSERT 0 2
$Insert->Result->affected; // 2

$Select = $Database->await($Database->query('SELECT id, name FROM items ORDER BY id'));
$Select->Result->columns;  // ['id', 'name']
$Select->Result->count;    // 2
$Select->Result->cell;     // 1
```

`Bootgly\ADI\Database\Operation\Result` guarda o que o servidor respondeu. Os campos são
preenchidos pelo driver; quatro views leem as linhas por você.

| Campo | Tipo | Significado |
| --- | --- | --- |
| `status` | `string` | A tag de comando. |
| `rows` | `array<int,array<string,mixed>>` | Todas as linhas decodificadas, indexadas pelo nome da coluna. |
| `columns` | `array<int,string>` | Os nomes das colunas, na ordem do resultado — mesmo quando nenhuma linha casou; `[]` para um statement que não retorna conjunto de resultados, como DDL ou um `INSERT` sem `RETURNING`. |
| `affected` | `int` | As linhas que o statement alterou. |
| `inserted` | `int\|string` | O id que o servidor gerou para um `INSERT`; `0` quando indisponível. |
| `row` | `array<string,mixed>` | View: a primeira linha, ou `[]`. |
| `cell` | `mixed` | View: a primeira célula da primeira linha, ou `null`. |
| `count` | `int` | View: o número de linhas. |
| `empty` | `bool` | View: se nenhuma linha foi retornada. |

Os drivers preenchem os mesmos campos de um jeito um pouco diferente:

- `status` — o PostgreSQL retorna a tag do próprio servidor (`SELECT 2`, `INSERT 0 2`, `UPDATE 1`,
  `CREATE TABLE`, `SHOW`). O MySQL e o SQLite montam uma nesse formato: `INSERT 0 <affected>`,
  `UPDATE <affected>`, `DELETE <affected>` e `REPLACE <affected>` a partir da primeira palavra-chave
  do statement, e a palavra-chave pura para todo o resto (`CREATE`). O MySQL reporta
  `SELECT <rows>` para todo statement que retorna linhas (`SHOW TABLES` também); o SQLite só para
  um que começa com `SELECT`, então um `WITH` ou `PRAGMA` reporta a palavra-chave pura mesmo quando
  retorna linhas.
- `affected` — o PostgreSQL o tira da tag, então um `SELECT` reporta as linhas que retornou; o
  MySQL e o SQLite reportam `0` para um `SELECT`.
- `inserted` — o PostgreSQL sempre reporta `0`: leia chaves geradas com `RETURNING`. O MySQL
  reporta o primeiro id que um `INSERT` gerou (num `INSERT` de várias linhas, o da primeira), e o
  SQLite o último row id. Um id além de `PHP_INT_MAX` — uma chave MySQL `BIGINT UNSIGNED` além de
  2^63 — chega como string decimal exata, já que nenhum int do PHP é largo o bastante (veja
  **[Drivers SQL](/manual/ADI/Databases/SQL/Drivers/overview/#chaves-maiores-que-um-int-do-php)**).
- Um resultado key-value carrega só `status`, com o nome do comando; a resposta em si é o
  `response` da operação.

## Drivers nativos

Três wire drivers nativos executam operações SQL — veja
**[Drivers SQL](/manual/ADI/Databases/SQL/Drivers/overview/)** para a matriz de capacidades:

- **PostgreSQL** — Protocol 3.0 com TLS, autenticação cleartext/MD5/SCRAM, extended query, cache de
  prepared statements, pipelining e CancelRequest.
- **MySQL/MariaDB** — handshake v10 com TLS, `mysql_native_password` e `caching_sha2_password`
  (full auth via TLS ou chave RSA pinada), prepared statements binários e `KILL QUERY`.
- **SQLite** — driver síncrono sobre `ext-sqlite3` para bancos em arquivo e `:memory:`.

Valores `numeric` do PostgreSQL e `DECIMAL` do MySQL voltam como strings, então a precisão deles é
preservada. O SQLite não tem tipo decimal: uma coluna `DECIMAL` volta como um número do PHP,
arredondado à precisão de um float quando não cabe num inteiro.

A fachada key-value roda sobre o driver nativo do Redis, que fala RESP sobre o mesmo pool não
bloqueante.

## Referência

### Database

`Bootgly\ADI\Database` — o núcleo abstrato de `SQL` e `KV`.

```php
__construct (array|Config $config = [], string $drivers = Drivers::class)
```

Cria o núcleo a partir de um array de configuração nativo do ADI ou de uma `Config`, e em seguida a
primeira `Connection`, os `Pools` e o `Pool` primário para `Config->driver`. `$drivers` é o
registry `Drivers` do paradigma; cada fachada passa o seu.

```php
withdraw (Operation ...$Operations): void
```

Retira operações localmente porque quem as chamou parou de esperar — nada é enviado ao servidor
(veja [Operações retiradas](/manual/ADI/Database/Pool/overview/#operações-retiradas)). As operações
estacionadas vão primeiro, depois as que ainda não estão lendo, por fim os leitores em pipeline,
cada uma pelo próprio pool. Todas são tentadas; a primeira falha é relançada depois que todas
rodaram. Desde a 1.0.5.

```php
public Config $Config
```

A configuração da conexão.

```php
public Pool $Pool
```

O pool do endpoint configurado; réplicas de leitura têm os seus (`SQL->ReplicaPools`).

```php
public Pools $Pools
```

Os pools registrados por nome de driver.

```php
public Connection $Connection
```

A primeira conexão, que o pool primário abre primeiro.

```php
public string $drivers
```

A classe `Drivers` do paradigma (`class-string<Drivers>`).

### Operation

`Bootgly\ADI\Database\Operation`. As fachadas criam as operações; pools e drivers chamam os métodos
abaixo.

```php
__construct (null|Connection $Connection, array $parameters = [], float $timeout = 0.0)
```

Cria uma operação pendente. Um `$timeout` positivo fixa o `deadline` dela agora; `0.0` não lhe dá
nenhum.

```php
await (Readiness $Readiness): self
```

Registra o que a operação espera em seguida: um socket, uma direção e um deadline.

```php
resolve (Result $Result): self
```

Termina a operação com um `Result` (estado `Finished`) e acorda quem aguarda estacionado.

```php
fail (string $error): self
```

Termina a operação com um `error` (estado `Failed`) e acorda quem aguarda estacionado.

```php
retry (null|Connection $Connection = null): self
```

Rearma a operação para outra tentativa: de volta a `Pending` na `$Connection` (nenhuma por padrão),
com um deadline novo a partir do próprio `timeout` e com `Pool`, driver, readiness, `Result`,
`error`, `finished`, `cancelled` e `quarantine` zerados. Ela mantém `revoked` — outra tentativa não
desfaz uma retirada — e `fallback`. Uma operação SQL também limpa `code` e o estado de protocolo que
o driver preencheu.

```php
expire (): bool
```

Falha a operação com `Database operation timed out after <timeout> seconds.` quando o deadline já
passou, e retorna `true`; retorna `false` quando ela terminou, não tem prazo ou ainda tem tempo.

### Operações SQL

`Bootgly\ADI\Databases\SQL\Operation` estende `Operation`.

```php
__construct (null|Connection $Connection, string $sql, array $parameters = [], float $timeout = 0.0)
```

Cria uma operação SQL pendente para `$sql`, guardado em `SQL`.

```php
fail (string $error, null|string $code = null): self
```

Falha a operação com um `error` e o `code` do driver, e então anuncia `Events::Failed` — uma vez,
mesmo quando uma falha posterior substitui a mensagem.

```php
public static float $slow
```

Limite de query lenta em segundos: uma operação que resolve depois de pelo menos esse tempo emite
`Events::Slow`. `0.0`, o padrão, desliga a verificação.

### Result

`Bootgly\ADI\Database\Operation\Result`.

```php
__construct (string $status = '', array $rows = [], array $columns = [], int $affected = 0, int|string $inserted = 0)
```

Cria um resultado. Os drivers o montam quando uma operação resolve; cada argumento corresponde ao
campo de mesmo nome.

```php
public array $row { get; }
```

A primeira linha, ou `[]` quando não há nenhuma.

```php
public mixed $cell { get; }
```

A primeira célula da primeira linha, ou `null` quando não há nenhuma.

```php
public int $count { get; }
```

O número de linhas.

```php
public bool $empty { get; }
```

`true` quando nenhuma linha foi retornada.
