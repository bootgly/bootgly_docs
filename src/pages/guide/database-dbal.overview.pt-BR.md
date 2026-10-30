# DBAL de banco

O DBAL do Bootgly é async. Em scripts e comandos, construa o `SQL` a partir do escopo de config
`database` do projeto e aguarde direto pelo pool dele (veja
**[Usar em um script ou comando](#usar-em-um-script-ou-comando)**). Em rotas
`HTTP_Server_CLI`, mantenha o fluxo HTTP canônico: registre o banco como
**[Response Resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**, use
`$Response->defer()` para I/O externo e acesse `$Response->Database` dentro do trabalho
deferido.

> [!NOTE]
> O DBAL pode ser usado em scripts CLI e em rotas WPI. Em WPI, use o
> `HTTP_Server_CLI` com o Database Response Resource built-in. Veja
> **[HTTP Server CLI](/manual/WPI/HTTP/HTTP_Server_CLI/overview/)** para boot do servidor e
> ciclo de vida dos resources em `Response\Configs`.

## Configurar o banco

Projetos carregam dados de banco em `configs/database`. O projeto demo mapeia variáveis como
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_TIMEOUT`, `DB_STATEMENTS`,
`DB_POOL_MIN`, `DB_POOL_MAX`, `DB_ROUTING_STICKY` e valores `DB_REPLICA_*` para
`DatabaseConfig`.

Quando um projeto inicia, `Project::boot()` define `BOOTGLY_PROJECT` e cria
`BOOTGLY_PROJECT->Configs` a partir do diretório `configs/` do projeto, quando ele existe. Esse
loader é `Bootgly\API\Projects\Configs`, que estende `Environment\Configs`. Chamar `get('database')`
carrega sob demanda `configs/database/database.Config.php` e os arquivos `.env` locais, então
retorna o escopo de config `database`.

Defina esse escopo em `configs/database/database.Config.php`:

```php
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;

return new Config(scope: 'database')
   ->Enabled->bind(key: 'DB_ENABLED', default: true, cast: Types::Boolean)
   ->Default->bind(key: 'DB_CONNECTION', default: 'pgsql')
   ->Connections
      ->PostgreSQL
         ->Driver->bind(key: '', default: 'pgsql')
         ->Host->bind(key: 'DB_HOST', default: '127.0.0.1')
         ->Port->bind(key: 'DB_PORT', default: 5432, cast: Types::Integer)
         ->Database->bind(key: 'DB_NAME', default: 'bootgly')
         ->Username->bind(key: 'DB_USER', default: 'postgres')
         ->Password->bind(key: 'DB_PASS', default: '')
         ->Timeout->bind(key: 'DB_TIMEOUT', default: 30.0, cast: Types::Float)
         ->Statements->bind(key: 'DB_STATEMENTS', default: 256, cast: Types::Integer)
         ->Secure
            ->Mode->bind(key: 'DB_SSLMODE', default: 'prefer')
            ->Verify->bind(key: 'DB_SSLVERIFY', default: null, cast: Types::Boolean)
            ->Peer->bind(key: 'DB_SSLPEER', default: null)
            ->CAFile->bind(key: 'DB_SSLCAFILE', default: '')
            ->up()
         ->Pool
            ->Min->bind(key: 'DB_POOL_MIN', default: 0, cast: Types::Integer)
            ->Max->bind(key: 'DB_POOL_MAX', default: 8, cast: Types::Integer)
            ->up()
         ->Routing
            ->Sticky->bind(key: 'DB_ROUTING_STICKY', default: 5.0, cast: Types::Float)
            ->up()
         ->Replicas
            ->Replica1
               ->Host->bind(key: 'DB_REPLICA_1_HOST', default: null)
               ->Port->bind(key: 'DB_REPLICA_1_PORT', default: null, cast: Types::Integer);
```

### Como o escopo vira uma conexão

O `DatabaseConfig` lê nós, não chaves de ambiente. `Default` seleciona um bloco em
`Connections`, e os nós desse bloco viram a config `SQL`:

| Nó do escopo | Chave de ambiente do demo | Chave da config `SQL` | Default quando o nó está ausente ou `null` |
| --- | --- | --- | --- |
| `Default` | `DB_CONNECTION` | seleciona o bloco (e é o `driver` quando `Driver` não tem valor) | `pgsql` |
| `Driver` | — | `driver` | o valor de `Default` |
| `Host` | `DB_HOST` | `host` | `127.0.0.1` |
| `Port` | `DB_PORT` | `port` | `5432` |
| `Database` | `DB_NAME` | `database` | `bootgly` |
| `Username` | `DB_USER` | `username` | `postgres` |
| `Password` | `DB_PASS` | `password` | vazio |
| `Timeout` | `DB_TIMEOUT` | `timeout` | `30.0` |
| `Statements` | `DB_STATEMENTS` | `statements` | `256` |
| `Secure->Mode` | `DB_SSLMODE` | `secure.mode` | `prefer` |
| `Secure->Verify` | `DB_SSLVERIFY` | `secure.verify` | segue o modo |
| `Secure->Peer` | `DB_SSLPEER` | `secure.peer` | o `host` |
| `Secure->CAFile` | `DB_SSLCAFILE` | `secure.cafile` | vazio |
| `Secure->Key` | `DB_SERVER_PUBLIC_KEY` | `secure.key` | vazio |
| `Pool->Min` | `DB_POOL_MIN` | `pool.min` | `0` |
| `Pool->Max` | `DB_POOL_MAX` | `pool.max` | `8` |
| `Routing->Sticky` | `DB_ROUTING_STICKY` | `routing.sticky` | `5.0` |
| `Replicas-><Name>` | `DB_REPLICA_<n>_*` | uma entrada de `replicas` | — |

Todo nó abaixo de `Default` pertence ao bloco selecionado (`Connections->PostgreSQL->Host`,
`Connections->MySQL->Port`, …). A chave de ambiente é a que o `bind()` desse nó nomeia; a coluna
mostra as chaves que o projeto demo vincula. Um nó que resolve para `null` fica de fora, e o
default embutido ocupa o lugar dele. Esses defaults são os do PostgreSQL, seja qual for o driver:
um bloco `MySQL` sem `Port` e `Username` conecta na porta `5432` como `postgres`, então vincule
os dois, como o demo faz (`3306`, `root`). O demo vincula `Secure->Key` só no bloco `MySQL`: é a
chave pública pinada do servidor do
**[driver MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/)**.

Cada filho de `Replicas` com um `Host` não vazio vira uma réplica e lê os mesmos nós, de
`Driver` a `Pool->Max` (sem `Routing`); um filho sem `Host` é ignorado. O `Driver` de uma
réplica é repassado como está escrito, sem o mapeamento de aliases de
**[Escolher um driver](#escolher-um-driver)**: quando definir um, use o nome canônico `pgsql`,
`mysql` ou `sqlite`, já que um alias como `postgres` passa pelo `configure()` e depois falha a
primeira leitura roteada para essa réplica com `Database driver is not registered: postgres.` O
que uma réplica deixa sem valor vem do primário, exceto `secure.peer`, cujo default é o host da
própria réplica, e as flags de TLS, que seguem o `Secure->Mode` da própria réplica quando ela
define um. Veja **[Réplicas de leitura de banco](/guide/database-read-replicas/overview/)**.

O `DatabaseConfig` não lê nenhum outro nó. `Enabled` só é lido por
`DatabaseResource::provide()` (veja **[Quando `provide()` lança](#quando-provide-lança)**),
enquanto `Charset`, `Migrations` e qualquer nó seu são ignorados, então a tabela de histórico de
migrations mantém o nome padrão, `_bootgly_migrations`. Atualmente, `Secure->Name` também não é
lido: `secure.name` segue `secure.verify`, exceto que `verify-ca` o desliga e `verify-full` o
liga. Para verificar a cadeia do certificado sem verificar o nome, use `DB_SSLMODE=verify-ca`; as
regras completas estão na tabela de **[TLS](/manual/ADI/Database/Config/overview/#tls)**.

## Escolher um driver

`DB_CONNECTION` seleciona um bloco de conexão declarado — e com ele o driver nativo, o dialeto do
Query Builder e o dialeto do Schema. Aliases de driver são mapeados para nomes de blocos canônicos:
`pgsql`/`postgres`/`postgresql` selecionam `Connections->PostgreSQL`, `mysql`/`mariadb` selecionam
`Connections->MySQL` e `sqlite`/`sqlite3` selecionam `Connections->SQLite`.

O bloco canônico selecionado precisa existir. O escopo acima declara apenas PostgreSQL, então
adicione o bloco `->Connections->MySQL` ou `->Connections->SQLite` correspondente antes de
selecionar um desses drivers (o projeto demo traz os três). Se o bloco estiver ausente,
`DatabaseConfig` lança, por exemplo,
`Database config is missing the selected connection scope: Connections->SQLite.` Ele nunca
preenche uma conexão não declarada com os defaults de localhost ou banco da ADI.

O Bootgly traz três drivers:

```bash
DB_CONNECTION=pgsql   # PostgreSQL (padrão) — assíncrono, TLS, SCRAM, RETURNING
DB_CONNECTION=mysql   # MySQL/MariaDB — assíncrono, TLS, caching_sha2, Result->inserted
DB_CONNECTION=sqlite  # SQLite (ext-sqlite3) — síncrono, zero-setup, DB_NAME=:memory: ou caminho de arquivo
```

Veja **[Drivers SQL](/manual/ADI/Databases/SQL/Drivers/overview/)** para a matriz de capacidades.

## Usar em um script ou comando

Fora de uma rota HTTP — a função de boot de um projeto Console, um comando ou um script que roda
dentro do projeto, um job do `schedule.php` — construa o `SQL` a partir do mesmo escopo
`database` e aguarde pelo pool dele:

```php
use RuntimeException;

use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Operation = $Database->query($Query);

try {
   $Database->Pool->wait($Operation);
}
catch (RuntimeException $Exception) {
   echo "Query failed: {$Exception->getMessage()}\n";
   exit(1);
}

foreach ($Operation->rows as $row) {
   echo "{$row['id']}: {$row['name']}\n";
}
```

`BOOTGLY_PROJECT->Configs` é o loader de config do projeto: `Project::boot()` o cria, e
`Project::mount()` também, que é o que `bootgly project <Name> schedule` usa. `get('database')`
carrega `configs/database/database.Config.php` com seus arquivos `.env`, o `DatabaseConfig`
transforma o escopo na config `SQL` (veja
**[Como o escopo vira uma conexão](#como-o-escopo-vira-uma-conexão)**) e `new SQL` monta o pool
sem conectar: quem conecta é a primeira query. Construa-o uma vez por processo e reutilize-o, já
que cada `new SQL` é um pool próprio. Na função de boot de um projeto servidor, use-o só antes do
`start()` e nunca o entregue às rotas: o `start()` faz fork dos workers, e todo worker herda as
sessões que a instância já abriu.

`Pool->wait()` conduz a operação até o fim e lança uma `RuntimeException` quando ela falha; a
mensagem é `$Operation->error`, por exemplo
`PostgreSQL connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).` ou o erro
do próprio servidor (`relation "users" does not exist`). `SQL::await()` faz o mesmo. Não use
esta receita numa rota `HTTP_Server_CLI`: `Pool->wait()` bloqueia o worker até a resposta
chegar. Rotas usam `$Response->Database`
(**[Registrar para rotas HTTP](#registrar-para-rotas-http)**).

### Quando não há escopo do projeto

A linha acima supõe que o escopo existe. `BOOTGLY_PROJECT->Configs` é `null` quando o projeto
não tem diretório `configs/`, e a linha falha com `Call to a member function get() on null`.
`get('database')` retorna `null` quando o escopo não carrega — sem `database.Config.php`, com um
arquivo que declara outro escopo ou com uma linha de `.env` que o loader rejeita (veja
**[Política de `.env` local](/guide/configuration/overview/#política-de-env-local)**) — e o
`DatabaseConfig` recusa esse `null` com um `TypeError`. Fora de um projeto, `BOOTGLY_PROJECT`
nem existe.

Para tratar esses casos, ou para ler um diretório de configs à sua escolha, carregue-o você
mesmo e verifique o escopo, como `bootgly project <Name> migrate` e `seed` fazem com o
`configs/` do projeto:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs;
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Scope = new Configs(__DIR__ . '/configs/')->get('database');

if ($Scope instanceof Config === false) {
   throw new RuntimeException('The database config scope did not load.');
}

$Database = new SQL(new DatabaseConfig($Scope)->configure());
```

### Quando o DatabaseConfig lança

O `DatabaseConfig` valida o escopo antes de existir qualquer conexão. Cada falha é uma
`InvalidArgumentException`:

| Mensagem | Causa |
| --- | --- |
| `Database config adapter expects the database scope.` | `new DatabaseConfig()` recebeu um escopo que não é `database`. |
| `Database config adapter can merge only database scopes.` | `merge()` recebeu um escopo que não é `database`. |
| `Database driver config value must be scalar.` | `Default` ou o `Driver` do bloco contém um array ou um objeto. |
| `Unsupported database driver: <name>.` | `Default` ou o `Driver` do bloco não é um dos nomes de **[Escolher um driver](#escolher-um-driver)**. |
| `Database config is missing the selected connection scope: Connections-><Block>.` | O bloco que `Default` seleciona não foi declarado. |
| `Database TLS mode config value must be scalar.` | Um `Secure->Mode` (do primário ou de uma réplica) contém um array ou um objeto. |
| `Unsupported database TLS mode: <mode>.` | Um `Secure->Mode` não é `disable`, `prefer`, `require`, `verify-ca` nem `verify-full`. |

Em seguida, `configure()` entrega os valores à config `SQL`, que aplica as próprias checagens de
TLS, por exemplo
``Database TLS cafile requires certificate verification: use mode `verify-ca` or `verify-full`, or set `verify` to true.``
para um `Secure->CAFile` sob `prefer` ou `require`, a menos que `Secure->Verify` seja `true`. O
próprio escopo pode lançar antes, enquanto carrega: um valor que um `cast:` não consegue
interpretar (`DB_PORT=abc` lança `Invalid integer config value.`) ou uma chave
`required: true` ausente (`Required config value is missing: DB_PASS`).

## Registrar para rotas HTTP

Dentro de um arquivo `*.Project.php`, registre o Database Response Resource built-in ao instanciar
o `HTTP_Server_CLI`. `DatabaseResource::provide()` é só a ligação: ela lê o escopo `database` do
diretório `configs/` do projeto e injeta uma instância `SQL` pooled por worker no `DatabaseResource`
built-in; ela não define uma classe de resource custom.
A validação da configuração é propagada por `DatabaseResource::provide()`; uma conexão selecionada
que não foi declarada falha antes da criação de uma instância `SQL` pooled.

```php
use const Bootgly\CLI;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;

return new Project(
   exportable: true,
   boot: function (): void {
      $HTTP_Server_CLI = new HTTP_Server_CLI(Mode: Modes::Daemon);
      $HTTP_Server_CLI->configure(
         new ServerConfigs(
            host: '0.0.0.0',
            port: 8082,
            workers: 1
         ),
         new ResponseConfigs(
            Resources: [
               'Database' => DatabaseResource::provide(__DIR__ . '/configs/'),
            ]
         )
      );

      $HTTP_Server_CLI
         // # Rotas — o ponto de entrada do request (pasta router/ via Router::load())
         ->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'))
         // # Feedback de ciclo de vida — o banner de inicialização pertence ao
         //   ServerAdvertised, o hook disparado no processo que possui o terminal
         ->on(Events::ServerAdvertised, fn () => CLI->Terminal->Output->render('@#green:✓ HTTP server iniciado@;@.;'))
         ->on(Events::ServerStopped, fn () => CLI->Terminal->Output->render('@#yellow:■ HTTP server parado@;@.;'));

      $HTTP_Server_CLI->start();
   }
);
```

`on()` liga os três eventos de ciclo de vida do `HTTP_Server_CLI`: `RequestReceived` (o ponto de
entrada das rotas, a pasta `router/` carregada via `Router::load()`), `ServerAdvertised` e
`ServerStopped` (feedback de boot/shutdown). Sem `RequestReceived` o servidor sobe mas não responde
nada.

Defina o escopo `database` em `configs/database/database.Config.php`; os valores de ambiente são
vinculados dentro desse arquivo. `provide()` lê esse escopo, constrói uma instância `SQL` pooled por
worker (o pool vive nessa instância) e cria o resource de forma lazy na primeira leitura de
`$Response->Database`. Lança exceção quando o escopo não pode ser usado (veja
**[Quando `provide()` lança](#quando-provide-lança)**). Precisa de controle total sobre a
construção? Passe seu próprio `Closure(object): DatabaseResource` em vez de chamar `provide()`.

### Chaves que um .env pode definir

`provide()` carrega o escopo por um loader próprio, que aceita só estas chaves em
`configs/database/.env` e `configs/database/.env.<BOOTGLY_ENV>`:

| Grupo | Chaves |
| --- | --- |
| Conexão | `DB_CONNECTION`, `DB_ENABLED`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_TIMEOUT`, `DB_STATEMENTS`, `DB_SSLMODE`, `DB_SSLVERIFY`, `DB_SSLPEER`, `DB_SSLCAFILE`, `DB_POOL_MIN`, `DB_POOL_MAX` |
| Roteamento | `DB_ROUTING_STICKY` |
| Réplicas 1 e 2 | `DB_REPLICA_1_` e `DB_REPLICA_2_`, cada um seguido de `HOST`, `PORT`, `NAME`, `USER`, `PASS`, `TIMEOUT`, `STATEMENTS`, `SSLMODE`, `SSLVERIFY`, `SSLPEER`, `SSLCAFILE`, `POOL_MIN` ou `POOL_MAX` |

Qualquer outra chave nesses arquivos — uma terceira réplica (`DB_REPLICA_3_HOST`), uma chave sua
ou `DB_SERVER_PUBLIC_KEY`, que o bloco `MySQL` do demo vincula — faz o escopo falhar ao carregar,
e `provide()` lança então o erro de `DB_ENABLED` abaixo. A lista vale só para arquivos `.env`:
`bind()` lê primeiro o ambiente do processo, então uma variável de ambiente real nunca é
filtrada. Por enquanto, rotas HTTP pegam portanto a chave pinada de `DB_SERVER_PUBLIC_KEY` no
ambiente do processo, de um `default:` literal de `Secure->Key` no `database.Config.php` ou de
uma factory `Closure(object): DatabaseResource` sua, que constrói o `SQL` sem essa lista (veja
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#registrar-resources-de-projeto)**).
Scripts, comandos e `bootgly project … migrate` / `seed` também leem `DB_SERVER_PUBLIC_KEY` do
`.env`, porque o loader deles não tem essa lista. `provide()` define a lista com
`Configs::allow()`, descrito em
**[Política de `.env` local](/guide/configuration/overview/#política-de-env-local)**.

### Quando provide() lança

Nada é verificado quando você registra o resource: a factory roda na primeira vez em que uma rota
de um worker lê `$Response->Database`, e os erros dela aparecem ali, naquele request. Um contexto
que não é um `Response` lança `Database response resource expects a Response context.` Fora isso,
a factory só constrói o `SQL` quando o escopo carregou e o nó `Enabled` dele contém o booleano
`true`. Qualquer outra situação lança esta `RuntimeException`:

```text
Enable DB_ENABLED=true in the database config scope and set DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASS as needed.
```

Apesar do texto, a mensagem cobre várias causas, entre elas estas:

- `DB_ENABLED` é `false` (ou `0`, `no`, `off`);
- o escopo não tem nó `Enabled`;
- `Enabled` está vinculado sem `cast: Types::Boolean` e o valor vem do ambiente:
  `DB_ENABLED=true` continua sendo a string `'true'`. Mantenha o cast, como no escopo acima;
- o escopo não carregou: não existe `configs/database/database.Config.php`, o arquivo retorna
  algo que não é um `Config` ou declara outro escopo, ou um arquivo `.env` tem uma chave fora da
  lista acima, uma chave com nome fora do padrão `[A-Z_][A-Z0-9_]*` ou uma linha de array como
  `DB_HOST[]=x`.

Uma factory que falhou não constrói nada, então a próxima leitura de `$Response->Database` a
executa de novo e falha do mesmo jeito. Outras falhas mantêm a própria exceção: um valor que um
`cast:` não consegue interpretar, uma chave `required: true` ausente e os erros listados em
**[Quando o `DatabaseConfig` lança](#quando-o-databaseconfig-lança)**.

## Usar em uma resposta

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

return $Response->defer(function (Response $Response): void {
   $Database = $Response->Database;
   $Query = $Database
      ->table(Tables::Users)
      ->select(Columns::Id, Columns::Name)
      ->filter(Columns::Active, Operators::Equal, true);

   $Result = $Database->fetch($Query);

   $Response->JSON->send([
      'status' => 'ok',
      'rows' => $Result->rows,
   ]);
});
```

`defer()` é a fronteira HTTP async. O resource de banco conecta `Readiness` SQL ao
`$Response->wait()` para o código da rota não chamar `advance()` na mão. Leia os dados do request dentro
da closure deferred pelo segundo argumento dela — um snapshot tirado pelo `defer()`, também alcançável
como `$Response->Request` — e não por um `use ($Request)` do request vivo da rota: esse objeto é esvaziado
quando o ciclo síncrono termina e reutilizado pelo próximo request da conexão.

## Referência

`Bootgly\API\Environment\Configs\DatabaseConfig` adapta um escopo de config `database` para a
config `SQL`. Abaixo, `Config` é a classe de nó do escopo, `Bootgly\API\Environment\Configs\Config`.

```php
public function __construct (Config $Config)
```

Encapsula um escopo. Lança `InvalidArgumentException` com
`Database config adapter expects the database scope.` quando `$Config->scope` não é `database`.
Passe a raiz do escopo, como `Configs::get('database')` a retorna: todo nó da árvore carrega o
nome do escopo, então um nó filho passa nessa checagem e depois falha em `configure()`.

```php
public Config $Config
```

O escopo encapsulado. `merge()` o preenche no próprio objeto.

```php
public function merge (Config $Base): self
```

Preenche o escopo encapsulado a partir de outro escopo `database`, por exemplo
`new DatabaseConfig($Scope)->merge($Shared)->configure()`: um nó que o escopo encapsulado já tem
mantém o valor, e um ausente ou `null` recebe o valor de `$Base`, que não é modificado. Retorna o
mesmo adapter. Lança `InvalidArgumentException` com
`Database config adapter can merge only database scopes.` para qualquer outro escopo.

```php
public function configure (): Bootgly\ADI\Databases\SQL\Config
```

Constrói o valor de config `SQL` a partir do escopo encapsulado, seguindo a tabela de
**[Como o escopo vira uma conexão](#como-o-escopo-vira-uma-conexão)**; passe-o para
`new SQL(...)`. Lança as `InvalidArgumentException`s listadas em
**[Quando o `DatabaseConfig` lança](#quando-o-databaseconfig-lança)**.

## Próximas referências

- **[Configuração](/guide/configuration/overview/)** - escopos de config, resolução de `.env` e allowlists.
- **[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** - resources built-in e a ponte HTTP com DBAL.
- **[Núcleo do DBAL](/manual/ADI/Database/overview/)** - config, pool, operação e ciclo de driver em baixo nível.
- **[ORM de banco](/guide/database-orm/overview/)** - mapeie resultados SQL async para entidades com repositories Data Mapper.
- **[Consultas de banco](/guide/database-queries/overview/)** - montagem de SQL com Query Builder.
- **[Réplicas de leitura de banco](/guide/database-read-replicas/overview/)** - read/write splitting, escopos sticky e failover de réplica.
