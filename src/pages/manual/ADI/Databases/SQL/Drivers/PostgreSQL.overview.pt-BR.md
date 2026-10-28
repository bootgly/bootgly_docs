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
`secure.mode`: `disable`, `prefer` (o padrão — cai para plaintext quando recusado),
`require`, `verify-ca` e `verify-full` — com `peer` e `cafile` para pinning de certificado.
Só `verify-ca` e `verify-full` verificam o certificado do servidor — a cadeia, e com
`verify-full` também o nome do peer — como o `sslmode` da libpq faz: `prefer` e `require`
criptografam sem verificação a menos que `verify`/`name` a liguem, então os padrões de fábrica
alcançam um servidor com certificado self-signed já na primeira conexão. TLS sem verificação
derrota só a escuta passiva — um atacante ativo no caminho responde o handshake com o próprio
certificado e lê tudo, credenciais inclusive — então use `verify-ca`/`verify-full` (ou
`verify => true`) em qualquer rede em que você não confia. Quando um servidor recusa o
`SSLRequest` sob `prefer` e depois pede uma senha **cleartext** ou **MD5**, o driver não a envia —
um atacante no caminho consegue forçar exatamente essa recusa — e falha a conexão com um erro que
nomeia `secure.mode => 'disable'`, a forma declarada de autenticar em plaintext. SCRAM-SHA-256
nunca envia a senha e segue — num piso de 4096 iterações (o padrão do PostgreSQL e o mínimo da RFC
7677; uma contagem menor é recusada do mesmo jeito, já que sua prova seria tão quebrável offline
quanto uma resposta MD5, e uma contagem repetida ou malformada falha a conexão) — e em qualquer
sessão nunca acima de 10.000.000 de iterações, que travariam o worker; um host de loopback (`127.0.0.0/8`, `::1`, `localhost`) fica isento,
já que ali não há atacante entre o cliente e o servidor; cada réplica de leitura é julgada pelo
próprio host e modo. Desde a 1.0.10. Com `cafile` ausente,
vale o trust store padrão do OpenSSL (`openssl.cafile`, `SSL_CERT_FILE`/`SSL_CERT_DIR`), então
fixe `cafile` para uma CA privada; um `cafile` só é lido por um handshake que verifica, então
um sob `prefer`/`require` sem `verify` é recusado na config, e um que não é um arquivo legível
falha a conexão antes de qualquer byte ser enviado. Desde a 1.0.3 — antes, todo modo exceto
`disable` verificava por padrão.

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

Em uma falha de transporte (erro de escrita/leitura no socket, peer fechado, corrupção de
framing) o driver falha todas as operações em pipeline, reseta o estado da sessão e
desconecta, para que o Pool descarte a conexão morta em vez de mantê-la ocupada.

## Cancelamento

```php
$Running = $Database->query('SELECT pg_sleep(30)');
$Database->advance($Running);

$Database->cancel($Running);
```

Envia um `CancelRequest` por uma conexão separada usando os backend key data — advisory: a
operação ainda resolve, falha ou expira no socket principal.

Só uma operação de fato em voo gera um. Um pedido de cancel nomeia um backend, não um
statement, então cancelar uma operação que já terminou — ou uma composta pelo `query()` mas
nunca avançada — não envia nada e a retira localmente.

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
