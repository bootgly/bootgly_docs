# Configuração do banco

`Bootgly\ADI\Database\Config` é a config de conexão que toda fachada de banco lê: o driver, o
endpoint e as credenciais, o `timeout` das operações, o tamanho do pool e o TLS (`secure`).
Raramente você a monta diretamente. Passe um array para uma fachada — `new SQL([...])` o transforma
em `Bootgly\ADI\Databases\SQL\Config`, a subclasse que adiciona as chaves exclusivas do SQL — ou
monte a config a partir do escopo `database` do seu projeto. Toda chave é opcional, e a chave que
você omite assume o valor padrão. Montar a config a valida, mas não abre nada: a primeira operação
abre a conexão.

## Conectar

### PostgreSQL

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
   'timeout' => 10.0,
]);

$Operation = $Database->await($Database->query('SELECT current_database() AS name'));
$Operation->Result->cell; // 'app'
```

`await()` conduz a operação até o fim e a retorna. Quando a operação falha, ele lança uma
`RuntimeException` com o `error` da operação.

### MySQL

Os padrões apontam para o PostgreSQL seja qual for o `driver`, então um array do MySQL define a
própria `port` e o próprio `username`:

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

$Operation = $Database->await($Database->query('SELECT DATABASE() AS name'));
$Operation->Result->cell; // 'app'
```

Sem `port` e `username`, o mesmo array conecta em `127.0.0.1:5432` como `postgres`. Se nada
escuta ali, a operação falha com
`MySQL connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).`; se ali há um
servidor PostgreSQL, ela espera uma saudação do MySQL que nunca chega, até o `timeout` vencer.

### SQLite

```php
use Bootgly\ADI\Databases\SQL;

$File = new SQL(['driver' => 'sqlite', 'database' => '/var/data/app.db']);
$Memory = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);
```

O SQLite lê `driver`, `database`, `timeout` e `pool` (mais a chave SQL `statements`) e ignora
`host`, `port`, `username`, `password` e `secure`. O construtor ainda valida `secure`, então um bloco
inválido lança erro aqui também. Sem `database`, o driver abre um arquivo chamado `bootgly` no
diretório de trabalho atual, criando-o se preciso. `:memory:` e o nome vazio são privados ao handle
que os abre, então o pool deles é reduzido a uma conexão (veja
**[Dimensionamento do Pool](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/#dimensionamento-do-pool)**).

### A partir da config do projeto

Em um projeto — na função de boot, em um comando ou em um script que roda dentro dele — monte a
config a partir do escopo de config `database`:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
```

`configure()` lê o bloco de conexão que `Default` (vinculado a `DB_CONNECTION`) seleciona e retorna
uma `SQL\Config` pronta; **[Configurar o banco](/guide/database-dbal/overview/#configurar-o-banco)**
mostra como escrever o escopo. A linha precisa desse escopo. Num projeto sem diretório `configs/`,
`BOOTGLY_PROJECT->Configs` é `null` e a chamada falha com `Call to a member function get() on null`;
sem `configs/database/database.Config.php`, `get('database')` retorna `null` e `DatabaseConfig` o
rejeita com um `TypeError`. Em rotas do `HTTP_Server_CLI`, não monte o `SQL` você mesmo: use o
**[Response Resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**
`$Response->Database`, um por worker.

O guia **[Como o escopo vira uma conexão](/guide/database-dbal/overview/#como-o-escopo-vira-uma-conexão)**
mapeia cada nó do escopo para a chave da config, incluindo os nós que o adaptador por enquanto não
lê (`Secure->Name` e o alias no `Driver` de uma réplica).

## Chaves e padrões

| Chave | Padrão | Quem lê |
|---|---|---|
| `driver` | `'pgsql'` | Toda fachada: seleciona o driver e, no `SQL`, também o dialeto ([Nomes de driver](#nomes-de-driver)) |
| `host` | `'127.0.0.1'` | PostgreSQL, MySQL, Redis |
| `port` | `5432` | PostgreSQL, MySQL, Redis |
| `database` | `'bootgly'` | PostgreSQL e MySQL (nome do banco), SQLite (caminho do arquivo ou `:memory:`), Redis (índice do `SELECT`, só quando tem apenas dígitos e não é `0`) |
| `username` | `'postgres'` | PostgreSQL, MySQL |
| `password` | `''` | PostgreSQL, MySQL, Redis (`AUTH`) |
| `timeout` | `30.0` | PostgreSQL, MySQL, Redis: o deadline de cada operação; SQLite: o busy timeout; em segundos ([Timeout](#timeout)) |
| `pool.min` | `0` | Só armazenado ([Tamanho do pool](#tamanho-do-pool)) |
| `pool.max` | `8` | Todo pool ([Tamanho do pool](#tamanho-do-pool)) |
| `secure.mode` | `'prefer'` | PostgreSQL, MySQL, Redis ([TLS](#tls)) |
| `secure.verify` | Derivado de `mode` | O handshake TLS: verifica a cadeia do certificado |
| `secure.name` | Segue `verify` | O handshake TLS: verifica o nome do certificado contra `peer` |
| `secure.peer` | O `host` | O handshake TLS: nome esperado no certificado, enviado como SNI |
| `secure.cafile` | `''` | O handshake TLS: bundle de CAs (`''` = o trust store padrão do OpenSSL) |
| `secure.key` | `''` | Só o MySQL: a chave pública RSA fixada do servidor |

> [!WARNING]
> Os padrões são os de um PostgreSQL local, seja qual for o `driver`. Um array do MySQL sem `port` e
> `username` conecta em `127.0.0.1:5432` como `postgres`, um array do SQLite sem `database` abre um
> arquivo chamado `bootgly`, e um array do KV sem `driver` é uma config `pgsql`.

Cada valor é convertido para o tipo da sua chave, então `'3306'` vira `3306` — e uma string não
numérica vira `0`, o que no `timeout` significa nenhum deadline (no SQLite, nenhuma espera pelo
banco travado). Um valor que não é escalar, como um array, cai no padrão sem erro, assim como
`null`; um `pool` ou um `secure` que não é array assume o bloco padrão. As exceções são
`secure.verify` e `secure.name`: ali, um valor que não é escalar lança erro (veja [TLS](#tls)), e
só `null` assume o padrão.

`new SQL()` também aceita as chaves SQL, que `Bootgly\ADI\Databases\SQL\Config` adiciona:

| Chave | Padrão | Quem lê |
|---|---|---|
| `statements` | `256` | Todo driver SQL: quantos prepared statements cada conexão guarda em cache; `0` desliga o cache ([Notas sobre o Pool](/manual/ADI/Databases/SQL/Drivers/overview/#notas-sobre-o-pool)) |
| `migrations` | `'_bootgly_migrations'` | O runner de migrations: a tabela que registra as migrations aplicadas ([Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)) |
| `routing.sticky` | `5.0` | O roteamento de leituras: por quantos segundos as leituras ficam no primário depois de uma escrita ([Escopo de read-after-write](/guide/database-read-replicas/overview/#escopo-de-read-after-write)) |
| `replicas` | `[]` | O roteamento de leituras: as réplicas de leitura, cada uma aberta como um pool próprio ([Configurar réplicas](/guide/database-read-replicas/overview/#configurar-réplicas)) |

A fachada KV (Redis) lê esta mesma classe, com os mesmos padrões, então um array do KV sempre
define `driver` como `'redis'` e a própria `port`; veja
**[Redis assíncrono no event loop](/guide/cache/overview/#redis-assíncrono-no-event-loop)**.

Para ver no que uma config resultou — depois de sobrescritas do ambiente, por exemplo —, leia-a de
volta na fachada:

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL(['driver' => 'mysql', 'port' => 3306, 'username' => 'root']);

$Database->Config->host;     // '127.0.0.1'
$Database->Config->database; // 'bootgly'
$Database->Config->secure;   // ['mode' => 'prefer', 'verify' => false, 'name' => false, 'peer' => '127.0.0.1', 'cafile' => '', 'key' => '']
```

No `SQL`, `$Database->SQLConfig` é o mesmo objeto, tipado como `SQL\Config`.

## Nomes de driver

Uma config em array aceita os nomes sob os quais a fachada registra seus drivers: `pgsql`, `mysql` e
`sqlite` no `SQL`, `redis` no `KV`. Os aliases `postgres`, `postgresql`, `mariadb` e `sqlite3` só
são entendidos pelo adaptador da config do projeto, que os normaliza
([A partir da config do projeto](#a-partir-da-config-do-projeto)). Num array eles falham, em um de
dois momentos:

- `postgres`, `postgresql`, `mysqli` e `sqlite3` são conhecidos pelo registry de dialetos do Query
  Builder, então `new SQL()` funciona; a primeira `query()` então lança `InvalidArgumentException`
  com `Database driver is not registered: postgres.`
- Qualquer outro nome, `mariadb` inclusive, faz `new SQL()` lançar `InvalidArgumentException` com
  `SQL builder dialect is not registered: mariadb`

O mesmo erro do registry atinge um array do KV que omite `driver`: o primeiro `command()` lança
`Database driver is not registered: pgsql.` O `driver` de uma réplica não passa por verificação de
dialeto nenhuma: qualquer nome que o `SQL` não registra, `mariadb` inclusive, passa pelo
`new SQL()` e faz a primeira leitura roteada para essa réplica lançar
`Database driver is not registered: mariadb.`

## Timeout

No PostgreSQL, no MySQL e no Redis, `timeout` é o deadline de cada operação, em segundos:

```php
use RuntimeException;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   // ... connection keys
   'timeout' => 2.5,
]);

try {
   $Database->await($Database->query('SELECT pg_sleep(5)'));
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // 'Database operation timed out after 2.5 seconds.'
}
```

- O deadline é fixado quando `query()` cria a operação, então ele cobre tudo o que a operação
  espera: uma conexão livre no pool, a discagem, o TLS, a autenticação e a resposta. Uma operação
  criada com timeout `1.0` e aguardada dois segundos depois falha na hora.
- `0`, ou um valor negativo, significa nenhum deadline.
- Uma operação expirada falha com `Database operation timed out after N seconds.`, em que `N` é o
  valor configurado como o PHP o imprime (`30`, `2.5`); `await()` relança esse `error` como
  `RuntimeException`.
- Não há override por query: uma operação assume o `timeout` do pool para o qual `query()` a
  roteia, então uma leitura roteada para uma réplica assume o da réplica.
- Uma leitura que falha numa réplica é repetida uma vez no primário com um deadline novo do próprio
  `timeout` — o da réplica, não o do primário —, então ela pode levar até duas vezes esse valor no
  total, e um `timeout` curto na réplica, pensado para um failover rápido, também limita a
  repetição.
- Nenhum pedido de cancelamento vai ao servidor: um statement que ele já recebeu continua rodando
  depois que a operação expirou, então combine o `timeout` com um limite do lado do servidor, como o
  `statement_timeout` do PostgreSQL (veja
  **[Pool de conexões](/manual/ADI/Database/Pool/overview/)**).
- O mesmo valor limita a conexão bloqueante que `cancel()` abre para o canal lateral no PostgreSQL
  e no MySQL. Com `timeout` `0` essa conexão não ganha tempo nenhum: ela ainda funciona com um
  servidor na mesma máquina, que completa o handshake na hora, mas com um servidor do outro lado da
  rede `cancel()` falha a operação na hora enquanto o statement continua rodando lá. Um valor
  negativo remove o limite e deixa o timeout de conexão do sistema operacional no comando.
- O SQLite é síncrono: uma operação que consegue a conexão roda o statement dentro de `query()`,
  então o `timeout` não define deadline para ela — um statement lento roda até o fim, e uma operação
  aguardada com atraso ainda funciona. Ali o `timeout` é só o busy timeout: um statement que encontra
  o arquivo do banco travado espera até `timeout` e então falha com um erro `database is locked`
  (código `5`); `0` ou um valor negativo desliga a espera, então ele falha na hora. Uma operação que
  encontra a única conexão ocupada — por uma transação num banco `:memory:`, por exemplo — estaciona
  em `pending` como qualquer outra, e o deadline dela corre ali.
- Nomes de host são resolvidos de forma síncrona quando uma conexão abre, então uma resposta lenta
  do DNS bloqueia o worker pelo tempo que levar; o `timeout` não a interrompe.

## Tamanho do pool

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   // ... connection keys
   'pool' => ['max' => 2],
]);

$Operations = [];
foreach ([1, 2, 3, 4, 5] as $n) {
   $Operations[] = $Database->query('SELECT $1::int AS n', [$n]);
}
foreach ($Operations as $Operation) {
   $Database->await($Operation);
}

$Database->Pool->created; // 2
```

Cinco operações dividiram duas conexões. Passado o `pool.max`, o pool não disca mais nada. Uma
operação entra numa conexão ocupada que esteja pronta — o PostgreSQL a faz em pipeline, o MySQL a
enfileira atrás do statement que roda ali — e uma que não encontra nenhuma pronta, ou que não pode
dividir conexão, como um `BEGIN`, estaciona em `pending` até uma liberação a promover. O pool acima
começa frio: as duas primeiras operações ainda estão discando quando as outras três chegam, então
essas três estacionam, e aguardar na ordem de criação deixa cada liberação promover a seguinte (veja
**[Pool de conexões](/manual/ADI/Database/Pool/overview/)**).

- `pool.max` (padrão `8`) limita as conexões de um pool. Cada instância de fachada tem o próprio
  pool — sob o `HTTP_Server_CLI`, um por worker — e cada réplica de leitura tem um pool só dela, com
  o `pool.max` do primário a menos que a réplica defina um. Um servidor vê, portanto, cerca de
  workers × `pool.max` sessões no primário, e workers × o `pool.max` da réplica em cada réplica. Isso
  não é um teto rígido: um `cancel()` do MySQL abre mais uma sessão, de vida curta, para o seu
  `KILL QUERY`, e uma sessão que o pool descartou — depois de um timeout ou de uma retirada — pode
  continuar rodando o statement no servidor quando o pool já não a conta (veja
  **[Vagas retidas](/manual/ADI/Database/Pool/overview/#vagas-retidas)**).
- Um `await()` síncrono não consegue esperar uma liberação, já que nada mais roda para fazê-la:
  aguardar uma operação ainda estacionada em `pending` — a quinta acima, aguardada primeiro — a faz
  falhar com `Database pool has no capacity for the operation.` Com `pool.max` `0`, toda operação
  recebe essa resposta.
- `pool.min` (padrão `0`) é aceito e guardado em `Pool->min`, mas nada age sobre ele por enquanto:
  nenhuma conexão é aberta de antemão, e cada uma é discada pela primeira operação que precisa dela.
- No SQLite, `:memory:` e o nome vazio reduzem `pool.max` a `1` (um `pool.min` maior também cai para
  `1`); um banco em arquivo mantém o pool que você der.

## TLS

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'mysql',
   'host' => '10.0.0.12',
   'port' => 3306,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
   'secure' => [
      'mode' => 'verify-full',
      'cafile' => '/etc/app/db-ca.pem',
      'peer' => 'db.internal',
   ],
]);
```

`verify-full` verifica a cadeia do certificado contra o `cafile` e o nome do certificado contra o
`peer`. O host aqui é um endereço IP que o certificado não nomeia, então o `peer` informa o nome que
ele carrega; esse nome também é enviado como SNI.

`mode` decide se a conexão é criptografada e define as duas verificações: `verify` (a cadeia do
certificado) e `name` (o nome do certificado contra o `peer`):

| `mode` | Criptografia | `verify` | `name` |
|---|---|---|---|
| `disable` | Nunca | Sempre `false` | Sempre `false` |
| `prefer` (padrão) | TLS quando o servidor aceita, plaintext quando recusa | `false` a menos que definido | Segue `verify` a menos que definido |
| `require` | TLS, ou a operação falha | `false` a menos que definido | Segue `verify` a menos que definido |
| `verify-ca` | TLS, ou a operação falha | Sempre `true` | Sempre `false` |
| `verify-full` | TLS, ou a operação falha | Sempre `true` | Sempre `true` |

"Sempre" quer dizer que o modo sobrepõe o que você definiu. Sob `prefer` e `require` você liga as
verificações: `'verify' => true` adiciona a verificação da cadeia — e a do nome junto, já que
`name` segue `verify` — e `'name' => false` então desliga de novo a do nome. `prefer` e `require`
criptografam sem verificar quem responde, o que derrota só a escuta passiva: numa rede em que você
não confia, use `verify-ca`, `verify-full` ou `'verify' => true`. O que conta como recusa sob
`prefer`, e o que cada driver faz depois de uma, está nas páginas dos drivers
**[PostgreSQL](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/#autenticação-e-tls)** e
**[MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/#tls)** e, para o Redis, em
**[Redis assíncrono no event loop](/guide/cache/overview/#redis-assíncrono-no-event-loop)**.

> [!NOTE]
> Desde a 1.0.3, `prefer` e `require` não verificam mais o certificado por padrão. Antes, todo modo
> exceto `disable` verificava.

- `mode` aceita exatamente um dos cinco nomes, em minúsculas. Qualquer outro escalar lança
  `InvalidArgumentException` com `Unsupported database TLS mode: verify_full.`; um valor que não é
  escalar cai em `prefer`.
- `verify` e `name` aceitam um booleano ou um escalar com cara de booleano: `1`/`0`,
  `'true'`/`'false'`, `'on'`/`'off'` e `'yes'`/`'no'`, em maiúsculas ou minúsculas, com os espaços
  das pontas removidos. Qualquer outra coisa — uma string vazia ou em branco, `'maybe'`, `2`, um
  array — lança ``Database TLS `verify` must be a boolean.``
  (``Database TLS `name` must be a boolean.`` para `name`), seja qual for o `mode`.
- `peer` é o nome verificado contra o certificado quando `name` está ligado, e o nome enviado como
  SNI. Vazio, ele é o `host`. Nenhum SNI é enviado quando o `peer` é um endereço IP. Por enquanto,
  um host IPv6 entre colchetes como `[::1]` passa para o `peer` com os colchetes e é enviado como
  SNI, então defina `'peer' => '::1'` para TLS com um literal IPv6.
- `cafile` é um bundle PEM das CAs em que confiar; vazio, vale o trust store padrão do OpenSSL
  (`openssl.cafile`, `SSL_CERT_FILE`/`SSL_CERT_DIR`). Só um handshake que verifica o lê, então um
  `cafile` com `verify` resolvido como `false` sob `prefer` ou `require` lança erro na construção:
  ``Database TLS cafile requires certificate verification: use mode `verify-ca` or `verify-full`, or set `verify` to true.``
  Sob `disable` ele é aceito e ignorado. Um `cafile` que não é um arquivo legível falha a operação
  antes de qualquer envio: `Database TLS cafile is not a readable file: /etc/app/db-ca.pem.`
- `key` só é lido pelo MySQL: a chave pública RSA do servidor, como PEM inline ou caminho de
  arquivo, para a autenticação completa do `caching_sha2_password` sobre plaintext (veja
  **[Autenticação](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/#autenticação)**).

Cada réplica de leitura resolve o próprio bloco `secure` pelas mesmas regras. Uma réplica que
define `mode` deriva `verify` e `name` dele; uma que não define nem `mode` nem `verify` herda as
flags resolvidas do primário; o `peer` dela assume o próprio `host`, nunca o `peer` do primário. Um
erro no bloco de uma réplica a nomeia, como em
``Database TLS `verify` must be a boolean (replica replica-1.db.local).`` Veja
**[Réplicas de leitura de banco](/guide/database-read-replicas/overview/#configurar-réplicas)**.

## Erros

| Mensagem | Lançada por | Causa |
|---|---|---|
| `Unsupported database TLS mode: verify_full.` | Construção; `DatabaseConfig::configure()` | `secure.mode` não é um dos cinco modos |
| ``Database TLS `verify` must be a boolean.`` | Construção | `secure.verify` não tem cara de booleano |
| ``Database TLS `name` must be a boolean.`` | Construção | `secure.name` não tem cara de booleano |
| ``Database TLS cafile requires certificate verification: use mode `verify-ca` or `verify-full`, or set `verify` to true.`` | Construção | Um `cafile` sob `prefer` ou `require` sem `verify` |
| `SQL builder dialect is not registered: mariadb` | `new SQL()` | `driver` não é um nome de driver SQL nem um alias de dialeto conhecido |
| `Database driver is not registered: postgres.` | `query()`, ou `command()` no KV | `driver` é um alias de dialeto, o `driver` de uma réplica não é um nome registrado, ou um array do KV não tem `driver` |
| `Database TLS cafile is not a readable file: /etc/app/db-ca.pem.` | O `error` da operação | O caminho do `cafile` não existe, não pode ser lido ou não é um arquivo |
| `Database connection failed: php_network_getaddresses: getaddrinfo for db.invalid failed: Name or service not known` | O `error` da operação | O `host` não resolve |
| `Database operation timed out after 2.5 seconds.` | O `error` da operação | O `timeout` venceu |
| `Database pool has no capacity for the operation.` | `await()` | A operação aguardada ainda está estacionada em `pending` |

Construção quer dizer `new Config()` e toda fachada que monta uma a partir de um array, como
`new SQL([...])` ou `new KV([...])`; os erros dela são `InvalidArgumentException`s, e os de `verify`,
`name` e `cafile` nomeiam uma réplica como `(replica <host>)` antes do ponto final. O `error` de uma
operação é relançado por `await()` como `RuntimeException`. `Database connection failed:` carrega o
próprio erro de stream do PHP, então o texto varia; é também o que produzem um literal IPv6 sem
colchetes (escreva `[::1]`) ou um caminho de socket Unix, já que as conexões são só TCP. Uma
discagem que resolve mas falha nomeia o endpoint, como em
`PostgreSQL connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).` (veja
**[núcleo do DBAL](/manual/ADI/Database/overview/)**).

O `DatabaseConfig` acrescenta as próprias `InvalidArgumentException`s, listadas no guia em
**[Quando o DatabaseConfig lança](/guide/database-dbal/overview/#quando-o-databaseconfig-lança)**.

## Referência

`Bootgly\ADI\Databases\SQL\Config` estende esta classe com as chaves SQL (veja
[Chaves e padrões](#chaves-e-padrões)); os padrões delas são as constantes `DEFAULT_STATEMENTS`
(`256`), `DEFAULT_MIGRATIONS` (`'_bootgly_migrations'`) e `DEFAULT_ROUTING_STICKY` (`5.0`) da
subclasse.

### Construtor

```php
__construct (array $config = [])
```

Monta a config a partir de um array nativo da ADI. Cada chave é lida e convertida para o seu tipo,
e um valor ausente ou não escalar assume o padrão — exceto em `secure.verify` e `secure.name`, onde
um valor não escalar lança erro. O bloco `secure` é resolvido pelas regras de
[TLS](#tls) e validado, e `replicas` é normalizado em endpoints completos. Lança
`InvalidArgumentException` para um `secure.mode` não suportado, um `verify` ou `name` sem cara de
booleano, ou um `cafile` sem verificação, no primário ou numa réplica. Não abre nenhuma conexão.

### Constantes

Os padrões de conexão são os de um PostgreSQL local, seja qual for o `driver`.

```php
public const string DEFAULT_DRIVER = 'pgsql';
```

O `driver` padrão.

```php
public const string DEFAULT_HOST = '127.0.0.1';
```

O `host` padrão.

```php
public const int DEFAULT_PORT = 5432;
```

A `port` padrão, a do PostgreSQL.

```php
public const string DEFAULT_DATABASE = 'bootgly';
```

O `database` padrão; no SQLite, um arquivo chamado `bootgly` no diretório de trabalho atual.

```php
public const string DEFAULT_USERNAME = 'postgres';
```

O `username` padrão.

```php
public const string DEFAULT_PASSWORD = '';
```

O `password` padrão: nenhum.

```php
public const float DEFAULT_TIMEOUT = 30.0;
```

O `timeout` padrão, em segundos.

```php
public const int DEFAULT_POOL_MIN = 0;
```

O `pool.min` padrão.

```php
public const int DEFAULT_POOL_MAX = 8;
```

O `pool.max` padrão.

```php
public const string SECURE_DISABLE = 'disable';
```

O modo de TLS `disable`: nunca criptografa.

```php
public const string SECURE_PREFER = 'prefer';
```

O modo de TLS `prefer`: TLS quando o servidor aceita, plaintext quando recusa.

```php
public const string SECURE_REQUIRE = 'require';
```

O modo de TLS `require`: TLS, ou a operação falha.

```php
public const string SECURE_VERIFY_CA = 'verify-ca';
```

O modo de TLS `verify-ca`: TLS, ou a operação falha, com a cadeia do certificado verificada.

```php
public const string SECURE_VERIFY_FULL = 'verify-full';
```

O modo de TLS `verify-full`: TLS, ou a operação falha, com a cadeia e o nome do certificado
verificados.

```php
public const array SECURE_MODES = [
   self::SECURE_DISABLE,
   self::SECURE_PREFER,
   self::SECURE_REQUIRE,
   self::SECURE_VERIFY_CA,
   self::SECURE_VERIFY_FULL,
];
```

Todo valor que `secure.mode` aceita.

```php
public const string DEFAULT_SECURE_MODE = self::SECURE_PREFER;
```

O `secure.mode` padrão.

```php
public const string DEFAULT_SECURE_PEER = '';
```

O `secure.peer` padrão: vazio, o que resolve para o `host`.

```php
public const string DEFAULT_SECURE_CAFILE = '';
```

O `secure.cafile` padrão: vazio, o que deixa o trust store padrão do OpenSSL no comando.

```php
public const string DEFAULT_SECURE_KEY = '';
```

O `secure.key` padrão: nenhuma chave do servidor fixada.

### Propriedades

As propriedades são públicas, mas configure pelo construtor. Atribuir uma depois pula a validação
dela, e a mudança alcança só parte da pilha: o pool copiou `pool` para `Pool->min` e `Pool->max`
quando foi montado, enquanto cada nova operação lê `timeout` de novo.

```php
public string $driver;
```

O nome do driver no registry: `pgsql`, `mysql` ou `sqlite` no `SQL`, `redis` no `KV`.

```php
public string $host;
```

O nome de host ou o endereço IP do servidor. As conexões são só TCP; escreva um literal IPv6 entre
colchetes (`[::1]`).

```php
public int $port;
```

A porta TCP do servidor.

```php
public string $database;
```

O nome do banco; no SQLite, um caminho de arquivo ou `:memory:`; no Redis, um índice numérico de
`SELECT`.

```php
public string $username;
```

O usuário com que autenticar.

```php
public string $password;
```

A senha; vazia, nenhuma é enviada ao Redis.

```php
public float $timeout;
```

No PostgreSQL, no MySQL e no Redis, o deadline de cada operação, em segundos; `0` ou menos o
desliga. No SQLite, só o busy timeout. É também o timeout de conexão dos canais laterais de
cancelamento do PostgreSQL e do MySQL, em que `0` não dá tempo nenhum de espera à conexão e um valor
negativo não dá limite (veja [Timeout](#timeout)).

```php
public array $secure;
```

As configurações de TLS resolvidas, `array{mode: string, verify: bool, name: bool, peer: string,
cafile: string, key: string}`: `verify` e `name` já refletem o modo, e um `peer` vazio já foi
trocado pelo `host`.

```php
public array $pool;
```

O tamanho do pool, `array{min: int, max: int}`. Nada age sobre `min` por enquanto.

```php
public array $replicas;
```

Os endpoints das réplicas de leitura, cada um um array completo com `driver`, `host`, `port`,
`database`, `username`, `password`, `timeout`, `secure` e `pool`. Uma chave que a réplica omite vem
do primário — as flags de `secure` só quando a réplica não define nem `mode` nem `verify`, o
`cafile` só quando a réplica verifica — exceto `secure.peer`, que assume o próprio host da réplica.
Uma entrada sem `host` é descartada. Só a fachada SQL as abre; veja
**[Réplicas de leitura de banco](/guide/database-read-replicas/overview/)**.
