# Response Resources

`Response Resources` são o ponto canônico de extensão para helpers de resposta no
`HTTP_Server_CLI`. Eles mantêm o fluxo da rota no objeto `Response` enquanto movem
formatação de body, renderização de views ou pontes async para resources nomeados.

Resources built-in ficam disponíveis de forma lazy em toda resposta:

- `$Response->JSON` - envia JSON pelo sender normal da resposta.
- `$Response->JSONP` - envia JSONP pelo sender normal da resposta.
- `$Response->Plaintext` - envia texto puro e define o media type `text/plain`.
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
return $Response->Plaintext->send('Hello, World!');
```

```php
return $Response->View->render('boas-vindas', [
   'title' => 'Página de Boas-Vindas',
]);
```

> **Plaintext** define o media type da resposta através de `Response->Header->type` (o
> Content-Type padrão) em vez de escrever um campo de header `Content-Type`. A resposta mantém
> o fast path de fields vazios do `build()` e o cache do raw da wire, então uma rota de texto
> puro constante serializa seus headers uma vez e os reutiliza — sem array de header por
> requisição, sem regex de validação. Um `Content-Type` explícito definido via `Header->set()`
> ainda prevalece quando presente.

> **Nomes de view** são restritos a `[A-Za-z0-9_/-]` — um segmento `..` ou `.`, uma `/` inicial ou um byte nulo são rejeitados com `403`. Use um nome simples (opcionalmente com `/` para subdiretórios), sem o sufixo `.template.php`.

## Registrar resources de projeto

Registre resources customizados com a opção `responseResources`. Cada factory é um
`Closure(object): Response\Resource` que recebe o contexto da resposta atual e retorna uma
instância de `Response\Resource` — criada de forma lazy na primeira leitura do resource pelo nome.

`Database` e `KV` trazem uma factory estática `provide()` que encapsula esse setup: ela lê um
escopo de config do diretório `configs/` do projeto, constrói uma conexão pooled por worker e a
encapsula. Passe o diretório `configs/` do projeto e registre cada resource em uma única linha:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\KV as KVResource;

$HTTP_Server_CLI->configure(
   responseResources: [
      'Database' => DatabaseResource::provide(__DIR__ . '/configs/'),
      'KV' => KVResource::provide(__DIR__ . '/configs/'),
   ],
);
```

`Database::provide()` lê o escopo `database` (`configs/database/database.config.php` e os arquivos
`.env` locais), constrói uma conexão `SQL` pooled por worker e a encapsula. Lança exceção quando o
escopo está desabilitado (`DB_ENABLED=false`) ou o contexto não é um `Response`. O resource é criado
de forma lazy na primeira leitura de `$Response->Database` pela rota.

Uma factory é só um closure, então quando você precisa de controle total sobre a construção pode
montar e encapsular o resource você mesmo em vez de chamar `provide()`:

```php
use RuntimeException;

use Bootgly\ADI\Databases\SQL;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;

$HTTP_Server_CLI->configure(
   responseResources: [
      'Database' => static function (object $Context): DatabaseResource {
         if ($Context instanceof Response === false) {
            throw new RuntimeException('Database response resource expects a Response context.');
         }

         static $Database = null;

         if ($Database instanceof SQL === false) {
            $Database = new SQL(['driver' => 'pgsql', 'host' => '127.0.0.1']);
         }

         return new DatabaseResource($Database);
      },
   ],
);
```

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
provide (string $configs): Closure
```

Factory estática. Lê o escopo `database` do diretório `configs/` do projeto informado e retorna um
`Closure(object): Database` lazy para `responseResources`. Constrói uma `SQL` pooled por worker;
lança exceção quando o escopo está desabilitado ou o contexto não é um `Response`.

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
mesmo jeito que `Database` adapta SQL. `KV::provide()` lê o escopo `kv` e constrói um banco `KV` por
worker com uma única conexão no pool, para que comandos pendentes façam pipeline nela:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\KV as KVResource;

$HTTP_Server_CLI->configure(
   responseResources: [
      'KV' => KVResource::provide(__DIR__ . '/configs/'),
   ],
);
```

Declare o escopo `kv` em `configs/kv/kv.config.php`. Cada nó faz bind de uma chave de env com um
default, então a conexão fica configurável pelo ambiente sem tocar no código:

```php
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;

return new Config(scope: 'kv')
   ->Enabled->bind(key: 'KV_ENABLED', default: true, cast: Types::Boolean)
   ->Driver->bind(key: 'KV_DRIVER', default: 'redis')
   ->Host->bind(key: 'KV_HOST', default: '127.0.0.1')
   ->Port->bind(key: 'KV_PORT', default: 6379, cast: Types::Integer)
   ->Timeout->bind(key: 'KV_TIMEOUT', default: 30.0, cast: Types::Float)
   ->Pool
      ->Min->bind(key: 'KV_POOL_MIN', default: 0, cast: Types::Integer)
      ->Max->bind(key: 'KV_POOL_MAX', default: 1, cast: Types::Integer);
```

`KV::provide()` lança exceção quando o escopo está desabilitado (`KV_ENABLED=false`) ou o contexto
não é um `Response`. O resource é criado de forma lazy na primeira leitura de `$Response->KV` pela
rota.

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
provide (string $configs): Closure
```

Factory estática. Lê o escopo `kv` do diretório `configs/` do projeto informado e retorna um
`Closure(object): KV` lazy para `responseResources`. Constrói uma conexão pipelined por worker;
lança exceção quando o escopo está desabilitado ou o contexto não é um `Response`.

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
