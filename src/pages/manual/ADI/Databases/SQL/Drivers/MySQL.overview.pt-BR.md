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
> ativo poderia substituir a chave pela dele e descriptografar a senha. Full
> authentication sem TLS falha, a menos que você pine a chave pública do servidor
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
`prefer` (cai para plaintext quando o servidor não tem SSL), `require`, `verify-ca` e
`verify-full`. Para servidores com certificados self-signed, desabilite a verificação de
peer explicitamente:

```php
$Database = new SQL([
   'driver' => 'mysql',
   // ...
   'secure' => ['mode' => 'require', 'verify' => false],
]);
```

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

O protocolo MySQL é estritamente request-response: não há pipelining no wire. Operações
co-localizadas entram em uma FIFO onde só a cabeça possui o socket — `check()` reporta o
estado ocupado ao Pool e `drain()` expõe operações completadas por leituras das irmãs.

Em uma falha de transporte (erro de escrita/leitura no socket, peer fechado, corrupção de
framing) o driver falha todas as operações enfileiradas, reseta o estado da sessão e
desconecta, para que o Pool descarte a conexão morta em vez de mantê-la ocupada.
