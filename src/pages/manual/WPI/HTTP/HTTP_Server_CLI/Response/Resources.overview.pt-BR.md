# Response Resources

`Response Resources` são o ponto canônico de extensão para helpers de resposta no
`HTTP_Server_CLI`. Eles mantêm o fluxo da rota no objeto `Response` enquanto movem
formatação de body, renderização de views ou pontes async para resources nomeados.

Resources built-in ficam disponíveis de forma lazy em toda resposta:

- `$Response->JSON` - envia JSON pelo sender normal da resposta.
- `$Response->JSONP` - envia JSONP pelo sender normal da resposta.
- `$Response->Pre` - formata saída de debug em HTML preformatado.
- `$Response->View` - renderiza views do projeto.

Resources de projeto são registrados uma vez em `HTTP_Server_CLI::configure()` e depois
acessados pelo nome dentro da rota, por exemplo `$Response->Database` (SQL async) ou
`$Response->KV` (key-value Redis async).

## Usar resources built-in

```php
return $Response->JSON->send([
   'status' => 'ok',
]);
```

```php
return $Response->View->render('boas-vindas', [
   'title' => 'Página de Boas-Vindas',
]);
```

## Registrar resources de projeto

Registre resources customizados com a opção `responseResources`. Cada factory recebe o
contexto da resposta atual e retorna uma instância de `Response\Resource`.

Para um resource de banco do projeto, carregue primeiro o escopo de config `database`.
`Project::boot()` cria `BOOTGLY_PROJECT->Configs` a partir do diretório `configs/` do projeto,
e `get('database')` carrega `configs/database/database.config.php` e os arquivos `.env` locais.

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

O resource é criado de forma lazy na primeira leitura de `$Response->Database` pela rota.

## Aguardar trabalho de banco

`Database` é um response resource async. Ele adapta `Readiness` do DBAL para
`$Response->wait()` para que rotas aguardem SQL dentro de `defer()`. Prefira Query Builder
para queries da aplicação; use SQL cru só quando o builder não for o encaixe certo.

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

## Métodos do Database

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```

Inicia um SQL query builder para uma tabela pelo banco encapsulado.

```php
query (string|Builder|Query $query, array $parameters = []): Operation
```

Cria uma operação SQL, aguarda até finalizar e retorna a `Operation`. Use quando você quer
inspecionar `error`, `Result`, estado do pool ou detalhes de protocolo.

```php
fetch (string|Builder|Query $query, array $parameters = []): Result
```

Cria uma operação SQL, aguarda até finalizar e retorna `Result`. Se a operação falhar, lança
`RuntimeException`.

```php
await (Operation $Operation): Operation
drain (array $Operations): array
```

Aguarda uma operação ou um grupo de operações criadas em outro lugar, por exemplo pela
instância `SQL` encapsulada.

```php
transact (callable $work): mixed
```

Inicia uma transação SQL, aguarda `BEGIN`, executa o callback, faz commit no sucesso e
rollback quando o callback lança exceção.

## Registrar o resource KV

`KV` adapta o banco key-value async (`ADI/Databases/KV`, Redis) ao scheduler da resposta do
mesmo jeito que `Database` adapta SQL. Registre com `responseResources`; a factory constrói um
banco `KV` por worker com uma única conexão no pool, para que comandos pendentes façam pipeline
nela.

```php
use RuntimeException;

use Bootgly\ADI\Databases\KV;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\KV as KVResource;

$KVResource = static function (object $Context): KVResource {
   if ($Context instanceof Response === false) {
      throw new RuntimeException('KV response resource expects a Response context.');
   }

   static $KV = null;

   if ($KV instanceof KV === false) {
      // Uma conexão por worker: comandos pendentes fazem pipeline nela
      $KV = new KV([
         'driver' => 'redis',
         'host' => '127.0.0.1',
         'port' => 6379,
         'pool' => ['min' => 0, 'max' => 1],
      ]);
   }

   return new KVResource($KV);
};

$HTTP_Server_CLI->configure(
   responseResources: [
      'KV' => $KVResource,
   ],
);
```

## Aguardar trabalho key-value

`KV` estaciona o Fiber da resposta na prontidão (readiness) da conexão Redis em vez de bloquear
o loop do worker. O caminho mais simples é `fetch()`, que emite um comando, aguarda e retorna a
resposta (lançando `RuntimeException` em erro do Redis):

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return $Response->defer(function (Response $Response): void {
   $KV = $Response->KV;

   $KV->fetch('SET', ['bootgly:demo', 'async-kv']);

   $Response->JSON->send([
      'status' => 'ok',
      'value' => $KV->fetch('GET', ['bootgly:demo']),
   ]);
});
```

Cada `fetch()` é um round-trip completo. Para sobrepor vários comandos, emita-os com `command()`
— que dá flush no write imediatamente, para o próximo comando fazer pipeline na mesma conexão —
e faça `drain()` do grupo numa passagem só:

```php
return $Response->defer(function (Response $Response): void {
   $KV = $Response->KV;
   $Operations = [];

   for ($i = 0; $i < 8; $i++) {
      $Operations[] = $KV->command('GET', ['bootgly:demo']);
   }

   $values = [];
   foreach ($KV->drain($Operations) as $Operation) {
      $values[] = $Operation->error ?? $Operation->response;
   }

   $Response->JSON->send([
      'status' => 'ok',
      'values' => $values,
   ]);
});
```

Fazer pipeline de 8 leituras com `drain()` é ~2,4× mais rápido que 8 `fetch()` sequenciais,
porque os round-trips se sobrepõem na mesma conexão em vez de rodar um de cada vez.

## Métodos do KV

```php
fetch (string $command, array $arguments = []): mixed
```

Cria um comando, aguarda e retorna a resposta. Lança `RuntimeException` quando o Redis reporta
um erro.

```php
command (string $command, array $arguments = []): Operation
```

Cria e avança um comando — o write recebe flush imediato — mas **não** aguarda. Emita vários e
passe-os para `drain()` para sobrepor os round-trips.

```php
await (Operation $Operation): Operation
drain (array $Operations): array
```

Aguarda uma operação, ou um grupo de operações, na prontidão da conexão. `drain()` re-escaneia o
grupo após cada passagem de avanço para que as respostas FIFO pipelined resolvam corretamente.

## Fronteira

Resources não substituem `Response`. Mantenha status codes, headers e entrega de body na
`Response`, e use resources apenas para capacidades focadas de resposta.
