# Driver PostgreSQL

`Bootgly\ADI\Databases\SQL\Drivers\PostgreSQL` implementa o PostgreSQL Protocol 3.0 de
forma nativa — startup, autenticação, TLS, protocolos simple e extended query, pipelining
e cancelamento — com zero dependências. É o driver padrão do Bootgly.

Esta página cobre o que é próprio do PostgreSQL. As chaves de conexão, os padrões delas e os modos
de TLS estão em **[Configuração do banco](/manual/ADI/Database/Config/overview/)**; executar uma query
e ler o resultado dela, em **[Banco SQL](/manual/ADI/Databases/SQL/overview/)**; esperas, prazos,
cancelamento e retirada, em **[Pool de conexões](/manual/ADI/Database/Pool/overview/)**.

## Conectando

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'postgres',
   'password' => 'secret',
]);

$Operation = $Database->await($Database->query(
   "SELECT current_setting('server_version') AS version, current_setting('application_name') AS application"
));
$Operation->Result->row; // ['version' => '18.6 (Debian 18.6-1.pgdg13+2)', 'application' => 'Bootgly']
```

Um array serve a um script fora de um projeto. Em um projeto, crie a fachada a partir do escopo de
config `database`, e em uma rota `HTTP_Server_CLI` use o `$Response->Database` — veja
**[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**. O `query()` retorna uma
`Operation` pendente, e o `await()` a conduz até o fim e a retorna.

Toda sessão começa com `client_encoding` em `UTF8` e `application_name` em `Bootgly`, o nome que o
`pg_stat_activity` mostra para ela. Nenhum dos dois é configurável por enquanto.

## Autenticação e TLS

O driver responde ao método de autenticação que o servidor pede: **cleartext**, **MD5** ou
**SCRAM-SHA-256**. O channel binding não é negociado, então um servidor que oferece só
`SCRAM-SHA-256-PLUS` falha a conexão com `PostgreSQL SCRAM-SHA-256 mechanism is not available.`
Qualquer outro método — Kerberos, GSSAPI, SSPI — falha a conexão com
`PostgreSQL authentication method is not supported: 7.`, em que o número é o código de método que o
servidor enviou.

O TLS é negociado com um `SSLRequest`, antes da mensagem de startup. Os modos e as chaves `verify`,
`name`, `peer` e `cafile` funcionam como **[TLS](/manual/ADI/Database/Config/overview/#tls)**
descreve: `peer` é o nome que o certificado precisa ter, também enviado como SNI, e só o `cafile`
fixa a CA que precisa tê-lo assinado. No PostgreSQL:

- `disable` não envia `SSLRequest`.
- Um servidor que recusa o TLS responde ao pedido com `N`. Sob `prefer` a sessão segue em
  plaintext; sob `require`, `verify-ca` e `verify-full` a conexão falha com
  `PostgreSQL server refused required TLS.`
- Um handshake que falha depois que o servidor aceitou — inclusive por um certificado que as
  verificações rejeitam — falha a conexão em qualquer modo, com `PostgreSQL TLS handshake failed:` e
  o diagnóstico do OpenSSL. O driver nunca tenta de novo em plaintext.

Quando um servidor recusa o `SSLRequest` sob `prefer` e depois pede uma senha **cleartext** ou
**MD5**, o driver não a envia — um atacante no caminho consegue forçar exatamente essa recusa — e
falha a conexão com um erro que nomeia `secure.mode => 'disable'`, a forma declarada de autenticar
em plaintext. SCRAM-SHA-256 nunca envia a senha e segue — num piso de 4096 iterações (o padrão do
PostgreSQL e o mínimo da RFC 7677; uma contagem menor é recusada do mesmo jeito, já que sua prova
seria tão quebrável offline quanto uma resposta MD5, e uma contagem repetida ou malformada falha a
conexão) — e em qualquer sessão nunca acima de 10.000.000 de iterações, que travariam o worker. Um
host de loopback (`127.0.0.0/8`, `::1`, `localhost`) fica isento, já que ali não há atacante entre o
cliente e o servidor; cada réplica de leitura é julgada pelo próprio host e modo. Desde a 1.0.10.

## Parâmetros

Os placeholders são numerados — `$1`, `$2` … — e os valores se ligam na ordem do array:

```php
$Database->await($Database->query(
   'CREATE TABLE events (id int PRIMARY KEY, title text, starts timestamptz, score float8, archived bool)'
));

$Database->await($Database->query(
   'INSERT INTO events (id, title, starts, score, archived) VALUES ($1, $2, $3, $4, $5)',
   [1, 'Launch', '2026-11-05 09:30:00-03:00', 9.5, false]
));

$Operation = $Database->await($Database->query('SELECT title, score FROM events WHERE id = $1', [1]));
$Operation->Result->row; // ['title' => 'Launch', 'score' => 9.5]
```

As chaves são ignoradas — só a ordem conta, então `['b' => 2, 'a' => 1]` liga `2` ao `$1`. Um valor
que falta falha com
`bind message supplies 1 parameters, but prepared statement "bootgly_…" requires 2` (`08P01`). Um
`int`, `bool` ou `float` que sobra é aceito e fica sem uso; uma string ou um `null` que sobra falha
com `could not determine data type of parameter $2` (`42P18`), já que nada no SQL lhe dá um tipo.
Cada valor dá um tipo ao seu placeholder quando o statement é analisado:

| Valor PHP | Tipo do placeholder |
| --- | --- |
| `int` | `integer`, ou `bigint` quando o valor não cabe em `integer` |
| `bool` | `boolean` |
| `float` | `double precision` |
| `string` | nenhum: o servidor o infere |
| `null` | nenhum, a menos que o SQL faça cast do placeholder: `$1::int` |

Uma string ou um `null` não tem tipo próprio, então o servidor infere um a partir de onde o
placeholder está — a coluna com que é comparado ou em que é gravado, um operador, um cast
`$N::type`. `'1'` casa com uma coluna `integer`; `'abc'` falha ali com
`invalid input syntax for type integer: "abc"` (`22P02`). Um `int` não se adapta do mesmo jeito:
comparado com uma coluna `text`, ele falha com `operator does not exist: text = integer`
(`42883`) — ligue uma string, ou faça o cast do placeholder: `$1::text`. Onde nada dá um tipo a uma
string ou a um `null` — um `$1 IS NULL` sozinho, ou uma função que aceita qualquer tipo, como
`jsonb_build_object()` — o statement falha com `could not determine data type of parameter $1`
(`42P18`). Faça o cast do placeholder:

```php
$Operation = $Database->await($Database->query(
   "SELECT jsonb_build_object('note', $1::text) AS doc",
   [null]
));
$Operation->Result->cell; // '{"note": null}'
```

Valores `DateTimeInterface`, arrays e objetos — inclusive os `Stringable` — são recusados: o
`query()` falha a operação com `PostgreSQL parameter must be scalar or null.` antes de qualquer
envio, e o `await()` a lança. Formate a data antes, mantendo o offset (`P`): sem ele, um
`timestamptz` lê o texto no fuso horário da sessão e grava outro instante.

```php
use DateTimeImmutable;
use RuntimeException;

$Starts = new DateTimeImmutable('2026-11-05 09:30:00-03:00');

try {
   $Database->await($Database->query('UPDATE events SET starts = $1 WHERE id = $2', [$Starts, 1]));
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // PostgreSQL parameter must be scalar or null.
}

$Database->await($Database->query(
   'UPDATE events SET starts = $1 WHERE id = $2',
   [$Starts->format('Y-m-d H:i:s.uP'), 1]
));
```

Colunas de data e hora continuam voltando como `DateTimeImmutable` (veja
[Resultados](#resultados)), então um valor lido de uma delas precisa ser formatado antes de ser
ligado de novo. Pelo mesmo motivo, uma entidade do ORM com uma coluna `DateTimeImmutable` gravável
falha no `save()` com a mesma mensagem, por enquanto. MySQL e SQLite ligam uma data como ela é;
**[Tipos SQL](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** compara os três drivers.

## Prepared statements

Uma query com parâmetros roda pelo protocolo estendido (`Parse`/`Bind`/`Describe`/`Execute`/
`Sync`), e cada conexão mantém um cache LRU dos statements que analisou (chave de config
`statements`, padrão `256`). Em uma tabela `users`:

```php
$Database->await($Database->query(
   'CREATE TABLE users (id serial PRIMARY KEY, name text NOT NULL, mail text, active bool)'
));

$Database->await($Database->query(
   "INSERT INTO users (name, mail, active) VALUES ('Ada', 'ada@bootgly.com', true)"
));

$Operation = $Database->await($Database->query(
   'SELECT id, name FROM users WHERE mail = $1 AND active = $2',
   ['ada@bootgly.com', true]
));
$Operation->Result->row; // ['id' => 1, 'name' => 'Ada']
```

Um statement se chama `bootgly_` seguido do SHA-1 do seu SQL e dos tipos que os parâmetros dele
declararam (veja [Parâmetros](#parâmetros)); o `$Operation->statement` guarda o nome. O mesmo SQL é,
portanto, analisado uma vez por assinatura de tipos: `SELECT $1::int8` ligado com `1` (`integer`) e
com `5000000000` (`bigint`) gera dois statements e ocupa duas entradas do cache.

- A primeira execução de um statement envia todo valor como texto. As seguintes enviam só
  `Bind`/`Execute`/`Sync`, e depois que o servidor descreveu os parâmetros, um boolean, um valor
  `smallint` ou `integer` e um float viajam em binário quando o valor PHP cabe no tipo que o
  servidor informou; todo o resto continua em texto.
- Acima do limite, o statement usado há mais tempo é removido; o `Close` dele sai à frente do
  próximo comando que a conexão escrever.
- `statements => 0` desliga o cache: cada comando parametrizado analisa um statement próprio,
  fechado à frente do próximo comando que a conexão escrever.

Uma query sem parâmetros sai como uma única mensagem `Query` simples e não prepara nada.

## Resultados

As linhas voltam como texto e são convertidas pelo tipo da coluna:

- `boolean` → `bool`; `smallint`, `integer` e `bigint` → `int`; `real` e `double precision` →
  `float`;
- `numeric` → `string`, então nenhum dígito se perde;
- `bytea` → os bytes raw, como `string`;
- `date`, `time`, `timetz`, `timestamp` e `timestamptz` → `DateTimeImmutable` — um `time` ou
  `timetz` com a data de hoje; um valor que o PHP não consegue interpretar, como `infinity`,
  continua string;
- qualquer outro tipo, como `json`, `jsonb`, `uuid`, `interval`, `money` ou um array → o texto do
  servidor, como `'{1,2}'` para um `int[]`.

Por enquanto, um `real` ou `double precision` que guarda `NaN`, `Infinity` ou `-Infinity` volta
como `0.0`, sem erro, embora um `NAN`, `INF` ou `-INF` ligado seja gravado como é. Selecione uma
coluna assim também como texto, e converta no PHP:

```php
$Database->await($Database->query('UPDATE events SET score = $1 WHERE id = $2', [INF, 1]));

$Operation = $Database->await($Database->query(
   'SELECT score, score::text AS score_text FROM events WHERE id = $1',
   [1]
));
$Operation->Result->row; // ['score' => 0.0, 'score_text' => 'Infinity']
```

**[Tipos SQL](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** põe essas conversões lado a lado
com as do MySQL e do SQLite.

## Chaves geradas

O dialeto suporta `RETURNING`: o ORM o anexa ao `INSERT` de uma entidade nova e grava a chave
retornada de volta nessa entidade quando você hidrata a operação. Com a entidade `User` de
**[Repositórios](/manual/ADI/Databases/SQL/overview/#repositórios)**, na tabela `users` acima:

```php
$Users = $Database->map(User::class);

$User = new User;
$User->name = 'Grace';

$Saved = $Users->hydrate($Database->await($Users->save($User)))->entity;

$Saved === $User; // true
$User->id;        // 2
```

O `Result->inserted` fica em `0` no PostgreSQL: leia chaves geradas pelo `RETURNING`.

## Pipelining

Operações co-localizadas fazem pipeline em uma conexão: múltiplos comandos em andamento
compartilham o socket e resolvem em ordem FIFO conforme as mensagens do backend chegam. O
Pool co-localiza operações em conexões ocupadas automaticamente quando o pool está no
limite (veja
**[Saturação e co-localização](/manual/ADI/Database/Pool/overview/#saturação-e-co-localização)**).

Em uma falha de transporte (erro de escrita/leitura no socket, peer fechado, corrupção de
framing) o driver falha todas as operações em pipeline, reseta o estado da sessão e
desconecta, para que o Pool descarte a conexão morta em vez de mantê-la ocupada.

## Cancelamento

Um cancel só alcança o servidor quando o statement já está lá. Em um pool que ainda não abriu a
conexão, avance a operação até ela estar em `Reading` — o statement escrito — e cancele-a então:

```php
use RuntimeException;

use Bootgly\ADI\Database\Operation\OperationStates;

$Running = $Database->query('SELECT pg_sleep(30)');

while ($Running->finished === false && $Running->state !== OperationStates::Reading) {
   $Database->advance($Running);
   usleep(1000);
}

$Database->cancel($Running);

try {
   $Database->await($Running);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // canceling statement due to user request
   $Running->code;           // 57014
}
```

O `cancel()` abre uma segunda conexão TCP para o mesmo `host` e `port` e escreve um `CancelRequest`
com o id de processo e a chave secreta que o servidor deu à sessão no startup (`BackendKeyData`);
depois a fecha e marca `cancelled`. O pedido é advisory: a operação ainda resolve, falha ou expira
na própria conexão — aqui o servidor para o `pg_sleep()` com o SQLSTATE `57014`.

- Antes de a sessão ter o `BackendKeyData` — a conexão ainda está discando ou autenticando — não há
  o que nomear, e a operação falha localmente com
  `PostgreSQL cancellation requires BackendKeyData.` Um único `advance()` em um pool frio só começa
  a discagem, então cancelar logo depois dele termina assim.
- O connect do side channel bloqueia o worker, por no máximo `timeout` (veja
  **[Timeout](/manual/ADI/Database/Config/overview/#timeout)**). Quando ele não consegue conectar, a
  operação falha com `PostgreSQL cancel connection failed: Connection refused.` — o motivo varia —
  enquanto o statement continua rodando no servidor.
- O side channel é sempre plaintext, diga o `secure.mode` o que disser, `verify-full` inclusive. Ele
  não leva credenciais, mas o id de processo e a chave secreta que envia são tudo de que alguém
  precisa para cancelar os statements dessa sessão.

O que o pool faz com uma operação que não chegou ao servidor, com uma que já terminou, ou com um
cancel que não pode ser enviado está em
**[Cancele um statement em execução](/manual/ADI/Database/Pool/overview/#cancele-um-statement-em-execução)**.

> [!WARNING]
> Um `CancelRequest` nomeia a sessão, não um statement. Por enquanto, o `cancel()` de uma operação
> em pipeline atrás do statement de outro chamador cancela esse statement no lugar dela — ele falha
> com `canceling statement due to user request` —, enquanto a operação que você cancelou roda até o
> fim; o `cancelled` vale `true` do mesmo jeito.

## Limites

- **Um statement por query.** Sem parâmetros, o `query()` envia o SQL como uma única query simples,
  e o servidor roda cada statement separado por `;` dentro de uma transação implícita: um erro em
  qualquer um deles desfaz os outros e falha a operação. Por enquanto, os resultados deles não são
  separados. As linhas de todos os statements caem em um único `Result`, com os `columns`, o
  `status` e o `affected` do último, então
  `INSERT INTO t VALUES (1); INSERT INTO t VALUES (2), (3)` informa `INSERT 0 2` depois de gravar
  três linhas. Com parâmetros, o servidor recusa um segundo statement:
  `cannot insert multiple commands into a prepared statement` (`42601`). Os três drivers são
  comparados em **[Drivers SQL](/manual/ADI/Databases/SQL/Drivers/overview/)**.
- **Os notices se acumulam.** O driver guarda todo notice e warning que o servidor envia em uma
  conexão — um `RAISE NOTICE`, o `already exists, skipping` de um `CREATE TABLE IF NOT EXISTS` —
  pela vida da conexão, e nada os libera por enquanto. SQL que gera notices em um caminho quente faz
  a memória de um worker de vida longa crescer até o `memory_limit` encerrar o processo. Faça o
  servidor parar de enviá-los ao role da aplicação, para as sessões abertas depois:
  `ALTER ROLE app SET client_min_messages = warning;`

## Erros

Um erro do servidor guarda a mensagem primária no `error` e o SQLSTATE no `code` (veja
**[Leia o resultado](/manual/ADI/Databases/SQL/overview/#leia-o-resultado)**). As falhas do próprio
driver não têm `code`:

| Mensagem | Causa |
| --- | --- |
| `PostgreSQL connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).` | Nada escuta em `host`:`port` |
| `PostgreSQL connection failed: 127.0.0.1:5432 closed the connection during SSL negotiation; the server may still be starting.` | O peer desligou antes de responder ao `SSLRequest` |
| `PostgreSQL server refused required TLS.` | O servidor recusou o TLS sob `require`, `verify-ca` ou `verify-full` |
| `PostgreSQL TLS handshake failed: …` | O handshake ou uma verificação do certificado falhou |
| `PostgreSQL server 10.0.0.12:5432 declined TLS and then requested cleartext password authentication: …` | Um downgrade sob `prefer`, em um host fora do loopback; um pedido `MD5` aparece igual, com `MD5` no lugar de `cleartext` |
| `PostgreSQL server 10.0.0.12:5432 declined TLS and then requested SCRAM with 1000 iterations (below 4096): …` | O mesmo downgrade, com uma contagem de iterações SCRAM abaixo de 4096 |
| `PostgreSQL SCRAM-SHA-256 mechanism is not available.` | O servidor oferece só `SCRAM-SHA-256-PLUS` |
| `PostgreSQL authentication method is not supported: 7.` | Kerberos, GSSAPI, SSPI ou outro método |
| `PostgreSQL SASL server signature is invalid.` | A mensagem SCRAM final do servidor não prova que ele conhece a senha |
| `PostgreSQL parameter must be scalar or null.` | Um parâmetro `DateTimeInterface`, array ou objeto |
| `PostgreSQL cancellation requires BackendKeyData.` | `cancel()` antes de a sessão ter as chaves |
| `PostgreSQL cancel connection failed: Connection refused.` | O side channel do cancel não conseguiu conectar |
| `PostgreSQL cancel request write failed.` | O side channel aceitou menos que o `CancelRequest` inteiro |

## Referência

O driver da conexão de uma operação é o `$Operation->Protocol`. O Pool chama os métodos dele; uma
aplicação lê as propriedades.

```php
query (string $sql, array $parameters = []): Operation
```

Cria uma operação pendente. Sem parâmetros usa o simple query protocol; com parâmetros, o
protocolo estendido com o cache de statements.

```php
prepare (Operation $Operation): Operation
```

Monta as mensagens de wire da operação — `Query` sem parâmetros;
`Parse + Describe + Bind + Describe + Execute + Sync` em um miss do cache; `Bind + Execute + Sync`
em um hit, com um `Describe` antes do `Execute` enquanto o layout do resultado ainda não é
conhecido. Falha a operação com `PostgreSQL parameter must be scalar or null.` para um parâmetro que
não consegue enviar.

```php
advance (Operation $Operation): Operation
```

Conduz a máquina de estados da conexão: connect, negociação SSL, startup, autenticação,
escrita do comando e leitura das mensagens do backend.

```php
cancel (Operation $Operation): Operation
```

Escreve o `CancelRequest` advisory por um side channel em plaintext e marca a operação como
`cancelled` quando ele é enviado. Falha a operação com
`PostgreSQL cancellation requires BackendKeyData.` antes de o startup entregar as chaves da sessão,
e com `PostgreSQL cancel connection failed: <reason>.` ou `PostgreSQL cancel request write failed.`
quando o side channel quebra.

```php
abandon (Operation $Operation): void
```

Reconcilia o wire quando o Pool finaliza uma operação de fora — um deadline vencido, um cancel
que nunca chegou ao servidor, um teardown de transação — enquanto o backend ainda está
respondendo ao batch dela. Ele conta os leitores primeiro: uma irmã viva no pipeline (uma entrada
terminada não é leitora), ou um batch ainda sendo escrito atrás dela. Com um, reconcilia como o
`detach()`; sem nenhum, a sessão é derrubada, e é isso que devolve o slot de conexão.

```php
detach (Operation $Operation): void
```

Reconcilia o wire quando um chamador para de esperar por uma operação (`Pool::withdraw()`: uma
resposta deferred cuja espera foi recusada ou interrompida, ou cujo Fiber da requisição foi
destruído). Um batch em pipeline sempre termina em `Sync`, então o backend continua respondendo a
ele: o slot do pipeline é entregue a um stand-in destacado que absorve as mensagens restantes até o
`ReadyForQuery` dele, mantendo todo efeito de sessão que o driver deve a si mesmo (cache de
statements, evictions) enquanto a operação retomada pelo Pool nunca mais é lida, escrita ou
resolvida. Nenhum leitor é exigido. O `check()` ignora stand-ins, então a conexão volta para `idle`
— a menos que outros chamadores ainda leiam ali — e a próxima operação entregue a ela entra na fila
atrás deles e os drena; o `$detached` informa que a sessão ainda deve respostas a stand-ins.

Só um batch que não pode ser reconciliado derruba a sessão: um ainda sendo escrito depois de um
byte creditado, ou sobre TLS, que pode reter um record não creditado. Um batch em texto puro do
qual nenhum byte foi escrito é retirado localmente, e a sessão dele é mantida.

O `check()` também informa um batch que outro chamador ainda está descarregando, então o Pool
nunca entrega uma conexão no meio da escrita de outro. E enquanto um batch enfileirado atrás de
stand-ins ainda está sendo descarregado, o driver lê e absorve o que os stand-ins devem: um backend
bloqueado escrevendo uma resposta que ninguém espera seguraria as duas pontas até o deadline. O que
ele lê depois do último stand-in responde a esse batch, e é entregue a ele assim que o batch está
inteiro no wire.

```php
reset (): bool
```

Escreve o reset de sessão — a simple Query `SELECT pg_advisory_unlock_all(); UNLISTEN *` — atrás de
tudo o que a sessão ainda deve. O Pool o pede ao devolver uma sessão marcada a `idle`, onde
ninguém mais deve trabalho nela. Bytes em pipeline esperam no buffer de recepção do servidor, então
o backend o executa logo depois que o statement abandonado termina, mesmo que ninguém leia, e a
resposta dele é absorvida como a de um stand-in (o `$detached` o conta). Um batch que segura o
stream de escrita nunca é intercalado: o reset é recusado. Um reset ainda no fim da fila cobre um
pedido repetido — nada foi escrito depois dele. Retorna `false` quando é recusado, quando o stream
aceita menos que o reset inteiro, ou quando a sessão sumiu, e o Pool então corta a sessão. Variáveis
de sessão (`SET`) não são resetadas.

```php
check (): bool
```

Se o driver ainda deve trabalho a um chamador, de modo que o Pool não pode emprestar a conexão
ainda: uma operação não terminada no pipeline pela qual alguém espera, ou um batch que outro
chamador ainda está descarregando. Stand-ins destacados não contam.

```php
drain (): array
```

Retorna as operações que terminaram enquanto o driver lia em nome de outra — irmãs em pipeline
respondidas na mesma leitura — e as esquece, para que o Pool libere os slots delas.

```php
sever (Operation $Operation, string $error): void
```

Encerra a sessão: falha toda operação que ela ainda deve com `$error` e desconecta. O Pool o chama
quando um statement que ele retirou deixou o servidor em um estado que ninguém consegue resolver,
como um teardown de transação que nunca chegou.

```php
public private(set) array $parameters
```

Os parâmetros de execução que o servidor informou para a sessão (`ParameterStatus`), por nome —
`server_version`, `TimeZone`, `client_encoding`, `application_name` e os demais que o servidor
envia.

```php
public private(set) int $backendProcess
```

O id de processo do backend da sessão, como o `pg_backend_pid()` o retorna; `0` até o startup o
entregar.

```php
public bool $detached { get; }
```

Se a sessão ainda deve respostas a stand-ins destacados, um reset de sessão pendente incluído.
