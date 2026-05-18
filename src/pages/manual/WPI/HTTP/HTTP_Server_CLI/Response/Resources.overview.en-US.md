# Response Resources

`Response Resources` are the canonical extension point for response helpers in
`HTTP_Server_CLI`. They keep the route flow on the `Response` object while moving body
formatting, view rendering or async bridges into named resources.

Built-in resources are available lazily on every response:

- `$Response->JSON` - sends JSON through the normal response sender.
- `$Response->JSONP` - sends JSONP through the normal response sender.
- `$Response->Pre` - formats debug output for preformatted HTML.
- `$Response->View` - renders project views.

Project resources are registered once in `HTTP_Server_CLI::configure()` and then accessed by
name from the route, for example `$Response->Database`.

## Use built-in resources

```php
return $Response->JSON->send([
   'status' => 'ok',
]);
```

```php
return $Response->View->render('welcome', [
   'title' => 'Welcome Page',
]);
```

## Register project resources

Register custom resources with the `responseResources` option. Each factory receives the
current response context and returns a `Response\Resource` instance.

For a project database resource, load the project `database` config scope first. `Project::boot()`
creates `BOOTGLY_PROJECT->Configs` from the project `configs/` directory, and `get('database')`
loads `configs/database/database.config.php` plus the local `.env` files.

```php
use const BOOTGLY_PROJECT;
use RuntimeException;

use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\DatabaseConfig;
use Bootgly\API\Projects\Configs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;

$Configs = BOOTGLY_PROJECT->Configs;

if ($Configs instanceof Configs === false) {
   throw new RuntimeException('Create the project configs/ directory before loading database config.');
}

$Configs->allow('database', [
   'DB_CONNECTION',
   'DB_ENABLED',
   'DB_HOST',
   'DB_NAME',
   'DB_PASS',
   'DB_POOL_MAX',
   'DB_POOL_MIN',
   'DB_PORT',
   'DB_SSLCAFILE',
   'DB_SSLMODE',
   'DB_SSLPEER',
   'DB_SSLVERIFY',
   'DB_STATEMENTS',
   'DB_TIMEOUT',
   'DB_USER',
]);
$Scope = $Configs->get('database');

if ($Scope instanceof Config === false) {
   throw new RuntimeException('Create configs/database/database.config.php before loading database config.');
}

$DatabaseResource = static function (object $Context) use ($Scope): DatabaseResource {
   if ($Context instanceof Response === false) {
      throw new RuntimeException('Database response resource expects a Response context.');
   }

   static $Database = null;

   if ($Database instanceof SQL === false) {
      $Database = new SQL(new DatabaseConfig($Scope)->configure());
   }

   return new DatabaseResource($Database);
};

$HTTP_Server_CLI->configure(
   responseResources: [
      'Database' => $DatabaseResource,
   ],
);
```

The resource is created lazily the first time the route reads `$Response->Database`.

## Await database work

`Database` is an async response resource. It adapts DBAL `Readiness` to
`$Response->wait()` so routes can await SQL work from inside `defer()`. Prefer Query Builder
for application queries; use raw SQL only when the builder is not the right fit.

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

## Database methods

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```

Starts a SQL query builder for one table through the wrapped database.

```php
query (string|Builder|Query $query, array $parameters = []): Operation
```

Creates a SQL operation, waits until it finishes and returns the `Operation`. Use it when you
want to inspect `error`, `Result`, pool state or protocol details yourself.

```php
fetch (string|Builder|Query $query, array $parameters = []): Result
```

Creates a SQL operation, waits until it finishes and returns `Result`. If the operation fails,
it throws `RuntimeException`.

```php
await (Operation $Operation): Operation
drain (array $Operations): array
```

Await one operation or a group of operations created elsewhere, for example by the wrapped
`SQL` instance.

```php
transact (callable $work): mixed
```

Begins a SQL transaction, waits for `BEGIN`, runs the callback, commits on success and rolls
back when the callback throws.

## Boundary

Resources do not replace `Response`. Keep status codes, headers and body delivery on
`Response`, and use resources only for focused response capabilities.
