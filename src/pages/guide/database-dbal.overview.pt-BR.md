# DBAL de banco

O DBAL do Bootgly é async. Em scripts, você pode aguardar direto pelo pool SQL. Em rotas
`HTTP_Server_CLI`, mantenha o fluxo HTTP canônico: registre o banco como
**[Response Resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**, use
`$Response->defer()` para I/O externo e acesse `$Response->Database` dentro do trabalho
deferido.

> [!NOTE]
> O DBAL pode ser usado em scripts CLI e em rotas WPI. Em WPI, use o
> `HTTP_Server_CLI` com o Database Response Resource built-in. Veja
> **[HTTP Server CLI](/manual/WPI/HTTP/HTTP_Server_CLI/overview/)** para boot do servidor e
> ciclo de vida de `responseResources`.

## Configurar o banco

Projetos carregam dados de banco em `configs/database`. O projeto demo mapeia variáveis como
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_TIMEOUT`, `DB_STATEMENTS`,
`DB_POOL_MIN`, `DB_POOL_MAX`, `DB_ROUTING_STICKY` e valores `DB_REPLICA_*` para
`DatabaseConfig`.

Quando um projeto inicia, `Project::boot()` define `BOOTGLY_PROJECT` e cria
`BOOTGLY_PROJECT->Configs` a partir do diretório `configs/` do projeto. Esse loader é
`Bootgly\API\Projects\Configs`, que estende `Environment\Configs`. Chamar `get('database')`
carrega sob demanda `configs/database/database.config.php` e os arquivos `.env` locais, então
retorna o escopo de config `database`.

Defina esse escopo em `configs/database/database.config.php`:

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
            ->Verify->bind(key: 'DB_SSLVERIFY', default: true, cast: Types::Boolean)
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

Dentro de um arquivo `*.project.php`, registre o Database Response Resource built-in ao instanciar
o `HTTP_Server_CLI`. `DatabaseResource::provide()` é só a ligação: ela lê o escopo `database` do
diretório `configs/` do projeto e injeta uma instância `SQL` pooled por worker no `DatabaseResource`
built-in; ela não define uma classe de resource custom.

```php
use const Bootgly\CLI;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;

return new Project(
   boot: function (): void {
      $HTTP_Server_CLI = new HTTP_Server_CLI(Mode: Modes::Daemon);
      $HTTP_Server_CLI->configure(
         host: '0.0.0.0',
         port: 8082,
         workers: 1,
         responseResources: [
            'Database' => DatabaseResource::provide(__DIR__ . '/configs/'),
         ],
      );

      $HTTP_Server_CLI
         // # Rotas — o ponto de entrada do request (um router *.SAPI.php via require)
         ->on(Events::RequestReceived, require __DIR__ . '/router/routes.SAPI.php')
         // # Feedback de ciclo de vida
         ->on(Events::ServerStarted, fn () => CLI->Terminal->Output->render('@#green:✓ HTTP server iniciado@;@.;'))
         ->on(Events::ServerStopped, fn () => CLI->Terminal->Output->render('@#yellow:■ HTTP server parado@;@.;'));

      $HTTP_Server_CLI->start();
   }
);
```

`on()` liga os três eventos de ciclo de vida do `HTTP_Server_CLI`: `RequestReceived` (o ponto de
entrada das rotas, normalmente um router `*.SAPI.php` via `require`), `ServerStarted` e
`ServerStopped` (feedback de boot/shutdown). Sem `RequestReceived` o servidor sobe mas não responde
nada.

Defina o escopo `database` em `configs/database/database.config.php`; os valores de ambiente são
vinculados dentro desse arquivo. `provide()` lê esse escopo, constrói uma instância `SQL` pooled por
worker (o pool vive nessa instância) e cria o resource de forma lazy na primeira leitura de
`$Response->Database`. Lança exceção quando o escopo está desabilitado (`DB_ENABLED=false`) ou o
contexto não é um `Response`. Precisa de controle total sobre a construção? Passe seu próprio
`Closure(object): DatabaseResource` em vez de chamar `provide()`.

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
`$Response->wait()` para o código da rota não chamar `advance()` na mão.

## Próximas referências

- **[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** - resources built-in e a ponte HTTP com DBAL.
- **[Núcleo DBAL](/manual/ADI/Database/overview/)** - config, pool, operação e ciclo de driver em baixo nível.
- **[ORM de banco](/guide/database-orm/overview/)** - mapeie resultados SQL async para entidades com repositories Data Mapper.
- **[Consultas de banco](/guide/database-queries/overview/)** - montagem de SQL com Query Builder.
- **[Réplicas de leitura de banco](/guide/database-read-replicas/overview/)** - read/write splitting, escopos sticky e failover de réplica.
