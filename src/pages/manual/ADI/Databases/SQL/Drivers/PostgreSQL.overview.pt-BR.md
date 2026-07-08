# Driver PostgreSQL

`Bootgly\ADI\Databases\SQL\Drivers\PostgreSQL` implementa o PostgreSQL Protocol 3.0 de
forma nativa — startup, autenticação, TLS, protocolos simple e extended query, pipelining
e cancelamento — com zero dependências. É o driver padrão do Bootgly.

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

$Operation = $Database->await($Database->query('SELECT version() AS version'));
$Operation->Result->cell;
```

As operações são assíncronas: `query()` retorna uma `Operation` pendente conduzida por
`await()` ou pelo scheduler de Fibers sob o servidor HTTP.

## Autenticação e TLS

Métodos de autenticação suportados: **cleartext**, **MD5** e **SCRAM-SHA-256** (channel
binding não é negociado). O TLS é negociado via `SSLRequest` e controlado por
`secure.mode`: `disable`, `prefer` (cai para plaintext quando recusado), `require`,
`verify-ca` e `verify-full` — com `peer` e `cafile` para pinning de certificado.

## Prepared statements

Queries parametrizadas usam o protocolo estendido (`Parse`/`Bind`/`Describe`/`Execute`/
`Sync`) com um cache LRU de statements por conexão (chave de config `statements`, padrão
`256`). Statements são nomeados `bootgly_{sha1(sql)}` e removidos com `Close`:

```php
$Row = $Database->await($Database->query(
   'SELECT id, name FROM users WHERE mail = $1 AND active = $2',
   ['ada@bootgly.com', true]
));
```

O dialeto PostgreSQL usa placeholders `$1..$n`. Os resultados hidratam por type OID:
booleans, inteiros, floats, `bytea` e tipos temporais viram valores PHP nativos
(`DateTimeImmutable` para datas/timestamps); `numeric` permanece string.

## Chaves geradas

O dialeto suporta `RETURNING` — o ORM o anexa às mutações automaticamente e hidrata as
entidades salvas a partir das linhas retornadas:

```php
$Saved = $Repository->hydrate(
   $Database->await($Repository->save($User))
)->entity;
```

## Pipelining

Operações co-localizadas fazem pipeline em uma conexão: múltiplos comandos em andamento
compartilham o socket e resolvem em ordem FIFO conforme as mensagens do backend chegam. O
Pool co-localiza operações em conexões ocupadas automaticamente quando o pool está no
limite.

## Cancelamento

```php
$Database->cancel($Operation);
```

Envia um `CancelRequest` por uma conexão separada usando os backend key data — advisory: a
operação ainda resolve, falha ou expira no socket principal.

## Referência

```php
query (string $sql, array $parameters = []): Operation
```

Cria uma operação pendente. Sem parâmetros usa o simple query protocol; com parâmetros, o
protocolo estendido com o cache de statements.

```php
prepare (Operation $Operation): Operation
```

Monta as mensagens de wire da operação — `Query`, ou
`Parse + Describe + Bind + Execute + Sync` com reuso ciente do cache.

```php
advance (Operation $Operation): Operation
```

Conduz a máquina de estados da conexão: connect, negociação SSL, startup, autenticação,
escrita do comando e leitura das mensagens do backend.

```php
cancel (Operation $Operation): Operation
```

Envia o pacote advisory `CancelRequest` pelo side channel. Requer o `BackendKeyData` do
startup da conexão; marca a operação como `cancelled`.
