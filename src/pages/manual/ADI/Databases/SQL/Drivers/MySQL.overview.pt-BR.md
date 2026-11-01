# Driver MySQL

`Bootgly\ADI\Databases\SQL\Drivers\MySQL` implementa o protocolo cliente do MySQL de forma
nativa — handshake, autenticação, TLS, protocolos de texto e binário (prepared) — com zero
dependências. Ele conversa com **MySQL 5.7+/8.x** e **MariaDB**.

Esta página cobre o que é próprio do MySQL. As chaves de conexão, os padrões delas e os modos de
TLS estão em **[Configuração do banco](/manual/ADI/Database/Config/overview/)**; executar uma query e
ler o resultado dela, em **[Banco SQL](/manual/ADI/Databases/SQL/overview/)**; esperas, prazos,
cancelamento e retirada, em **[Pool de conexões](/manual/ADI/Database/Pool/overview/)**.

## Conectando

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'mysql',
   'host' => '127.0.0.1',
   'port' => 3306,
   'database' => 'app',
   'username' => 'root',
   'password' => 'secret',
]);

$Operation = $Database->await($Database->query('SELECT VERSION() AS version'));
$Operation->Result->cell; // '8.4.11'
```

O array define `port` e `username` porque os padrões são os de um PostgreSQL local, seja qual for
o `driver` — omitidos, eles conectam em `127.0.0.1:5432` como `postgres` (veja
**[Chaves e padrões](/manual/ADI/Database/Config/overview/#chaves-e-padrões)**). Um array serve a um
script fora de um projeto. Em um projeto, crie a fachada a partir do escopo de config `database`, e
em uma rota `HTTP_Server_CLI` use o `$Response->Database` — veja
**[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**. O `query()` retorna uma
`Operation` pendente, e o `await()` a conduz até o fim e a retorna.

Toda sessão usa o character set `utf8mb4` com a collation `utf8mb4_general_ci` (o que o
`@@collation_connection` informa), que não é configurável por enquanto.

## Autenticação

O driver suporta os dois plugins de senha, incluindo uma troca de plugin solicitada pelo servidor:

- `mysql_native_password` — challenge-response SHA1;
- `caching_sha2_password` (o padrão do MySQL 8) — o fast path SHA256 enquanto o servidor tem a
  senha do usuário em cache; senão, o caminho de **full authentication** — a primeira conexão de um
  usuário após um restart do servidor ou um `FLUSH PRIVILEGES` — envia a senha por TLS, ou a
  criptografa com uma **chave pública RSA do servidor pinada** em plaintext.

Qualquer outro plugin — `sha256_password`, `mysql_clear_password`, o `ed25519` do MariaDB — falha a
conexão com `MySQL authentication plugin is not supported: sha256_password.`, que nomeia o plugin.
Um `password` vazio escapa dessa verificação: o driver então responde a qualquer plugin com uma
resposta vazia e deixa o veredito com o servidor, então uma conta `sha256_password` sem senha
conecta.

> **Segurança** — em plaintext o driver nunca solicita a chave RSA ao servidor: um MITM
> ativo poderia substituir a chave pela dele e descriptografar a senha. O mesmo atacante a
> lê por um handshake TLS sem verificação (`prefer`/`require` sem `verify` — o padrão de
> fábrica), então verifique o certificado em qualquer rede não confiável (veja [TLS](#tls)).
> Full authentication sem TLS falha com
> ``MySQL caching_sha2_password full authentication over plaintext requires TLS or a pinned server public key (secure `key`).``
> a menos que você pine a chave pública do servidor localmente:

```php
$Database = new SQL([
   'driver' => 'mysql',
   'host' => '127.0.0.1',
   'port' => 3306,
   'database' => 'app',
   'username' => 'root',
   'password' => 'secret',
   'secure' => [
      'mode' => 'disable',
      'key' => '/etc/app/mysql-server-public.pem',
   ],
]);
```

O `key` aceita um caminho de arquivo, uma URL `file://` ou o próprio texto PEM; uma chave que não
pode ser carregada falha a conexão com `MySQL server RSA public key is invalid.` Uma imagem `mysql:8`
de estoque guarda a chave em `/var/lib/mysql/public_key.pem`, e
`SHOW STATUS LIKE 'Caching_sha2_password_rsa_public_key'` a retorna por uma conexão em que você
confia.

Na config do Demo o pin vincula à chave de ambiente `DB_SERVER_PUBLIC_KEY`. Em rotas HTTP que
usam `Database::provide()`, essa chave não pode vir atualmente de um arquivo `.env`: ela não está
entre as chaves de `.env` que `provide()` aceita, então em `configs/database/.env` ela faz o
escopo falhar ao carregar com o erro `Enable DB_ENABLED=true…`. Defina-a no ambiente do processo,
escreva a chave como o `default:` literal de `Secure->Key` no `database.Config.php` ou construa o
resource com uma factory sua (scripts e `bootgly project … migrate` / `seed` a leem do `.env` sem
problema; veja
**[Chaves que um `.env` pode definir](/guide/database-dbal/overview/#chaves-que-um-env-pode-definir)**).
Com TLS ativo (`secure.mode` ≠ `disable`) nenhum pin é necessário. Note que só o caminho *full* é
afetado: o fast path do dia a dia funciona em plaintext com o scramble normal.

## TLS

O greeting do servidor diz se ele oferece TLS, e o driver passa para TLS antes de autenticar. Os
modos e as chaves `verify`, `name`, `peer` e `cafile` funcionam como
**[TLS](/manual/ADI/Database/Config/overview/#tls)** descreve; no MySQL:

- `disable` nunca pede TLS.
- Um greeting que não oferece TLS é uma recusa. Sob `prefer` a sessão segue em plaintext; sob
  `require`, `verify-ca` e `verify-full` a conexão falha com `MySQL server refused required TLS.`
- Um handshake que falha — inclusive por um certificado que as verificações rejeitam — falha a
  conexão em qualquer modo, com `MySQL TLS handshake failed:` e o diagnóstico do OpenSSL. O driver
  nunca volta para plaintext.

Uma imagem `mysql:8` de estoque oferece TLS com certificados que ela mesma gera, então `prefer` e
`require` a alcançam já na primeira conexão. Para verificá-la, copie a CA dela para fora do
container (`/var/lib/mysql/ca.pem`) e fixe-a:

```php
$Database = new SQL([
   'driver' => 'mysql',
   'host' => '127.0.0.1',
   'port' => 3306,
   'database' => 'app',
   'username' => 'root',
   'password' => 'secret',
   'secure' => ['mode' => 'verify-ca', 'cafile' => '/etc/app/mysql-ca.pem'],
]);
```

O `verify-full` confere também o nome, e o certificado de servidor gerado traz
`MySQL_Server_<version>_Auto_Generated_Server_Certificate`, não o seu host — no MySQL 8.4.11 o
handshake falha com
``MySQL TLS handshake failed: stream_socket_enable_crypto(): Peer certificate CN=`MySQL_Server_8.4.11_Auto_Generated_Server_Certificate' did not match expected CN=`127.0.0.1'``.
Dê ao servidor um certificado para o nome do host dele, ou defina esse nome como `peer`.

## Parâmetros

Os placeholders são `?`, e os valores se ligam na ordem do array — as chaves são ignoradas:

```php
use DateTimeImmutable;

$Database->await($Database->query(
   'CREATE TABLE events (id INT PRIMARY KEY, title VARCHAR(100), starts DATETIME(6), score DOUBLE, archived BOOLEAN)'
));

$Database->await($Database->query(
   'INSERT INTO events (id, title, starts, score, archived) VALUES (?, ?, ?, ?, ?)',
   [1, 'Launch', new DateTimeImmutable('2026-11-05 09:30:00.123456'), 9.5, false]
));

$Operation = $Database->await($Database->query('SELECT title, score, archived FROM events WHERE id = ?', [1]));
$Operation->Result->row; // ['title' => 'Launch', 'score' => 9.5, 'archived' => 0]
```

Cada valor é ligado com o tipo para o qual o tipo PHP dele mapeia:

| Valor PHP | Ligado como |
| --- | --- |
| `int` | `BIGINT` |
| `float` | `DOUBLE` |
| `bool` | `TINYINT`: `1` ou `0` |
| `null` | `NULL` |
| `string` | `VAR_STRING` |
| `DateTimeInterface` | `VAR_STRING`, formatado `Y-m-d H:i:s.u` no fuso horário do próprio objeto — o offset é descartado |

Um array, ou um objeto que não é `DateTimeInterface` — inclusive um `Stringable` —, falha a operação
com `MySQL cannot bind the parameter at position 1.`, contando as posições a partir de `0`; o
`await()` a lança, e a conexão continua utilizável — também quando o comando foi composto enquanto
o `COM_STMT_PREPARE` do mesmo SQL ainda estava em voo, e só liga os valores ao chegar à cabeça da
fila.
**[Tipos SQL](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** compara esses binds com os do
PostgreSQL e do SQLite.

Passe exatamente um valor por placeholder. O driver confere a contagem com os placeholders que o
servidor declarou ao preparar o statement, e falha a operação antes de o statement rodar, sem
código de erro do servidor (`code` é `null`): `SELECT ? AS a, ? AS b` ligado com `[1, 2, 3]` falha
com `MySQL statement expects 2 parameters, 3 given.`, e ligado com `[5]` com
`MySQL statement expects 2 parameters, 1 given.` Valores para um SQL sem placeholder falham do mesmo
jeito (`expects 0 parameters`). O statement continua em cache: ele é válido, só a chamada está
errada.

## Prepared statements

Uma query com parâmetros roda pelo protocolo binário: `COM_STMT_PREPARE` uma vez, depois
`COM_STMT_EXECUTE` a cada execução, com um cache LRU de statements por conexão indexado pelo texto
SQL (chave de config `statements`, padrão `256`). Em uma tabela `users`:

```php
$Database->await($Database->query(
   'CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, mail VARCHAR(100), active BOOLEAN)'
));

$Database->await($Database->query(
   "INSERT INTO users (name, mail, active) VALUES ('Ada', 'ada@bootgly.com', TRUE)"
));

$Operation = $Database->await($Database->query(
   'SELECT id, name FROM users WHERE mail = ? AND active = ?',
   ['ada@bootgly.com', true]
));
$Operation->Result->row; // ['id' => 1, 'name' => 'Ada']
```

- Acima do limite, o statement usado há mais tempo é removido; o `COM_STMT_CLOSE` dele sai à frente
  do próximo comando que a conexão escrever.
- `statements => 0` desliga o cache: cada comando parametrizado prepara um statement próprio,
  fechado à frente do próximo comando que a conexão escrever.

Uma query sem parâmetros sai como um único `COM_QUERY` e não prepara nada.

## Resultados

Uma query sem parâmetros lê as linhas pelo protocolo de texto, uma com parâmetros pelo protocolo
binário; nos dois, elas são convertidas pelo tipo da coluna:

- `TINYINT` — `BOOLEAN` incluído —, `SMALLINT`, `MEDIUMINT`, `INT`, `BIGINT` e `YEAR` → `int`; um
  `BIGINT UNSIGNED` além de `PHP_INT_MAX` → uma `string` decimal exata;
- `FLOAT` e `DOUBLE` → `float`; `DECIMAL` → `string`, então nenhum dígito se perde;
- `DATE`, `DATETIME` e `TIMESTAMP` → `DateTimeImmutable`; uma data zero (`0000-00-00`) continua
  string;
- `TIME` → `string`, já que uma duração pode passar de 24 horas (`'838:59:59'`);
- qualquer outro tipo, como `JSON`, `ENUM`, `SET` ou texto → uma `string`; `BIT` e `BLOB` → os bytes
  raw.

Um `BOOLEAN`, portanto, volta como `1` ou `0`, não como `true` ou `false`. Um `FLOAT`, que o MySQL
guarda em precisão simples, lê `1.1` no protocolo de texto e `1.100000023841858` no binário.
**[Tipos SQL](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** põe essas conversões lado a lado com
as do PostgreSQL e do SQLite.

## Chaves geradas

MySQL não tem `RETURNING` — o Query Builder bloqueia `output()` por design. O id gerado
chega em `Result->inserted`, e o ORM preenche as chaves das entidades automaticamente. Na tabela
`users` acima:

```php
$Insert = $Database->await($Database->query("INSERT INTO users (name) VALUES ('Grace')"));
$Insert->Result->inserted; // 2
```

O `inserted` é o valor `AUTO_INCREMENT` que o statement gerou — o primeiro, em um `INSERT` de várias
linhas. Ele segue a mesma regra dos valores de linha acima: `int` para todo id dentro de
`PHP_INT_MAX` e string decimal exata acima disso, já que uma chave `BIGINT UNSIGNED` além de
2^63 não cabe em um int do PHP. Uma chave de entidade que precise aceitar esses ids é
declarada `null|int|string`.

## Transações

Transações e savepoints fixam uma conexão do pool — sem código específico de driver:

```php
$Database->await($Database->query('CREATE TABLE accounts (id INT PRIMARY KEY, balance INT)'));
$Database->await($Database->query('INSERT INTO accounts (id, balance) VALUES (1, 500)'));

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1]));
$Database->await($Transaction->commit());
```

> **Commits implícitos** — o MySQL comita a transação aberta sempre que um statement DDL
> (`CREATE`/`ALTER`/`DROP` ...) roda dentro dela. Por isso as migrations de Schema rodam
> fora de transações no MySQL; a coordenação usa advisory locks `GET_LOCK`.

## Fila de comandos

O protocolo MySQL é estritamente request-response: não há pipelining no wire. Operações
co-localizadas entram em uma FIFO onde só a cabeça possui o socket, e o próximo comando é escrito
quando a cabeça tem a resposta — `check()` reporta o estado ocupado ao Pool e `drain()` expõe
operações completadas por leituras das irmãs.

Em uma falha de transporte (erro de escrita/leitura no socket, peer fechado, corrupção de
framing) o driver falha todas as operações enfileiradas, reseta o estado da sessão e
desconecta, para que o Pool descarte a conexão morta em vez de mantê-la ocupada.

## Cancelamento

Um cancel só alcança o servidor quando o statement já está lá. Em um pool que ainda não abriu a
conexão, avance a operação até ela estar em `Reading` — o comando escrito — e cancele-a então:

```php
use Bootgly\ADI\Database\Operation\OperationStates;

$Running = $Database->query('SELECT SLEEP(30) AS slept');

while ($Running->finished === false && $Running->state !== OperationStates::Reading) {
   $Database->advance($Running);
   usleep(1000);
}

$Database->cancel($Running);

$Database->await($Running)->Result->row; // ['slept' => 1]
```

O `cancel()` abre uma segunda conexão para o mesmo `host` e `port`, a autentica como o mesmo
usuário, envia `KILL QUERY` com o thread id que o greeting do servidor deu à sessão e lê a resposta,
depois fecha essa conexão; o `cancelled` é marcado assim que o servidor aceita o kill. O kill é
advisory: a operação ainda resolve ou falha na própria conexão. Uma função pode só retornar antes —
o `SLEEP()` retorna `1`, como acima — e a operação termina normalmente; um statement interrompido
enquanto lê ou calcula linhas falha, em vez disso, com `1317: Query execution was interrupted`
(`code` `1317`).

- O kill só sai para o comando que a sessão está executando: a cabeça da fila, inteira no wire.
  Qualquer outra coisa ainda não está no servidor, e o pool a retira localmente com
  `Database operation was cancelled before reaching the server.`: um comando enfileirado atrás de
  outro, que simplesmente sai da fila; uma operação ainda discando ou autenticando, que leva junto a
  conexão semiaberta dela; e um comando parametrizado enquanto só o `COM_STMT_PREPARE` dele saiu.
  Esse já aparece em `Reading`, porque o driver só escreve o `COM_STMT_EXECUTE` dele quando o
  prepare é respondido, e nunca é executado. Um único `advance()` em um pool frio só começa a
  discagem, então um cancel logo depois dele retira a operação.
- Um comando ainda sendo escrito é deixado rodando: o resto dele precisa seguir, ou a sessão morre
  com todo comando enfileirado nela. O mesmo vale para um comando cujo kill o servidor recusa — com
  `Unknown thread id`, por exemplo, de um servidor que não conhece mais a sessão. Nos dois casos o
  `cancel()` devolve a operação intocada, `cancelled` ainda `false`, e você ainda a aguarda.
- O side channel é mais uma sessão no servidor enquanto dura, então conta contra o
  `max_connections`. O connect, as leituras e as escritas dele bloqueiam o worker, o connect por no
  máximo `timeout` (veja **[Timeout](/manual/ADI/Database/Config/overview/#timeout)**). Quando ele
  não consegue conectar, a operação falha com `MySQL cancel connection failed: Connection refused.`
  — o motivo varia — enquanto o statement continua rodando no servidor.
- O side channel ignora o `secure` e roda sempre em plaintext, então suporta só os fast paths de
  autenticação. Um usuário cuja senha o servidor não tem mais em cache o falha com
  `MySQL cancel requires fast authentication on the side channel.`, e um usuário criado com
  `REQUIRE SSL`, com `MySQL cancel authentication rejected.`; nos dois casos o statement continua
  rodando.

O que o pool faz com uma operação que não chegou ao servidor, com uma que já terminou, ou com um
cancel que não pode ser enviado está em
**[Cancele um statement em execução](/manual/ADI/Database/Pool/overview/#cancele-um-statement-em-execução)**.

> [!WARNING]
> Por enquanto, um kill que chega enquanto o servidor ainda envia as definições de coluna de um
> resultado falha a operação com um erro do driver que começa com
> `MySQL length-encoded string overruns the packet:` em vez de `1317`, e derruba a sessão junto com
> todo comando enfileirado nela.

## Limites

- **Um statement por query.** O driver não habilita multi-statements, então uma string com dois
  statements — `SELECT 1 AS a; SELECT 2 AS b` — falha antes de qualquer parte rodar:
  `1064: You have an error in your SQL syntax; …`.
- **Stored procedures.** O `CALL` retorna o primeiro result set da procedure e drena os outros, então
  a sessão continua utilizável.
- **Sem `LOAD DATA LOCAL INFILE`.** O driver não oferece arquivos locais, então o servidor recusa o
  statement — `3948: Loading local data is disabled; this must be enabled on both the client and server sides`,
  mesmo com `local_infile` ligado — e a sessão continua utilizável. Um servidor que pede um arquivo
  mesmo assim tem a sessão fechada: o statement, e todo comando enfileirado atrás dele, falha com
  `MySQL LOCAL INFILE requests are not supported.`
- **Linhas alteradas.** O `affected` conta as linhas que um statement alterou, não as que ele
  encontrou: um `UPDATE` que grava um valor que a linha já tem conta `0` para ela.

Os três drivers são comparados em **[Drivers SQL](/manual/ADI/Databases/SQL/Drivers/overview/)**.

## Erros

Um erro do servidor chega ao `error` como `<errno>: <message>` e ao `code` como o errno (veja
**[Leia o resultado](/manual/ADI/Databases/SQL/overview/#leia-o-resultado)**) — inclusive o erro que o
servidor envia no lugar do greeting, como `1040: Too many connections`. As falhas do próprio driver
não têm `code`:

| Mensagem | Causa |
| --- | --- |
| `MySQL connection failed: 127.0.0.1:3306 refused the connection (ECONNREFUSED).` | Nada escuta em `host`:`port` |
| `MySQL server does not support protocol 4.1.` | O servidor é anterior ao protocolo 4.1 |
| `MySQL server refused required TLS.` | O greeting não oferece TLS sob `require`, `verify-ca` ou `verify-full` |
| `MySQL TLS handshake failed: …` | O handshake ou uma verificação do certificado falhou |
| `MySQL authentication plugin is not supported: sha256_password.` | A conta usa outro plugin, e o `password` não está vazio |
| ``MySQL caching_sha2_password full authentication over plaintext requires TLS or a pinned server public key (secure `key`).`` | Full authentication sem TLS nem `key` pinada |
| `MySQL server RSA public key is invalid.` | A `key` pinada não pode ser carregada |
| `MySQL cannot bind the parameter at position 1.` | Um parâmetro array ou objeto |
| `MySQL LOCAL INFILE requests are not supported.` | O servidor pediu um arquivo local |
| `MySQL cancellation requires the greeting thread id.` | `cancel()` num comando em execução de uma sessão cujo greeting o driver nunca leu |
| `MySQL cancel connection failed: Connection refused.` | O side channel do cancel não conseguiu conectar |
| `MySQL cancel requires fast authentication on the side channel.` | O side channel precisa de full authentication |
| `MySQL cancel authentication rejected.` | O servidor recusou o login do side channel |

## Referência

O driver da conexão de uma operação é o `$Operation->Protocol`. O Pool chama os métodos dele; uma
aplicação lê as propriedades.

```php
query (string $sql, array $parameters = []): Operation
```

Cria uma operação pendente. Sem parâmetros usa o protocolo de texto (`COM_QUERY`); com
parâmetros, o protocolo binário de prepared statements.

```php
prepare (Operation $Operation): Operation
```

Monta o comando de wire da operação — `COM_QUERY`, um `COM_STMT_EXECUTE` cacheado, ou
`COM_STMT_PREPARE` em um miss do cache de statements.

```php
advance (Operation $Operation): Operation
```

Conduz a máquina de estados da conexão: greeting, negociação de capabilities, TLS,
handshake response, continuações de autenticação, escrita do comando e leitura do result
set.

```php
owe (Operation $Operation): bool
```

Se o servidor deve uma resposta à operação, o que o Pool pergunta antes de enviar um cancel. Só a
cabeça da fila escreve, então é `true` para a cabeça quando o comando dela está inteiro no wire —
para um comando parametrizado em um miss do cache de statements, quando o `COM_STMT_EXECUTE` dele
está, não só o `COM_STMT_PREPARE` que vem antes — e para uma cabeça escrita pela metade, cujo
restante precisa seguir. Um comando enfileirado atrás da cabeça, e uma sessão ainda no handshake,
não têm nada a receber: o Pool os retira localmente.

```php
cancel (Operation $Operation): Operation
```

Mata o comando que a sessão está executando — a cabeça, inteira no wire (`owe()`) — por uma sessão
separada, em plaintext (`KILL QUERY`), e marca a operação como `cancelled` quando o servidor
responde ao kill com OK. Qualquer outra operação, e uma cujo kill o servidor recusa, é devolvida
intocada, com `cancelled` `false`. Falha a operação com
`MySQL cancellation requires the greeting thread id.` quando o driver nunca leu o greeting da
sessão, e com uma das mensagens `MySQL cancel …` acima quando o side channel não consegue conectar
ou entrar.

```php
abandon (Operation $Operation): void
```

Reconcilia o wire quando o Pool finaliza uma operação de fora — um deadline vencido, um
cancel que nunca chegou ao servidor, um teardown de transação — enquanto o servidor ainda
está respondendo a ela. Drenar exige um leitor, então a sessão só é mantida enquanto uma irmã viva
está enfileirada atrás da cabeça para bombear a resposta (e uma irmã que sai da FIFO atrás de
uma cabeça stand-in só a mantém enquanto outra irmã permanece atrás dessa cabeça). Sem
nenhuma, a sessão é derrubada, e é isso que devolve o slot de conexão. Todos os outros casos
reconciliam como o `detach()`.

```php
detach (Operation $Operation): void
```

Reconcilia o wire quando um chamador para de esperar por uma operação (`Pool::withdraw()`:
uma resposta deferred cuja espera foi recusada ou interrompida, ou cujo Fiber da requisição
foi destruído), e quando o `Pool::cancel()` retira uma à qual o servidor não deve nada
(`owe()`). Uma irmã enfileirada simplesmente sai da FIFO; a cabeça é entregue a um stand-in
destacado que drena a resposta — para uma cabeça com só o `COM_STMT_PREPARE` fora, o
prepare-OK, e o `COM_STMT_EXECUTE` dela nunca é escrito —, de modo que a operação retomada pelo
Pool nunca mais é lida, escrita ou resolvida. Nenhum leitor é exigido: o `check()` ignora uma
cabeça stand-in, então a conexão volta para `idle` — a menos que outros chamadores ainda leiam
ali — e a próxima operação entregue a ela entra na fila atrás do stand-in e o bombeia; o
`$detached` informa que a sessão ainda deve a resposta do stand-in. Só um comando que
nunca chegou inteiro ao wire derruba a sessão.

```php
reset (): bool
```

Escreve o reset de sessão `DO RELEASE_ALL_LOCKS()`, que libera todo lock nomeado (`GET_LOCK`) que a
sessão segura. O Pool o pede ao devolver uma sessão marcada a `idle`, onde ninguém mais deve
trabalho nela. O servidor o lê assim que termina a resposta em andamento, mesmo que ninguém leia, e
o OK dele — ou o ERR de um servidor sem essa função — é absorvido como o de um stand-in antes de
qualquer comando enfileirado ser escrito (o `$detached` o conta). Ele fica atrás de uma cabeça cujo
comando está inteiro no wire e à frente de todo comando ainda não escrito. Um comando pela metade no
wire nunca é intercalado: o reset é recusado. Um reset ainda devido cobre todo pedido posterior: só
a cabeça escreve, e um comando enfileirado só vira a cabeça depois que o reset é drenado, então o
que está enfileirado atrás dele nunca chegou ao servidor. Retorna `false` quando é recusado, quando
o stream aceita menos que o reset inteiro, ou quando a sessão sumiu, e o Pool então corta a sessão.
Variáveis de sessão (`SET`) não são resetadas.

```php
check (): bool
```

Se o driver ainda deve trabalho a um chamador, de modo que o Pool não pode emprestar a conexão
ainda: um comando enfileirado ou em andamento pelo qual alguém espera. Uma cabeça stand-in e um
reset de sessão pendente não contam.

```php
drain (): array
```

Retorna as operações que terminaram enquanto o driver lia em nome de outra — irmãs enfileiradas
respondidas enquanto a cabeça era bombeada — e as esquece, para que o Pool libere os slots delas.

```php
sever (Operation $Operation, string $error): void
```

Encerra a sessão: falha toda operação que ela ainda deve com `$error` e desconecta. O Pool o chama
quando um statement que ele retirou deixou o servidor em um estado que ninguém consegue resolver,
como um teardown de transação que nunca chegou.

```php
public private(set) int $thread
```

O thread id da sessão, vindo do greeting do servidor — o que o `CONNECTION_ID()` retorna e o que o
`KILL QUERY` nomeia; `0` até o greeting chegar.

```php
public private(set) string $version
```

A versão do servidor que o greeting anunciou, como `8.4.11`.

```php
public private(set) string $plugin
```

O plugin de autenticação da sessão: o que o greeting propôs, ou aquele para o qual o servidor
trocou.

```php
public bool $detached { get; }
```

Se a sessão ainda deve a resposta de uma cabeça stand-in destacada, ou de um reset de sessão escrito
atrás dela.
