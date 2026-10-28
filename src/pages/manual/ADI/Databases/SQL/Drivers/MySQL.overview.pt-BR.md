# Driver MySQL

`Bootgly\ADI\Databases\SQL\Drivers\MySQL` implementa o protocolo cliente do MySQL de forma
nativa — handshake, autenticação, TLS, protocolos de texto e binário (prepared) — com zero
dependências. Ele conversa com **MySQL 5.7+/8.x** e **MariaDB**.

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
$Operation->Result->cell; // '8.4.2'
```

As operações são assíncronas: `query()` retorna uma `Operation` pendente; `await()` (ou o
scheduler de Fibers sob o servidor HTTP) a conduz até a conclusão.

## Autenticação

Os dois plugins modernos são suportados de ponta a ponta, incluindo trocas de plugin
solicitadas pelo servidor:

- `mysql_native_password` — challenge-response SHA1;
- `caching_sha2_password` (padrão do MySQL 8) — fast path SHA256; o caminho de **full
  authentication** (primeira conexão de um usuário após o restart do servidor) envia a
  senha por TLS, ou a criptografa com uma **chave pública RSA do servidor pinada** em
  conexões plaintext.

> **Segurança** — em plaintext o driver nunca solicita a chave RSA ao servidor: um MITM
> ativo poderia substituir a chave pela dele e descriptografar a senha. O mesmo atacante a
> lê por um handshake TLS sem verificação (`prefer`/`require` sem `verify` — o padrão de
> fábrica), então verifique o certificado em qualquer rede não confiável (veja TLS abaixo).
> Full authentication sem TLS falha, a menos que você pine a chave pública do servidor
> localmente:

```php
$Database = new SQL([
   'driver' => 'mysql',
   // ...
   'secure' => [
      'mode' => 'disable',
      // PEM inline ou caminho de arquivo (docker: /var/lib/mysql/public_key.pem)
      'key' => '/etc/app/mysql-server-public.pem',
   ],
]);
```

Na config do Demo o pin vincula à chave de ambiente `DB_SERVER_PUBLIC_KEY`. Com TLS ativo
(`secure.mode` ≠ `disable`) nenhum pin é necessário. Note que só o caminho *full* é
afetado: o fast path do dia a dia funciona em plaintext com o scramble normal.

O plugin `ed25519` do MariaDB não é suportado — a operação falha com mensagem clara.

## TLS

A config `secure.mode` controla o TLS exatamente como no driver PostgreSQL: `disable`,
`prefer` (o padrão — TLS quando o servidor oferece, plaintext quando não), `require` (TLS ou
nada), `verify-ca` e `verify-full`. Só os dois modos `verify-*` verificam o certificado do
servidor — `verify-ca` verifica a cadeia, `verify-full` a cadeia e o nome do peer — que é o
que o `sslmode` da libpq e do próprio MySQL fazem: `prefer` e `require` criptografam sem
conferir quem assinou o certificado, então os padrões de fábrica alcançam uma imagem `mysql:8`
de estoque (TLS ligado, certificado self-signed gerado automaticamente) já na primeira
conexão. `verify` inclui uma conexão `prefer`/`require` na verificação da cadeia (`name` então
confere também o nome do host; `name` sozinho confere só o nome, contra qualquer certificado). TLS
sem verificação derrota só a escuta passiva: um atacante ativo no caminho responde o handshake com
o próprio certificado e lê tudo, credenciais inclusive — em qualquer rede em que você não confia,
use `verify-ca`/`verify-full` (ou `verify => true`). Com `cafile` ausente, vale o trust store padrão do OpenSSL (`openssl.cafile`,
`SSL_CERT_FILE`/`SSL_CERT_DIR`), então fixe `cafile` para uma CA privada — um `cafile` só é
lido por um handshake que verifica, então um sob `prefer`/`require` sem `verify` é recusado na
config, e um que não é um arquivo legível falha a conexão antes de qualquer byte ser enviado.
Em um deployment real, verifique:

```php
$Database = new SQL([
   'driver' => 'mysql',
   // ...
   'secure' => ['mode' => 'verify-full', 'cafile' => '/etc/mysql/ca.pem'],
]);
```

> [!NOTE]
> Desde a 1.0.3, `prefer` e `require` não verificam mais o certificado por padrão — antes,
> todo modo exceto `disable` verificava, e um servidor self-signed exigia `'verify' => false`.
> Um bloco `require` que fixava um `cafile` agora precisa de `verify-ca`/`verify-full` (ou
> `'verify' => true`) para continuar verificando.

## Prepared statements

Queries parametrizadas rodam pelo protocolo binário (`COM_STMT_PREPARE`/`EXECUTE`) com um
cache LRU de statements por conexão (chave de config `statements`, padrão `256` — remoções
enviam `COM_STMT_CLOSE`):

```php
$Row = $Database->await($Database->query(
   'SELECT id, name FROM users WHERE mail = ? AND active = ?',
   ['ada@bootgly.com', true]
));
```

Os binds mapeiam por tipo PHP: `int` → BIGINT, `float` → DOUBLE, `bool` → TINYINT, `null`
→ NULL, `DateTimeInterface` → string formatada, o restante → string. Os resultados
hidratam com tipos nativos; `DECIMAL` permanece string, `BIGINT` unsigned além de
`PHP_INT_MAX` permanece uma string decimal exata, `DATE`/`DATETIME`/`TIMESTAMP` viram
`DateTimeImmutable`.

`statements => 0` desliga o cache por completo: cada comando parametrizado prepara o
próprio statement e o driver o fecha no servidor logo após o comando concluir.

## Chaves geradas

MySQL não tem `RETURNING` — o Query Builder bloqueia `output()` por design. O id gerado
chega em `Result->inserted`, e o ORM preenche as chaves das entidades automaticamente:

```php
$Insert = $Database->await($Database->query("INSERT INTO users (name) VALUES ('Ada')"));
$Insert->Result->inserted; // LAST_INSERT_ID do comando
```

`inserted` segue a mesma regra dos valores de linha acima: `int` para todo id dentro de
`PHP_INT_MAX` e string decimal exata acima disso, já que uma chave `BIGINT UNSIGNED` além de
2^63 não cabe em um int do PHP. Uma chave de entidade que precise aceitar esses ids é
declarada `null|int|string`.

## Transações

Transações e savepoints fixam uma conexão do pool — sem código específico de driver:

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1]));
$Database->await($Transaction->commit());
```

> **Commits implícitos** — o MySQL comita a transação aberta sempre que um statement DDL
> (`CREATE`/`ALTER`/`DROP` ...) roda dentro dela. Por isso as migrations de Schema rodam
> fora de transações no MySQL; a coordenação usa advisory locks `GET_LOCK`.

## Cancelamento

`cancel()` abre uma conexão side-channel, autentica e emite `KILL QUERY {thread}` —
advisory, como o `CancelRequest` do PostgreSQL: a operação principal ainda resolve ou
falha no próprio socket. O side channel suporta apenas os fast paths de autenticação.

## Referência

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
cancel (Operation $Operation): Operation
```

Mata o comando em andamento por uma sessão separada autenticada (`KILL QUERY`). Requer o
thread id do greeting; marca a operação como `cancelled`.

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
foi destruído). Uma irmã enfileirada simplesmente sai da FIFO; a cabeça é entregue a um
stand-in destacado que drena a resposta, de modo que a operação retomada pelo Pool nunca mais
é lida, escrita ou resolvida. Nenhum leitor é exigido: o `check()` ignora uma cabeça
stand-in, então a conexão volta para `idle` — a menos que outros chamadores ainda leiam
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

O protocolo MySQL é estritamente request-response: não há pipelining no wire. Operações
co-localizadas entram em uma FIFO onde só a cabeça possui o socket — `check()` reporta o
estado ocupado ao Pool e `drain()` expõe operações completadas por leituras das irmãs.

Em uma falha de transporte (erro de escrita/leitura no socket, peer fechado, corrupção de
framing) o driver falha todas as operações enfileiradas, reseta o estado da sessão e
desconecta, para que o Pool descarte a conexão morta em vez de mantê-la ocupada.
