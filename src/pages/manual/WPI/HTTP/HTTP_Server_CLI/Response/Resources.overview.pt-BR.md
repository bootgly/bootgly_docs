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
acessados pelo nome dentro da rota, por exemplo `$Response->Database` (SQL async),
`$Response->KV` (key-value Redis async) ou `$Response->Upstream` (uma chamada HTTP de saída
pelo client nativo embarcado no reactor do worker).

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

O nome de um resource não pode colidir com uma propriedade publicamente legível do response (`Request`, `Header`, `Body`, `Resources`, `code`, …): a propriedade venceria toda leitura, então `define()`, `load()` e `mount()` recusam esse nome com uma `InvalidArgumentException` no momento do registro. Nomes de propriedades privadas ou protegidas, e das configurações estáticas do response, continuam livres.

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

`Database::provide()` lê o escopo `database` (`configs/database/database.Config.php` e os arquivos
`.env` locais), constrói uma conexão `SQL` pooled por worker e a encapsula. Lança exceção quando o
escopo está desabilitado (`DB_ENABLED=false`) ou o contexto não é um `Response`. O resource é criado
de forma lazy na primeira leitura de `$Response->Database` pela rota.

A factory propaga a validação de `DatabaseConfig`. O driver selecionado por `DB_CONNECTION` precisa
ter seu bloco canônico (`Connections->PostgreSQL`, `Connections->MySQL` ou
`Connections->SQLite`) no escopo. Se ele estiver ausente, o primeiro acesso lança uma
`InvalidArgumentException`, como
`Database config is missing the selected connection scope: Connections->SQLite.` Nenhum endpoint
com defaults da ADI ou instância `SQL` pooled é criado.

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
query (string|Builder|Query $query, array $parameters = [], null|object $Scope = null): Operation
```

Cria uma operação SQL, aguarda até finalizar e retorna a `Operation`. Use quando você quer
inspecionar `error`, `Result`, estado do pool ou detalhes de protocolo.

```php
fetch (string|Builder|Query $query, array $parameters = [], null|object $Scope = null): Result
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

Ele encerra a transação, não um nível dela. O callback pode aninhar com
`$Transaction->begin()` e deixar o nível aninhado aberto; o `transact()` então segue fazendo
commit — ou rollback — até não sobrar nada aberto, de modo que a transação externa sempre é
finalizada e a conexão fixada sempre volta para o pool. Um único teardown teria liberado só o
savepoint mais interno, deixando a transação aberta numa conexão que ninguém devolve.

O callback recebe `($Transaction, $Database)`, e **esse segundo argumento é este resource
falando pela transação**: enquanto o callback executa, `query()`, `fetch()`, `map()` e
`paginate()` rodam todos dentro da transação, na conexão que ela fixou.

```php
$Response->Database->transact(function ($Transaction, $Database) {
   $Database->query('INSERT INTO orders (total) VALUES ($1)', [99]);

   // Lê a linha acima: mesma transação, mesma conexão.
   return $Database->fetch('SELECT sum(total) AS due FROM orders')->rows;
});
```

Esse roteamento é o que mantém a unidade de trabalho inteira. Despachar para o pool pediria uma
conexão *diferente*: com capacidade sobrando a query rodaria fora da transação — sem enxergar
nenhuma escrita dela e sem ser coberta pelo rollback dela — e com um pool de uma conexão só ela
ficaria esperando pela conexão que o próprio chamador está segurando.

Um `transact()` dentro de outro `transact()` é um nível aninhado da mesma transação, aberto como
savepoint. Ele é liberado quando o callback interno retorna, então as escritas dele continuam
sendo da transação externa para commitar ou reverter — uma unidade interna que retornou com
sucesso ainda é descartada se a externa falhar.

Uma transação é uma superfície **serial**: ela carrega uma operação por vez. Emita a próxima
query depois de aguardar a anterior, e reserve o `drain()` para grupos criados no pool.

## Registrar o resource KV

`KV` adapta o banco key-value async (`ADI/Databases/KV`, Redis) ao scheduler da resposta do
mesmo jeito que `Database` adapta SQL. `KV::provide()` lê o escopo `kv` e constrói um banco `KV` por
worker com uma única conexão no pool, para que comandos pendentes façam pipeline nela:

Com uma conexão por worker não há capacidade sobrando para absorver um transporte perdido,
então o driver derruba a sessão em vez de mantê-la. Um fechamento pelo peer — um
`redis.conf timeout`, um restart, um failover, um proxy que corta — falha o comando em voo e
todos os comandos que estavam em pipeline atrás dele, marca-os para a saúde do pool e tira a
conexão do pool. O próximo comando abre uma nova. A falha é portanto transitória: os comandos
em voo quando o transporte morreu são perdidos e precisam ser refeitos pelo chamador, mas o KV
do worker continua funcionando.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\KV as KVResource;

$HTTP_Server_CLI->configure(
   responseResources: [
      'KV' => KVResource::provide(__DIR__ . '/configs/'),
   ],
);
```

Declare o escopo `kv` em `configs/kv/kv.Config.php`. Cada nó faz bind de uma chave de env com um
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

## Registrar o resource HTTP

`HTTP` é a perna de saída da mesma ideia. Ele encapsula um `HTTP_Client_CLI` nativo embarcado no
reactor do worker, então uma rota pode chamar outro serviço de dentro do `defer()` enquanto o
worker continua atendendo suas outras conexões. Registre-o uma vez, pelo nome:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\HTTP;

$HTTP_Server_CLI->configure(
   responseResources: [
      'Upstream' => static fn (object $Context): HTTP => new HTTP(
         host: 'api.example.com',
         secure: [],
      ),
   ],
);
```

`secure: []` liga o TLS com os defaults: o `peer_name` é preenchido a partir do `host` para a
verificação de hostname, e `h2,http/1.1` é oferecido via ALPN. A porta segue o esquema — `null`
significa `80`, ou `443` quando `secure` está definido — então passe-a só quando o upstream
escuta em outro lugar:

```php
'Upstream' => static fn (object $Context): HTTP => new HTTP(
   host: '127.0.0.1',
   port: 8080,
),
```

`secure` é um array de opções de stream context, então verificar o certificado do upstream contra
um bundle de CA específico é uma chave:

```php
'Secure' => static fn (object $Context): HTTP => new HTTP(
   host: 'internal.example.com',
   secure: ['cafile' => __DIR__ . '/certificates/ca.pem'],
),
```

`pool` limita quantas conexões um deferral pode manter ao mesmo tempo. O default é
`['min' => 0, 'max' => 1]` — uma única conexão — então aumente o `max` quando um deferral dispara
pernas concorrentes sobre HTTP/1.1:

```php
'Mirror' => static fn (object $Context): HTTP => new HTTP(
   host: '127.0.0.1',
   port: 8080,
   pool: ['min' => 0, 'max' => 2],
),
```

A factory roda de forma lazy no worker, na primeira vez que um deferral lê o nome — e roda de
novo no próximo deferral. Cada um recebe portanto sua própria instância de `HTTP`, com seu próprio
client embarcado novinho, adotado pelo reactor do worker; nunca um protótipo compartilhado cujo
pool, registro de conexões e hooks vazariam entre deferrals. Construir um `HTTP` fora do reactor
do servidor lança `RuntimeException`:
`HTTP response resource requires the HTTP server reactor — construct it from a responseResources factory.`

## Chamar um upstream por HTTP

Dentro do `defer()` a chamada é uma linha. O `request()` estaciona o Fiber deferido até o upstream
responder e então retorna o `Request\Response` do client — `code`, `status`, `headers` e `body`:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return $Response->defer(function (Response $Response): void {
   $Upstream = $Response->Upstream->request(method: 'GET', URI: '/users/1');

   $Response->JSON->send([
      'code' => $Upstream->code,
      'body' => $Upstream->body,
   ]);
});
```

Para sobrepor várias pernas, abra um batch antes. Em modo batch o `request()` enfileira e retorna
imediatamente, e os objetos `Response` que ele devolveu são preenchidos depois, pelo `drain()`:

```php
return $Response->defer(function (Response $Response): void {
   $Upstream = $Response->Upstream;

   $Upstream->batch();
   $Profile = $Upstream->request(method: 'GET', URI: '/profile');
   $Orders = $Upstream->request(method: 'GET', URI: '/orders');
   $Upstream->drain();

   $Response->JSON->send([
      'profile' => $Profile->body,
      'orders' => $Orders->body,
   ]);
});
```

Dois resources são dois clients embarcados no mesmo reactor adotado, então os batches deles se
intercalam: cada `drain()` resolve apenas as pernas emitidas pelo seu próprio client, na ordem em
que você drenar.

```php
return $Response->defer(function (Response $Response): void {
   $Upstream = $Response->Upstream;
   $Mirror = $Response->Mirror;

   $Upstream->batch();
   $A = $Upstream->request(method: 'GET', URI: '/delay');
   $B = $Upstream->request(method: 'GET', URI: '/fast');
   $Mirror->batch();
   $C = $Mirror->request(method: 'GET', URI: '/fast');

   $Mirror->drain();
   $Upstream->drain();

   $Response->JSON->send([
      'codes' => [$A->code, $B->code, $C->code],
   ]);
});
```

Falhas não lançam exceção — elas chegam como um `Response` concluído com `code` `0` e um `status`
nomeado: `Timeout`, `Connection Failed`, `Connection Lost`, `Connection Closed`,
`Truncated Response`, `Response Too Large`, `Redirect Failed`, `Insecure Redirect` ou
`Invalid Chunked Encoding`. Uma rota que lê só o `code` já trata todas elas como "sem resposta";
leia o `status` quando o motivo importar.

Toda perna do exchange estaciona o Fiber deferido em vez de girar um event loop privado: a espera
pela resposta, a discagem que abre a conexão e o handshake TLS. O worker continua atendendo suas
outras conexões o tempo todo, e um upstream inalcançável não custa a ele nada além do socket em
discagem. Os dois deadlines se dividem de acordo: o `connectTimeout` sozinho limita a discagem
**e** o handshake, enquanto o `timeout` arma apenas a janela de resposta, depois que a conexão
está de pé. `connectTimeout: 0` significa nenhum deadline de conexão — um peer que aceita o TCP
mas nunca negocia mantém o Fiber e o socket dele estacionados até a geração do próprio deferral
ser cancelada.

## Posse e ciclo de vida do HTTP

O primeiro `request()`, `batch()` ou `drain()` reivindica o contexto deferido em execução — o
Fiber criado pelo `$Response->defer()` — e o resource é daquele contexto até o deferral encerrar.
Todos os outros casos são recusados com `LogicException`, antes de tocar no client: sem discagem,
sem fila, sem timer.

- Fora do `defer()`, ou num Fiber que não é um contexto deferido vivo — sem token de geração, ou
  com um que já encerrou, como depois de repassar para SSE ou para um `defer()` aninhado:
  `HTTP response resource must be used inside a live deferred context — call it from defer(), before handing off to SSE or a nested defer().`
- Enquanto outro contexto deferido é o dono:
  `HTTP response resource is owned by another deferred context.`
- Quando o attach do resource foi recusado porque um contexto ainda era dono dele — uma instância
  carregada e puxada entre contextos:
  `HTTP response resource was attached to another response while owned — a carried instance cannot serve interleaved deferred contexts; register it as a responseResources factory instead.`

A liberação roda quando a geração do deferral encerra, e as duas formas de encerrar a executam: a
conclusão normal e o peer indo embora no meio da espera (cancelamento, cujo Fiber nunca é
retomado). O resource então libera o client — o `abort()` abandona toda requisição enfileirada, em
voo ou em retry e fecha todas as conexões, incluindo as keep-alive do pool, e o `unpark()` aposenta
um episódio de drain estacionado cujo Fiber nunca vai retomar. A consequência é deliberada:
**nenhuma conexão com o upstream é reutilizada entre deferrals**. Cada deferral disca do zero, e
paga uma discagem estacionada por isso.

O `Client` é a superfície de knobs, não um caminho de requisição. Todo knob que o construtor não
cobre é definido nele, antes da primeira chamada:

```php
return $Response->defer(function (Response $Response): void {
   $Upstream = $Response->Upstream;
   $Upstream->Client->retryOn = [429, 503];

   $Reply = $Upstream->request(method: 'GET', URI: '/quota');

   $Response->JSON->send(['code' => $Reply->code]);
});
```

Nunca envie pelo `Client`: só `request()`, `batch()` e `drain()` reivindicam o contexto deferido, e
só essa reivindicação libera o client quando o deferral encerra.

Uma instância também pode ser carregada à mão — `$Response->mount(new HTTP(host: 'api.example.com', secure: []))`,
sem definição registrada. Isso funciona sequencialmente, mas o mesmo objeto passa então a ser
re-anexado por todo clone de `Response` (o `defer()` forka os resources do clone em que trabalha),
e uma bridge de espera só é aceita enquanto nenhum contexto é dono do resource — então um segundo
contexto, intercalado, é recusado na primeira reivindicação dele. Prefira a factory: um resource
com definição é reconstruído a cada deferral e nunca atravessa contextos.

## Métodos do HTTP

```php
__construct (string $host, null|int $port = null, null|array $secure = null, null|array $pool = null, int|float $timeout = 30, int|float $connectTimeout = 30, int $maxRedirects = 10, int $maxRetries = 0, null|bool $enableHTTP2 = null)
```

Constrói o resource e o `HTTP_Client_CLI` novo que ele embarca no reactor do worker. `$host` é o
host do upstream; `$port` tem default `80`, ou `443` quando `secure` está definido; `$secure`
carrega opções de stream context TLS (`[]` liga o TLS com os defaults); `$pool` limita o pool de
conexões dentro de um deferral (`['min' => N, 'max' => N]`); `$timeout` é o timeout de resposta em
segundos (`0` = sem timeout); `$connectTimeout` é o timeout de conexão por tentativa de discagem e
sozinho limita a discagem **e** o handshake TLS (`0` = sem timeout); `$maxRedirects` limita o
seguimento de redirects (`0` = desabilitado); `$maxRetries` limita as retentativas em falha de
conexão/timeout (`0` = desabilitado); e `$enableHTTP2` escolhe a negociação HTTP/2 (`null` = ALPN
quando secure; `true` = também h2c; `false` = nunca). Lança `RuntimeException` quando construído
fora do reactor do servidor HTTP.

```php
request (string $method = 'GET', string $URI = '/', array $headers = [], mixed $body = null): Response
```

Envia uma requisição HTTP pelo client embarcado e retorna a resposta do upstream (o
`Request\Response` do client). Fora do `batch()` o Fiber deferido estaciona até a resposta
completar; dentro dele, o `Response` retornado é preenchido depois, pelo `drain()`. Lança
`LogicException` quando chamado fora de um contexto deferido vivo, ou enquanto outro é dono deste
resource.

```php
batch (): static
```

Entra em modo batch: as chamadas seguintes de `request()` são despachadas concorrentemente e
resolvidas juntas pelo `drain()`. Lança `LogicException` quando chamado fora de um contexto
deferido vivo, ou enquanto outro é dono deste resource.

```php
drain (): static
```

Estaciona o Fiber deferido até toda requisição do batch completar. Lança `LogicException` quando
chamado fora de um contexto deferido vivo, ou enquanto outro é dono deste resource.

```php
schedule (Closure $Wait): static
```

Faz o bind da bridge de espera da resposta. O framework a chama quando o resource é anexado a uma
resposta; uma instância carregada é re-anexada por todo clone de `Response`, então uma bridge só é
aceita enquanto nenhum contexto deferido é dono do resource — o contexto recusado é avisado na
primeira reivindicação dele.

```php
public private(set) HTTP_Client_CLI $Client
```

O client embarcado — apenas superfície de knobs. Todo knob que o construtor não cobre é definido
aqui: `retryOn`, `retryDelay`, `retryMaxDelay`, `retryTimeout`, `retryJitter`, `maxResponseBytes`,
`allowInsecureRedirect`, `enableHTTP2` e a família do `timeout`. Nunca envie por ele.

## Fronteira

Resources não substituem `Response`. Mantenha status codes, headers e entrega de body na
`Response`, e use resources apenas para capacidades focadas de resposta.

`Database`, `KV` e `HTTP` são as pontes async desse conjunto: elas estacionam o Fiber deferido
na prontidão (readiness) em vez de bloquear o worker, então o lugar delas é dentro do
`defer()` — nunca no caminho síncrono da rota.
