# Bancos de dados

Um paradigma é uma família de bancos com que você conversa do mesmo jeito: bancos relacionais
recebem statements SQL, stores key-value recebem comandos. O Bootgly dá a cada paradigma uma
**fachada** em `Bootgly\ADI\Databases`, a classe que você abre:

- `SQL` (`Bootgly\ADI\Databases\SQL`) — bancos relacionais: PostgreSQL, MySQL/MariaDB e
  SQLite.
- `KV` (`Bootgly\ADI\Databases\KV`) — comandos key-value no Redis.

As duas estendem o mesmo núcleo assíncrono, `Bootgly\ADI\Database`
(**[Núcleo do DBAL](/manual/ADI/Database/overview/)**). O núcleo dá a cada fachada a sua config de
conexão (**[Configuração](/manual/ADI/Database/Config/overview/)**), um pool de conexões
(**[Pool de conexões](/manual/ADI/Database/Pool/overview/)**) e o ciclo de vida das operações; a
fachada adiciona os verbos do seu paradigma. O verbo que executa algo — `query()` no `SQL`,
`command()` no `KV` — retorna na hora uma operação pendente, e quatro chamadas a conduzem seja qual
for o paradigma: `await()` espera até ela terminar e lança uma `RuntimeException` com o seu `error`
quando ela falha
([Aguarde de forma síncrona](/manual/ADI/Database/Pool/overview/#aguarde-de-forma-síncrona)),
`advance()` a move um passo sem esperar, `cancel()` pede ao servidor que a pare quando o driver
consegue
([Cancele um statement em execução](/manual/ADI/Database/Pool/overview/#cancele-um-statement-em-execução)),
e `withdraw()` a abandona localmente, sem enviar nada
([Operações retiradas](/manual/ADI/Database/Pool/overview/#operações-retiradas)). A classe
com o nome do namespace, `Bootgly\ADI\Databases`, é um registry que monta uma fachada a partir do
nome de um paradigma ([Crie uma fachada pelo nome](#crie-uma-fachada-pelo-nome)).

## Escolha uma fachada

Escolha pelo jeito como você chega aos dados, não pelo servidor: statements sobre tabelas,
transações, os builders de Query e de Schema e o ORM são `SQL`; comandos Redis são `KV`.

| | `SQL` | `KV` |
|---|---|---|
| Fala com | PostgreSQL, MySQL/MariaDB, SQLite | Redis |
| `driver` | `pgsql`, `mysql`, `sqlite` | `redis` |
| Verbos | `query()`, `table()`, `begin()`, `map()`, `structure()` | `command()` |
| Conduzir uma operação | `await()`, `advance()`, `cancel()`, `withdraw()` | `await()`, `advance()`, `cancel()`, `withdraw()` |
| Operação | `SQL\Operation`: `Result`, `error`, `code`, `SQL` | `KV\Operation`: `response`, `error`, `command`, `arguments` |
| Cancelar uma operação em execução | `CancelRequest` do PostgreSQL, `KILL QUERY` do MySQL | Não: um comando já enviado falha com `Database driver does not support cancellation.` |
| Config | `SQL\Config`: as chaves compartilhadas mais `statements`, `migrations` e `routing` | `Database\Config`: as chaves compartilhadas |
| Réplicas de leitura | `replicas`, cada uma com um pool próprio | Nenhuma: `replicas` é ignorado |
| Eventos | `SQL\Events`: `Connected`, `Executed`, `Slow`, `Failed` | Nenhum |
| Em rotas | `$Response->Database` | `$Response->KV` |
| Escopo de config do projeto | `database` | `kv` |

As chaves compartilhadas — `driver`, `host`, `port`, `database`, `username`, `password`, `timeout`,
`pool`, `secure` — e as do SQL estão em
**[Chaves e padrões](/manual/ADI/Database/Config/overview/#chaves-e-padrões)**.

### SQL

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

try {
   $Operation = $Database->await($Database->query('SELECT $1::int + 1 AS next', [41]));

   $Operation->Result->cell; // 42
}
catch (RuntimeException $Exception) {
   echo "Query failed: {$Exception->getMessage()}\n";
}
```

`query()` recebe SQL raw com os seus parâmetros, um Query Builder ou uma `Query` compilada, e
retorna uma `SQL\Operation` pendente; `await()` a conduz até o fim e a retorna. Um statement que
falha guarda a mensagem do servidor em `error` e o seu código em `code` —
`relation "users" does not exist` e `42P01` no PostgreSQL — e `await()` lança essa mensagem. A
fachada, as suas chaves de config, as réplicas de leitura e os eventos estão na página da
**[fachada SQL](/manual/ADI/Databases/SQL/overview/)**;
**[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)**,
**[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** e
**[Drivers SQL](/manual/ADI/Databases/SQL/Drivers/overview/)** vão mais fundo.

### KV

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'], // a plaintext Redis is declared, never inferred
]);

$KV->await($KV->command('SET', ['greeting', 'hello']));

$Operation = $KV->await($KV->command('GET', ['greeting']));
$Operation->response; // 'hello'
```

`command()` recebe o nome do comando e os seus argumentos e retorna uma `KV\Operation` pendente. A
resposta decodificada fica em `response`; o seu `Result` traz só o nome do comando, como `status`.
Uma resposta de erro do Redis também falha a operação, então `await()` lança o erro — um `INCR` na
chave acima lança `ERR value is not an integer or out of range` — e uma operação KV não tem `code`.

Informe `driver` e `port` explicitamente: os padrões são os de um PostgreSQL local seja qual for a
fachada, então um array sem `driver` faz o primeiro `command()` lançar `InvalidArgumentException`
com `Database driver is not registered: pgsql.`, e um sem `port` conecta em `127.0.0.1:5432` — sem
nada escutando ali, `Redis connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).`
Sem `secure`, o modo é `prefer`, e um Redis plaintext nunca responde ao handshake TLS que ele
inicia: cada nova conexão espera o budget do handshake — um segundo, ou metade do `timeout`
quando ela é menor — e falha com
`Redis TLS handshake timed out: the peer did not answer the TLS handshake within 1s — set secure.mode => 'disable' for a plaintext Redis.`
Redis sobre TLS, pipeline e o resource `$Response->KV` estão em
**[Redis assíncrono no event loop](/guide/cache/overview/#redis-assíncrono-no-event-loop)**.

`KV` não é o Cache. `Bootgly\ABI\Resources\Cache` é um cache key-value com TTLs e tags cujos drivers
bloqueiam, incluindo o de Redis; `KV` envia comandos Redis pelo pool assíncrono (veja
**[Cache](/guide/cache/overview/)**).

## Abra onde seu código roda

Cada lugar tem um jeito de abrir uma fachada:

| Seu código roda em | `SQL` | `KV` |
|---|---|---|
| Uma rota do `HTTP_Server_CLI` | `$Response->Database` | `$Response->KV` |
| A função de boot do projeto, um comando ou um script dentro do projeto | `new SQL(new DatabaseConfig(...)->configure())` | `new KV(new KVConfig(...)->configure())` |
| Código fora de um projeto | `new SQL([...])` | `new KV([...])` |

### Em uma rota

Registre os resources uma vez, no `*.Project.php` do projeto, onde ele configura o
`HTTP_Server_CLI`: as factories `provide()` dos response resources `Database` e `KV`
(`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources`) leem os escopos de config `database` e `kv`
e montam uma fachada por worker
(**[Registrar resources de projeto](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#registrar-resources-de-projeto)**,
**[Registrar o resource KV](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#registrar-o-resource-kv)**).
A rota lê `$Response->Database` e `$Response->KV` e espera por meio deles
(**[Aguardar trabalho de banco](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#aguardar-trabalho-de-banco)**,
**[Aguardar trabalho key-value](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#aguardar-trabalho-key-value)**).
Não chame o `await()` da própria fachada numa rota: ele nunca suspende a Fiber que o chama, então
cada espera bloqueia o worker — e toda requisição que ele atende — até o servidor responder,
dentro de `$Response->defer()` também.

### No projeto

```php
use Bootgly\ADI\Databases\KV;
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs\DatabaseConfig;
use Bootgly\API\Environment\Configs\KVConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
$KV = new KV(new KVConfig(BOOTGLY_PROJECT->Configs->get('kv'))->configure());
```

`DatabaseConfig` e `KVConfig` transformam um escopo de config na config da fachada; são os mesmos
adaptadores que os resources de rota usam. Cada um aceita só o próprio escopo — recebendo outro,
eles lançam `Database config adapter expects the database scope.` e
`KV config adapter expects the kv scope.` — e cada linha precisa que o seu escopo exista: veja
**[A partir da config do projeto](/manual/ADI/Database/Config/overview/#a-partir-da-config-do-projeto)**
para o que falha sem ele, **[Configurar o banco](/guide/database-dbal/overview/#configurar-o-banco)**
para o escopo `database` e
**[Registrar o resource KV](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#registrar-o-resource-kv)**
para o `kv`.

Abra cada banco uma vez por processo e reaproveite-o: toda instância de fachada é dona do seu pool,
então dois `new SQL` com a mesma config abrem dois pools
([Dimensione o pool](/manual/ADI/Database/Pool/overview/#dimensione-o-pool)). Na função de boot de
um projeto servidor, não entregue a instância às rotas
(**[Usar em um script ou comando](/guide/database-dbal/overview/#usar-em-um-script-ou-comando)**).

### Fora de um projeto

Código que roda fora de um projeto — um script avulso, uma ferramenta — passa a conexão como um
array, como em [Escolha uma fachada](#escolha-uma-fachada). Toda chave é opcional, e a chave
omitida assume o padrão de um PostgreSQL local, seja qual for a fachada
(**[Chaves e padrões](/manual/ADI/Database/Config/overview/#chaves-e-padrões)**). Um `new SQL` sem
argumentos não lê config nenhuma: a sua primeira query conecta no PostgreSQL em `127.0.0.1:5432`
como `postgres`.

## Crie uma fachada pelo nome

```php
use Bootgly\ADI\Databases;
use Bootgly\ADI\Databases\SQL;

$Databases = new Databases;

$Databases->resolve('sql'); // 'Bootgly\ADI\Databases\SQL'

$Database = $Databases->create('sql', [
   'driver' => 'sqlite',
   'database' => ':memory:',
]);

if ($Database instanceof SQL) {
   $Operation = $Database->await($Database->query('SELECT 6 * 7 AS answer'));
   $Operation->Result->cell; // 42
}
```

`Bootgly\ADI\Databases` associa o nome de um paradigma à classe da sua fachada. `resolve()` retorna
a classe, e `create()` a monta com um array de config: `create('sql', $config)` é
`new SQL($config)` e, como ele, não abre conexão. Use-o quando o paradigma chega como dado, como um
nome num arquivo de configurações; quando você sabe qual banco abre, construa a fachada. Nada no
framework lê esse registry: os resources de rota montam `SQL` e `KV` diretamente.

- Só `sql` está registrado. `create('kv')` e `resolve('kv')` lançam `InvalidArgumentException` com
  `Database paradigm is not registered: kv.` Monte a fachada key-value com `new KV([...])`, ou
  registre-a antes ([Adicione um paradigma](#adicione-um-paradigma)).
- Os nomes casam exatamente: `create('SQL')` lança `Database paradigm is not registered: SQL.`
- `create()` aceita um array. Recebendo a `Config` que `DatabaseConfig::configure()` retorna, ele
  lança um `TypeError`: construa com ela a classe que `resolve()` retorna
  (`new $class($Config)`).
- Os erros do construtor da fachada passam adiante: `create('sql', ['driver' => 'mariadb'])` lança
  `SQL builder dialect is not registered: mariadb`
  ([Nomes de driver](/manual/ADI/Database/Config/overview/#nomes-de-driver)).
- `create()` é tipado para retornar o `Database` abstrato, que não tem nenhum dos verbos do
  paradigma. Um analisador estático como o PHPStan aponta
  `Call to an undefined method Bootgly\ADI\Database::query().` até a instância ser estreitada, como
  o `instanceof` acima faz.

## Adicione um paradigma

Um paradigma é uma classe de fachada mais um registry dos seus drivers. Estenda
`Bootgly\ADI\Database`, passe a classe do registry ao construtor dela, dê à fachada os seus verbos
e registre-a quando ela precisar ser alcançável pelo nome:

```php
use Bootgly\ADI\Database;
use Bootgly\ADI\Database\Config;
use Bootgly\ADI\Database\Connection;
use Bootgly\ADI\Database\Drivers;
use Bootgly\ADI\Databases;

class DocumentDrivers extends Drivers
{
   public function __construct (Config $Config, Connection $Connection)
   {
      parent::__construct($Config, $Connection);

      $this->register('memory', new Memory($Config, $Connection));
   }
}

class Document extends Database
{
   public function __construct (array|Config $config = [])
   {
      parent::__construct($config, DocumentDrivers::class);
   }

   public function find (string $collection): DocumentOperation
   {
      $Operation = new DocumentOperation(null, $collection, $this->Pool->Config->timeout);
      $this->Pool->assign($Operation);

      return $Operation;
   }

   public function await (DocumentOperation $Operation): DocumentOperation
   {
      ($Operation->Pool ?? $this->Pool)->wait($Operation);

      return $Operation;
   }
}

$Databases = new Databases;
$Databases->register('document', Document::class);

$Database = $Databases->create('document', ['driver' => 'memory']);

if ($Database instanceof Document) {
   $Operation = $Database->await($Database->find('users'));
}
```

- `parent::__construct($config, DocumentDrivers::class)` monta a `Config` — a partir de um array ou
  de uma `Config` —, a primeira `Connection` e o pool de `Config->driver`. Ele não abre nada, e a
  fachada herda `withdraw()`.
- O pool monta o registry uma vez para cada conexão que abre, chamando
  `new DocumentDrivers($Config, $Connection)` — mantenha essa assinatura de construtor — e vincula
  a conexão ao driver registrado sob `Config->driver`. Todo driver que o registry registra é
  construído a cada vez, então mantenha baratos os construtores de driver. Um nome que ele não
  registra lança `Database driver is not registered: <name>.` a partir do verbo que entrega a
  operação ao pool, aqui o `find()`.
- Um verbo cria a operação do paradigma com o `timeout` do pool e a entrega a `Pool::assign()`;
  `await()` espera pelo pool da própria operação. `SQL` e `KV` fazem o mesmo.
- `DocumentOperation` estende `Bootgly\ADI\Database\Operation` com os campos do paradigma, e
  `Memory` estende `Bootgly\ADI\Database\Driver`, implementando os seus dois métodos abstratos.
  `prepare()` compõe o comando e deixa a operação em `Queued`: uma deixada em `Pending` parece
  estacionada, e `await()` a falha com `Database pool has no capacity for the operation.`
  `advance()` a move um passo e a termina com `resolve()` ou `fail()`; enquanto ela não termina,
  registra o que esperar em seguida com `$Operation->await()` e um `Readiness`, senão o `await()`
  da fachada lança `Database operation did not provide readiness.` O resto do `Driver` tem padrões
  para um driver que não guarda estado de wire: `cancel()` falha a operação com
  `Database driver does not support cancellation.`
- `register()` só torna a classe alcançável por `create()` e `resolve()` naquela instância de
  `Databases`; `new Document(['driver' => 'memory'])` funciona sem ele.

## Referência

### Databases

`Bootgly\ADI\Databases` — o registry e a factory dos paradigmas de banco.

```php
__construct ()
```

Cria um registry com um paradigma, `sql`, associado a `Bootgly\ADI\Databases\SQL`. Cada instância
guarda o seu próprio mapa: um paradigma registrado numa é desconhecido para o próximo
`new Databases`.

```php
register (string $paradigm, string $class): self
```

Associa `$paradigm` a `$class`, uma `class-string<Database>` cujo construtor recebe o array de
config, substituindo qualquer classe registrada sob esse nome, `sql` incluído. Retorna o registry,
então as chamadas encadeiam. Nada é verificado aqui: uma classe que não existe falha no `create()`
com `Class "App\Missing" not found`, e uma que não é um `Database` com um `TypeError`
(`Bootgly\ADI\Databases::create(): Return value must be of type Bootgly\ADI\Database, stdClass returned`).

```php
resolve (string $paradigm): string
```

Retorna a classe registrada sob `$paradigm` (`class-string<Database>`) sem montá-la. O nome precisa
casar exatamente. Lança `InvalidArgumentException` com `Database paradigm is not registered: kv.`
para um nome que nada registrou.

```php
create (string $paradigm, array $config = []): Database
```

Resolve `$paradigm` e retorna `new $class($config)`, que não abre conexão. `$config` é um array
nativo do ADI (veja **[Configuração](/manual/ADI/Database/Config/overview/)**); vazio, toda chave
assume o seu padrão. Um objeto `Config` é um `TypeError`. Lança a `InvalidArgumentException` de
`resolve()` para um nome desconhecido, e o que o construtor da fachada lançar para uma config
inválida, como `SQL builder dialect is not registered: mariadb` ou
`Unsupported database TLS mode: verify_full.` O tipo de retorno é o `Database` abstrato: estreite-o
(`instanceof SQL`) antes de chamar os verbos do paradigma onde um analisador estático verifica o
código.
