# Response Resources

`Response Resources` são o ponto canônico de extensão para helpers de resposta no
`HTTP_Server_CLI`. Eles mantêm o fluxo da rota no objeto `Response` enquanto movem
formatação de body, renderização de views ou pontes async para resources nomeados.

Resources built-in ficam disponíveis de forma lazy em toda resposta:

- `$Response->JSON` - envia JSON pelo sender normal da resposta.
- `$Response->JSONP` - envia JSONP pelo sender normal da resposta.
- `$Response->Plaintext` - envia texto puro e define o media type `text/plain`.
- `$Response->Pre` - formata saída de debug em HTML preformatado.
- `$Response->SSE` - abre um `text/event-stream` e envia eventos; o intervalo do `Tick` aceita
  frações de segundo. Veja o [guia de SSE](/guide/sse).
- `$Response->View` - renderiza views do projeto.

Resources de projeto são registrados uma vez — por um `Response\Configs` entregue ao
`HTTP_Server_CLI->configure()` — e depois acessados pelo nome dentro da rota, por exemplo `$Response->Database` (SQL async),
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
return $Response->View->render('welcome', [
   'title' => 'Welcome Page',
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

Registre resources customizados pelo campo `Resources` do `Response\Configs`. Cada factory é um
`Closure(object): Response\Resource` que recebe o contexto da resposta atual e retorna uma
instância de `Response\Resource` — criada de forma lazy na primeira leitura do resource pelo nome.

O nome de um resource não pode colidir com uma propriedade publicamente legível do response (`Request`, `Header`, `Body`, `Resources`, `code`, …): a propriedade venceria toda leitura, então `define()`, `load()` e `mount()` recusam esse nome com uma `InvalidArgumentException` no momento do registro. Nomes de propriedades privadas ou protegidas, e das configurações estáticas do response, continuam livres.

`Database` e `KV` trazem uma factory estática `provide()` que encapsula esse setup: ela lê um
escopo de config do diretório `configs/` do projeto, constrói um banco por worker — com o pool de
conexões que esse escopo dimensiona — e o encapsula. Passe o caminho do diretório `configs/` do
projeto, com a `/` final, e registre cada resource em uma única linha:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\KV as KVResource;

$HTTP_Server_CLI->configure(
   new ServerConfigs(host: '0.0.0.0', port: 8080, workers: 4),
   new ResponseConfigs(
      Resources: [
         'Database' => DatabaseResource::provide(__DIR__ . '/configs/'),
         'KV' => KVResource::provide(__DIR__ . '/configs/'),
      ]
   )
);
```

`Database::provide()` lê o escopo `database` (`configs/database/database.Config.php` e os arquivos
`.env` locais), constrói um banco `SQL` por worker — o pool dele guarda até `DB_POOL_MAX` conexões,
`8` quando o escopo não faz bind de `Pool->Max` — e o encapsula. O resource é criado de
forma lazy na primeira leitura de `$Response->Database` pela rota, então é nessa leitura que a
factory lança. Um contexto que não é um `Response` lança
`Database response resource expects a Response context.` Toda outra recusa é uma única
`RuntimeException`,
`Enable DB_ENABLED=true in the database config scope and set DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASS as needed.`,
seja qual for a causa: um nó `Enabled` que não contém o booleano `true` (`DB_ENABLED=false`, nenhum
nó `Enabled` ou um vinculado sem `cast: Types::Boolean`, que deixa um `true` do ambiente como
string) ou um escopo que não carregou (por exemplo, sem `database.Config.php`, com um arquivo que
declara outro escopo, com uma chave de `.env` fora da lista que `provide()` aceita ou com um caminho
`configs` sem a `/` final). Erros
lançados enquanto o escopo carrega mantêm a própria exceção: um valor que um `cast:` não consegue
interpretar (um `DB_ENABLED=` vazio lança `Invalid boolean config value.`) ou uma chave
`required: true` ausente. A lista de chaves aceitas, e de onde `DB_SERVER_PUBLIC_KEY` pode vir em
vez de um arquivo `.env`, estão em
**[Chaves que um `.env` pode definir](/guide/database-dbal/overview/#chaves-que-um-env-pode-definir)**.

A factory propaga a validação de `DatabaseConfig`. O driver selecionado por `DB_CONNECTION` precisa
ter seu bloco canônico (`Connections->PostgreSQL`, `Connections->MySQL` ou
`Connections->SQLite`) no escopo. Se ele estiver ausente, o primeiro acesso lança uma
`InvalidArgumentException`, como
`Database config is missing the selected connection scope: Connections->SQLite.` Nenhum endpoint
com defaults da ADI ou instância `SQL` pooled é criado.

Uma factory é só um closure, então quando você precisa de controle total sobre a construção pode
montar e encapsular o resource você mesmo em vez de chamar `provide()`:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;

$HTTP_Server_CLI->configure(
   new ServerConfigs(host: '0.0.0.0', port: 8080, workers: 4),
   new ResponseConfigs(
      Resources: [
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
      ]
   )
);
```

## Aguardar trabalho de banco

`Database` é um response resource async. Ele adapta `Readiness` do DBAL para
`$Response->wait()` para que rotas aguardem SQL dentro de `defer()`. Prefira Query Builder
para queries da aplicação; use SQL raw só quando o builder não for o encaixe certo.

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

Uma espera que não volta não deixa a conexão presa. Quando o selector a recusa
(`Fiber I/O resource failed selector admission.` — veja `headroom` em
[Limites de conexão](/manual/WPI/HTTP/HTTP_Server_CLI/#limites-de-conexão)), um timeout do
`defer()` a interrompe, ou o cliente desconecta e o Fiber da requisição é destruído, as operações
que ela aguardava são retiradas localmente — veja `withdraw()` em
[Operações retiradas](/manual/ADI/Database/Pool/overview/#operações-retiradas) — e o pool retoma a vaga delas em vez de deixar a
conexão ocupada para sempre. Um statement que o servidor já recebeu mantém a sessão: a conexão
volta para o pool e a próxima operação nela drena o resto dessa resposta, então uma rajada de
desconexões de clientes não trava o pool pelo timeout dos statements. Só quando uma sessão com
trabalho no servidor precisa ser derrubada — um batch escrito pela metade, ou um statement retirado
na conexão reservada de uma transação — a vaga dele continua contada até o deadline do próprio
statement. A recusa ou o `Timeout` continua chegando ao seu handler — a menos que a própria
retirada falhe: a exceção dela propaga no lugar, com a original encadeada no fim da cadeia de
`getPrevious()` dela.

Como essa sessão é mantida, ela é **resetada** antes de ser entregue de novo. A retirada a marca
(`taint`), e a liberação que a devolve ao pool — quando nenhuma outra requisição ainda lê nela —
escreve `SELECT pg_advisory_unlock_all(); UNLISTEN *` (PostgreSQL) ou `DO RELEASE_ALL_LOCKS()`
(MySQL) atrás do que a sessão ainda deve, então advisory locks de sessão, locks `GET_LOCK` e
registros `LISTEN` que um statement retirado pegou não sobrevivem ao cliente que desconectou. Se o
reset não consegue ser escrito, a sessão é derrubada. O reset também encerra o que uma requisição
que ainda compartilhava a sessão pegou no escopo de sessão fora de uma transação, então pegue esses
locks dentro de `transact()`, cuja conexão é reservada. Variáveis de sessão **não** são resetadas:
`SET` / `SET SESSION` continua na sessão do pool entregue às requisições seguintes, então prefira
`SET LOCAL` ou restaure o valor explicitamente. Uma operação enfileirada atrás de um statement
retirado espera por ele; se expirar, o que ela já enviou ainda pode rodar no servidor, então o
resultado dela é desconhecido.

## Métodos do Database

```php
provide (string $configs): Closure
```

Factory estática. Lê o escopo `database` do diretório `configs/` do projeto informado e retorna um
`Closure(object): Database` lazy para `Response\Configs(Resources:)`. Constrói um banco `SQL` por worker,
cujo pool guarda até `DB_POOL_MAX` conexões, `8` quando o escopo não define nenhum. O
closure lança `RuntimeException` quando o contexto não é um `Response`, e a `RuntimeException`
`Enable DB_ENABLED=true…` quando o escopo não carrega ou o `Enabled` dele não é o booleano `true`
(veja [Registrar resources de projeto](#registrar-resources-de-projeto)); erros de configuração
(`DatabaseConfig`, um `cast:` que falhou, uma chave `required: true` ausente) se propagam
inalterados.

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

   // Reads the row above: same transaction, same connection.
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

Se o Fiber da requisição é destruído no meio da transação — o cliente foi embora, ou a requisição
foi despejada — nenhum callback retorna e nada é lançado, então o `transact()` mais externo não
corta a transação: ele a entrega a um adotante, um Fiber destacado agendado no reactor do worker
do mesmo jeito que as respostas deferred. O adotante conduz até o fim o que a requisição deixou em
voo na conexão fixada — o `BEGIN`, um statement, um savepoint ou o `COMMIT` final, com os
resultados descartados — e então, se a transação ainda estiver aberta, executa o `ROLLBACK` de nível
superior do `Transaction::abort()` na mesma sessão. A sessão sobrevive e mantém a vaga, e a reserva
da conexão só é liberada quando esse teardown responde, então a conexão nunca é emprestada com a
transação aberta — e a liberação que encerra a reserva é a que escreve o reset de sessão descrito
acima, já que a adoção marca a sessão para ele. O mesmo vale quando o Fiber é destruído durante o
`COMMIT` final ou durante o rollback de um trabalho que falhou, e quando o próprio unwinding do
trabalho lança enquanto ele é destruído. A adoção é limitada pelo deadline de cada operação: uma
expirada falha, o que a encerra — o pool derruba essa sessão e o servidor desfaz o que ela ainda
segurava.

Quando nada pode adotar a transação — sem reactor de worker (uso síncrono), um `BEGIN` que nunca
chegou ao servidor, ou um adotante ou uma espera de readiness que o reactor recusa — vale o
comportamento anterior: o que a requisição deixou em voo é retirado, depois o `ROLLBACK` do
`Transaction::abort()` é retirado antes de chegar ao wire, a sessão é cortada, o servidor faz
rollback e a reserva da conexão é liberada.

Uma espera que volta com erro dentro do trabalho — uma recusa do selector, um timeout do `defer()` —
não é adotada: ela retira o statement dela, o que corta a sessão reservada, e o erro dela chega ao
trabalho como em qualquer outro lugar.

O `COMMIT` final carrega um risco próprio. Quando a espera por ele não volta por causa de um timeout
do `defer()` ou de uma recusa do selector, esse `COMMIT` é retirado e a sessão dele é cortada como
qualquer outro teardown. Um `COMMIT` que nunca chegou ao servidor termina num rollback feito pelo
servidor, mas um que já chegou pode ter sido commitado. O `transact()` só informa que falhou (o
`Timeout` ou a recusa chega ao seu handler), então não repita a unidade de trabalho às cegas:
verifique se as escritas dela foram gravadas, ou torne-a idempotente. Um Fiber destruído enquanto o
`COMMIT` espera é adotado: o `COMMIT` é conduzido até a resposta dele na própria sessão, e ninguém
lê se ele commitou — um cliente que repete a requisição depois de desconectar também deve tornar a
unidade de trabalho idempotente.

## Registrar o resource KV

`KV` adapta o banco key-value async ao scheduler da resposta do mesmo jeito que `Database` adapta
SQL. Ele encapsula a fachada `KV` de **[Banco KV](/manual/ADI/Databases/KV/overview/)** (Redis):
comandos, respostas e limites são os da fachada, enquanto o resource estaciona o Fiber da resposta
onde o `await()` da própria fachada bloquearia o worker. Registre-o uma vez, pelo nome:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\KV as KVResource;

$HTTP_Server_CLI->configure(
   new ServerConfigs(host: '0.0.0.0', port: 8080, workers: 4),
   new ResponseConfigs(
      Resources: [
         'KV' => KVResource::provide(__DIR__ . '/configs/'),
      ]
   )
);
```

`KV::provide()` lê o escopo `kv` e constrói um banco `KV` por worker. O pool dele guarda até
`KV_POOL_MAX` conexões: `1` no escopo abaixo, então os comandos de toda requisição que o worker
atende fazem pipeline em uma conexão, e `8` quando o escopo não faz bind de `Pool->Max`. Um comando
pega uma conexão ociosa, ou abre uma enquanto o pool está abaixo desse tamanho, e só entra no
pipeline atrás dos comandos de uma conexão ocupada quando o pool está cheio.

Declare o escopo `kv` em `configs/kv/kv.Config.php`. Cada nó faz bind de uma chave de env com um
default, então a conexão fica configurável pelo ambiente sem tocar no código:

```php
use Bootgly\ADI\Database\Config as ADIConfig;
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;

return new Config(scope: 'kv')
   ->Enabled->bind(key: 'KV_ENABLED', default: true, cast: Types::Boolean)
   ->Driver->bind(key: 'KV_DRIVER', default: 'redis')
   ->Host->bind(key: 'KV_HOST', default: '127.0.0.1')
   ->Port->bind(key: 'KV_PORT', default: 6379, cast: Types::Integer)
   ->Database->bind(key: 'KV_DATABASE', default: '0')
   ->Password->bind(key: 'KV_PASS', default: '')
   ->Timeout->bind(key: 'KV_TIMEOUT', default: 30.0, cast: Types::Float)
   ->Secure
      ->Mode->bind(key: 'KV_SSLMODE', default: ADIConfig::SECURE_DISABLE)
      ->Verify->bind(key: 'KV_SSLVERIFY', default: null, cast: Types::Boolean)
      ->Peer->bind(key: 'KV_SSLPEER', default: null)
      ->CAFile->bind(key: 'KV_SSLCAFILE', default: null)
      ->up()
   ->Pool
      ->Min->bind(key: 'KV_POOL_MIN', default: 0, cast: Types::Integer)
      ->Max->bind(key: 'KV_POOL_MAX', default: 1, cast: Types::Integer);
```

`KV::provide()` aplica allow-list a todas as chaves mostradas acima, e um nó que você deixa de fora
assume os padrões do banco — porta `5432` e `prefer` entre eles (veja
**[Configure a partir do escopo kv](/manual/ADI/Databases/KV/overview/#configure-a-partir-do-escopo-kv)**).
Para um deployment Redis remoto, defina `KV_SSLMODE=verify-full` — ele verifica a cadeia do
certificado e o nome do peer por si só; `KV_SSLVERIFY=true` é como `prefer`/`require` entram na
verificação — e forneça `KV_SSLPEER`/`KV_SSLCAFILE` ao usar uma CA interna (um `KV_SSLCAFILE` sob
`prefer` ou `require` sem `KV_SSLVERIFY=true` é recusado na config; sob `disable`, o padrão deste
exemplo, ele é ignorado e a conexão fica em plaintext, então defina o `KV_SSLMODE` junto). Modos
strict (`require`, `verify-ca`, `verify-full`) concluem TLS antes que `AUTH`, `SELECT` ou um comando
da aplicação seja criado no wire. `prefer` tenta TLS primeiro e só reconecta em plaintext quando o
peer o recusa **explicitamente** (reseta ou fecha a conexão durante o handshake TLS, ou responde
bytes que não são TLS) — nunca por falha de certificado com a verificação ligada, e nunca por
silêncio: um peer que não respondeu dentro do budget de handshake (1 s, ou metade de `KV_TIMEOUT`
quando ela é menor) falha o comando nomeando `disable`, porque um Redis plaintext nunca responde a
um ClientHello e não se distingue de um servidor TLS apenas atrasado. O budget é só do `prefer` — os
modos strict esperam o ServerHello até `KV_TIMEOUT`. Um Redis plaintext é, portanto, declarado com
`KV_SSLMODE=disable` — o padrão desta config — em vez de descoberto, e não paga budget de handshake
algum. Com `KV_SSLCAFILE` ausente, vale o trust store padrão do OpenSSL (`openssl.cafile`,
`SSL_CERT_FILE`/`SSL_CERT_DIR`), então defina-o sempre que a CA for privada. Mantenha `KV_PASS` no
ambiente do processo ou em secret de runtime, nunca em `.env` commitado.

O `KV::provide()` em si não lê nada: ele retorna a factory, e o resource é criado de forma lazy na
primeira leitura de `$Response->KV` pela rota, então é nessa leitura que a factory lança. Um
contexto que não é um `Response` lança `KV response resource expects a Response context.` Toda
outra recusa é uma única `RuntimeException`,
`Enable KV_ENABLED=true in the kv config scope and set KV_HOST and KV_PORT as needed.`, seja qual for
a causa: um nó `Enabled` que não contém o booleano `true` (`KV_ENABLED=false`, nenhum nó `Enabled`
ou um vinculado sem `cast: Types::Boolean`, que deixa um `true` lido do ambiente ou de um arquivo
`.env` como string) ou um escopo que não carregou (por exemplo, sem `kv.Config.php`, com um arquivo
que declara outro escopo, com uma chave de `.env` fora da lista acima ou com um caminho `configs`
sem a `/` final). A verificação roda de novo a cada requisição até passar, então um escopo
desabilitado falha cada requisição que lê `$Response->KV`. Erros lançados enquanto o escopo carrega
ou é convertido mantêm a própria exceção: uma `InvalidArgumentException` para um valor que um
`cast:` não consegue interpretar (um `KV_ENABLED=` vazio lança `Invalid boolean config value.`) ou
um driver não suportado (`KV_DRIVER=memcached` lança `Unsupported KV driver: memcached.`), e uma
`RuntimeException` para uma chave `required: true` ausente
(`Required config value is missing: KV_HOST`).

## Aguardar trabalho key-value

`KV` estaciona o Fiber da resposta na prontidão (readiness) da conexão Redis em vez de bloquear
o loop do worker. O caminho mais simples é `fetch()`, que emite um comando, aguarda e retorna a
resposta (lançando `RuntimeException` quando o comando falha):

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
— numa conexão pronta ele escreve o comando na hora e retorna, então os comandos seguintes se
sobrepõem a ele — e faça `drain()` do grupo numa passagem só:

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

Contra um Redis local, 8 leituras com `drain()` levaram cerca de um terço do tempo de 8 `fetch()`
sequenciais, porque os round-trips se sobrepõem em vez de rodar um de cada vez.

Aguarde só dentro do `defer()`. No caminho síncrono da rota não há Fiber para estacionar, então
cada espera volta na hora e `fetch()`, `await()` e `drain()` seguem consultando a conexão até a
resposta chegar: com um `BLPOP` de 1 segundo aguardado ali, outra requisição ao mesmo worker
esperou 0,9 s; com a mesma espera dentro do `defer()`, ela foi respondida na hora.

Um comando que falha faz o `fetch()` lançar uma `RuntimeException` com o `error` dele, seja qual
for a causa: uma resposta de erro do Redis (`ERR value is not an integer or out of range`), o
deadline dele (`Database operation timed out after 30 seconds.` — o `KV_TIMEOUT` limita cada
comando), um transporte perdido ou uma retirada. `command()`, `await()` e `drain()` não lançam
exceção por um comando que falhou: leia `$Operation->error`, como o loop acima faz. Uma resposta de
erro falha só o próprio comando; a conexão, e os comandos em pipeline com ele, seguem em frente.

Num transporte perdido o driver sempre derruba a sessão, seja qual for o tamanho do pool. Um
fechamento pelo peer — um `timeout` do `redis.conf`, um restart, um failover, um proxy que corta —
falha o comando em voo e todos os comandos em pipeline atrás dele naquela conexão com
`Redis socket closed.` — ou `Redis socket write failed.` quando uma escrita percebe o fechamento
antes —, falha um comando ainda não escrito com
`Redis connection was torn down before the command was sent.`, e tira a conexão do pool; o próximo
comando abre uma nova. A falha é,
portanto, transitória: os comandos em voo quando o transporte morreu são perdidos e precisam ser
refeitos pelo chamador, mas o KV do worker continua funcionando.

Comandos não ficam presos a uma conexão: comandos consecutivos de uma requisição podem rodar em
conexões diferentes do pool, e numa conexão única toda requisição do worker faz pipeline atrás das
outras. Um comando bloqueante (`BLPOP`, `XREAD BLOCK`, `WAIT`) segura todo comando enfileirado atrás
dele até retornar — três `BLPOP` de 1 segundo levaram 3 s numa conexão, 1 s com `Pool->Max` sem
bind. Um comando que muda a conexão dele alcança quem a compartilha: o `GET` de outra requisição
enviado entre o seu `MULTI` e o seu `EXEC` responde `QUEUED` e roda dentro da sua transação, e com
mais conexões o seu `EXEC` pode cair numa que nunca viu o `MULTI` (`ERR EXEC without MULTI`); um
`SELECT` troca o banco dos comandos atrás dele; um `SUBSCRIBE` deixa a conexão inscrita — no RESP2,
o padrão, ela passa a recusar comandos comuns, então na conexão única do exemplo todo `GET` ou `SET`
seguinte do worker falha — e um em vários canais entrega as confirmações extras dele aos comandos
atrás dele como respostas. Nunca envie `SUBSCRIBE`, `PSUBSCRIBE`, `SSUBSCRIBE` nem `MONITOR` pelo
resource. Faça uma atualização atômica de vários passos como um único script `EVAL`, e veja
**[Banco KV](/manual/ADI/Databases/KV/overview/)** para os limites da fachada.

## Retirada e limpeza do KV

Quando uma espera de `fetch()`, `await()` ou `drain()` não volta — recusada pelo selector,
interrompida por um timeout do `defer()` ou encerrada pela desconexão do cliente — ela retira o que
aguardava. Numa exceção só os comandos aguardados saem, e a exceção continua chegando ao seu
handler, que pode capturá-la e seguir usando os outros (se a própria retirada falhar, a exceção dela
propaga no lugar, com a original no fim da cadeia de `getPrevious()` dela). Quando o Fiber da
requisição é destruído enquanto estacionado numa dessas esperas, todo comando não terminado que ele
emitiu por este resource também é retirado.

Antes de retirar, o resource dá a cada comando que já aguarda a resposta uma leitura não
bloqueante: um cuja resposta já chegou termina nela, com essa resposta, e sua conexão continua de
pé. Os demais falham com `Database operation was withdrawn: its caller stopped waiting.` e liberam
sua vaga no pool. Um comando retirado que já está no fio fecha a sessão dele, a menos que um
comando que não está sendo retirado ainda leia naquela conexão, e um que ainda está sendo escrito
ou discado sempre a fecha: a conexão não é devolvida aberta, e o próximo comando a disca de novo
(mais TLS, `AUTH` e `SELECT` quando configurados). Um comando retirado enquanto ainda esperava uma
conexão nunca foi enviado e nunca roda; um já enviado pode ter rodado no servidor, embora falhe
como retirado.

Comandos que ninguém aguarda também são cobertos. Quando um job deferred termina, a resposta limpa
os resources do próprio job e os mantém montados — `Resources::release()` chama `clean()` em toda
instância que o job construiu a partir de uma definição registrada, este resource incluído — então
um stream que o job abriu, como o SSE, continua alcançável pela resposta. O `clean()` deste resource
trata do mesmo jeito todo comando não terminado emitido por ele: um que você nunca aguardou, um
deixado para trás por uma exceção não capturada, um emitido por um Fiber destruído enquanto
estacionado em outra espera (uma query de banco, por exemplo), ou um emitido fora de qualquer Fiber.
Aguarde todo comando de cujo efeito você depende.

Aguarde um comando pelo resource que o emitiu. Entregar a `Operation` a outro job deferred — um
`defer()` aninhado, por exemplo — e aguardá-la lá não é suportado: quando o job que a emitiu
termina, o resource dele retira o comando mesmo enquanto esse outro job ainda o aguarda, e, a menos
que a resposta dele já tenha chegado, o comando falha como retirado em vez de entregá-la.

O mesmo vale para o handler síncrono e o `defer()` dele. `$Response->KV` no handler e
`$Response->KV` dentro do `defer()` são instâncias diferentes: o deferral roda num clone da
resposta, que constrói a sua própria. A instância do handler fica na resposta do worker até a
próxima requisição do worker resetá-la, e esse reset retira um comando emitido antes do `defer()`
que ainda não tem resposta, mesmo enquanto o deferral o aguarda. A próxima requisição pode vir de
qualquer cliente, então isso falha sob carga e passa com um único cliente em desenvolvimento. Emita
o comando dentro do deferral:

```php
// ❌ issued by the handler's instance, awaited by the deferral's
$Operation = $Response->KV->command('SET', ['bootgly:demo', 'async-kv']);

return $Response->defer(function (Response $Response) use ($Operation): void {
   $Response->KV->await($Operation);
});
```

```php
// ✅ issued and awaited inside the deferral
return $Response->defer(function (Response $Response): void {
   $Response->KV->fetch('SET', ['bootgly:demo', 'async-kv']);
});
```

Só instâncias apoiadas numa definição, como a que o `KV::provide()` registra, são limpas por job.
Uma instância que você mesmo monta — `$Response->mount()`, que chama `Resources::set()`, sem
definição registrada — é carregada para todo clone da resposta e compartilhada entre contextos,
então não é limpa quando um job termina: seus comandos não terminados só são retirados por uma
espera que não volta, ou quando a própria instância é destruída.

## Métodos do KV

```php
provide (string $configs): Closure
```

Factory estática. Não lê nada por si: retorna um `Closure(object): KV` lazy para
`Response\Configs(Resources:)`, que constrói um banco `KV` por worker a partir do escopo `kv` do
diretório `configs/` do projeto informado — um caminho que termina com `/` — com um pool de até
`KV_POOL_MAX` conexões, `8` quando o escopo não define nenhum, e um resource novo em volta dele para
cada resposta. O closure lança `RuntimeException` quando o contexto não é um `Response`, e a
`RuntimeException` `Enable KV_ENABLED=true…` quando o escopo não carrega ou o `Enabled` dele não é o
booleano `true` (veja [Registrar o resource KV](#registrar-o-resource-kv)); erros lançados enquanto
o escopo carrega ou é convertido (um `cast:` que falhou, um `KV_DRIVER` não suportado, uma chave
`required: true` ausente) se propagam inalterados.

```php
command (string $command, array $arguments = []): Operation
```

Cria um comando e o avança uma vez, sem aguardá-lo. Numa conexão pronta — uma ociosa ou, com o pool
cheio, uma ocupada em que ele entra em pipeline — isso escreve o comando na hora. Um que abre a
própria conexão é escrito quando é avançado de novo; um estacionado em `pending` — nenhuma conexão
pode recebê-lo, como num pool cheio cujas conexões ainda estão todas sendo abertas — é escrito
quando algo o avança: a liberação que o promove, ou o await dele. Emita vários e passe-os para
`drain()` para sobrepor os round-trips.

```php
fetch (string $command, array $arguments = []): mixed
```

Cria um comando, aguarda e retorna a resposta decodificada dele. Lança `RuntimeException` com o
`error` do comando quando ele falha, seja qual for a causa: uma resposta de erro do Redis, o timeout
dele, um transporte perdido ou uma retirada.

```php
await (Operation $Operation): Operation
```

Estaciona o Fiber da resposta na prontidão da operação até ela terminar, e a retorna. Um comando
que falhou não lança exceção: leia `$Operation->error`. Lança `RuntimeException`
(`KV response resource is not bound.`) quando a instância nunca foi anexada a uma resposta e
precisa esperar.

```php
drain (array $Operations): array
```

Aguarda um grupo de operações e o retorna, com as chaves mantidas, quando todas terminaram. Cada
passagem avança toda operação não terminada e então re-escaneia o grupo inteiro — respostas em
pipeline chegam em ordem, então avançar um comando posterior pode terminar os anteriores — e
estaciona na prontidão da primeira ainda não terminada. Como o `await()`, não lança exceção por um
comando que falhou, e lança `KV response resource is not bound.` quando a instância nunca foi
anexada a uma resposta e precisa esperar.

```php
__construct (KVDatabase $KV)
```

Encapsula uma fachada `Bootgly\ADI\Databases\KV` (importada como `KVDatabase`). O `provide()` o
chama. Uma instância que você mesmo constrói só consegue esperar depois de anexada a uma resposta —
retornada por uma factory de `Response\Configs(Resources:)` ou montada com `$Response->mount()`
(veja [Retirada e limpeza do KV](#retirada-e-limpeza-do-kv) para a diferença entre as duas).

```php
public KVDatabase $KV
```

A fachada encapsulada — com o `provide()`, a única por worker que toda resposta compartilha. É o
caminho para o pool (`$Response->KV->KV->Pool`) e para o que o resource não expõe. Não chame o
`await()` dela numa rota: ele bloqueia o worker até a resposta chegar.

```php
schedule (Closure $Wait): static
```

Faz o bind da bridge de espera da resposta. O framework o chama quando o resource é anexado a uma
resposta.

```php
clean (): void
```

Devolve os comandos que esta instância emitiu e deixou sem terminar: um cuja resposta já chegou é
terminado por uma leitura não bloqueante, os demais são retirados. A resposta o chama quando um job
deferred termina, e a instância quando é destruída.

## Registrar o resource HTTP

`HTTP` é a perna de saída da mesma ideia. Ele encapsula um `HTTP_Client_CLI` nativo embarcado no
reactor do worker, então uma rota pode chamar outro serviço de dentro do `defer()` enquanto o
worker continua atendendo suas outras conexões. Registre-o uma vez, pelo nome:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\HTTP;

$HTTP_Server_CLI->configure(
   new ServerConfigs(host: '0.0.0.0', port: 8080, workers: 4),
   new ResponseConfigs(
      Resources: [
         'Upstream' => static fn (object $Context): HTTP => new HTTP(
            host: 'api.example.com',
            secure: [],
         ),
      ]
   )
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

Toda resposta do upstream é limitada a 16 MiB por padrão — uma única resposta do upstream (ou de
qualquer destino de redirect para onde ele te mande) não consegue passar desse teto. Uma resposta acima do
teto chega ao seu handler como `code` `0` com `status` `'Response Too Large'`. Defina
`maxResponseBytes` para dimensioná-lo ao upstream em que você confia:

```php
'Reports' => static fn (object $Context): HTTP => new HTTP(
   host: 'reports.example.com',
   secure: [],
   maxResponseBytes: 64 * 1024 * 1024,
),
```

A factory roda de forma lazy no worker, na primeira vez que um deferral lê o nome — e roda de
novo no próximo deferral. Cada um recebe portanto sua própria instância de `HTTP`, com seu próprio
client embarcado novinho, adotado pelo reactor do worker; nunca um protótipo compartilhado cujo
pool, registro de conexões e hooks vazariam entre deferrals. Construir um `HTTP` fora do reactor
do servidor lança `RuntimeException`:
`HTTP response resource requires the HTTP server reactor — construct it from a Response\Configs(Resources:) factory.`

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
`Truncated Response`, `Response Too Large`, `Response Header Fields Too Large`,
`Invalid Response`, `Redirect Failed`, `Redirect Refused`, `Too Many Redirects`, `Insecure Redirect` ou `Invalid Chunked Encoding`. Uma rota que lê só o `code` já trata todas elas como "sem resposta";
leia o `status` quando o motivo importar.

Redirects ficam no upstream. O client do resource já vem preso ao esquema, ao host e à porta com
que você o construiu: um redirect para a mesma origem é seguido, e um salto para qualquer outro
lugar faz a perna falhar com `code` `0` e status `Redirect Refused` antes de qualquer coisa ser
enviada para lá — um upstream não consegue ricochetear as requisições do worker, com suas chaves de
API e bodies, para um serviço que o worker alcança. Quando um upstream redireciona legitimamente
para outro lugar — uma CDN, um host de arquivos —, troque a política na factory:

```php
'Upstream' => static function (object $Context): HTTP {
   $HTTP = new HTTP(host: 'api.example.com', secure: []);
   // ! One more trusted destination, over TLS only
   $HTTP->Client->Redirection = static fn (string $host, int $port, bool $secure): bool =>
      $secure && ($host === 'api.example.com' || $host === 'files.example.com');

   return $HTTP;
},
```

`$HTTP->Client->Redirection = null` segue qualquer alvo http(s). De todo modo, um salto para outra
origem leva só os `crossOriginHeaders` do client — nunca `Authorization`, cookies ou chaves de API
(veja [Tratamento de Redirects](/manual/WPI/HTTP/HTTP_Client_CLI/#tratamento-de-redirects)). Dentro de
`batch()` o pino recusa os mesmos saltos; um salto para a mesma origem que precisa de outra conexão
volta como o 3xx final, já que um batch nunca redisca.

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
  `HTTP response resource was attached to another response while owned — a carried instance cannot serve interleaved deferred contexts; register it as a Response\Configs(Resources:) factory instead.`

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
__construct (string $host, null|int $port = null, null|array $secure = null, null|array $pool = null, int|float $timeout = 30, int|float $connectTimeout = 30, int $maxRedirects = 10, int $maxRetries = 0, null|bool $enableHTTP2 = null, null|int $maxResponseBytes = null)
```

Constrói o resource e o `HTTP_Client_CLI` novo que ele embarca no reactor do worker. `$host` é o
host do upstream; `$port` tem default `80`, ou `443` quando `secure` está definido; `$secure`
carrega opções de stream context TLS (`[]` liga o TLS com os defaults); `$pool` limita o pool de
conexões dentro de um deferral (`['min' => N, 'max' => N]`); `$timeout` é o timeout de resposta em
segundos (`0` = sem timeout); `$connectTimeout` é o timeout de conexão por tentativa de discagem e
sozinho limita a discagem **e** o handshake TLS (`0` = sem timeout); `$maxRedirects` limita o
seguimento de redirects, que fica dentro da origem do upstream (`0` = desabilitado); `$maxRetries` limita as retentativas em falha de
conexão/timeout (`0` = desabilitado); `$enableHTTP2` escolhe a negociação HTTP/2 (`null` = ALPN
quando secure; `true` = também h2c; `false` = nunca); e `$maxResponseBytes` limita os bytes raw de
cada resposta do upstream (`null` = o default do client, 16 MiB; `0` = ilimitado). Lança `RuntimeException` quando construído
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
aqui: `retryOn`, `retryDelay`, `retryMaxDelay`, `retryTimeout`, `retryJitter`,
`allowInsecureRedirect`, `Redirection` (preso à origem do upstream por padrão),
`crossOriginHeaders`, `enableHTTP2` e a família do `timeout`. Nunca envie por ele.

## Resources mantidos além do job deferred

Dentro do `defer()`, a `$Response` que o seu trabalho recebe é um clone privado da resposta do
worker, e os resources que você lê dela — `$Response->JSON`, `$Response->Database`, um resource de
projeto — são construídos para esse clone. Quando o job termina, o clone é liberado assim que nada
mais o segura.

Se o seu código mantém o próprio clone, nada muda: os resources alcançados por ele continuam
respondendo nele exatamente como antes. A troca (exchange) dele acabou, então envios tardios caem
nele e nunca são escritos, e um `defer()` ou um head de SSE nele é recusado.

Se o seu código mantém só um resource, ou o registro `Resources`, e não o clone, toda chamada feita
depois que o clone se foi ainda termina, e toda `Response` com que uma delas responde — o `send()`
de um formatador, uma espera — é uma **substituta desacoplada** (detached stand-in):

- uma nova a cada chamada — nada que uma chamada escreve (body, headers, status) alcança outra;
- deferred e sem requisição nem conexão, então nunca é escrita em lugar nenhum — um handler ou uma
  rota que a retorna deixa a requisição dele sem resposta, como faz qualquer `Response` deferred que
  nenhum job responde;
- nunca adotada como a `Response` do worker, que mantém seus resources configurados e os presets do
  Header;
- um middleware `Recovering` que a retorna recusa (decline) — a próxima fronteira para fora, ou a
  resposta de erro do próprio servidor, responde no lugar (veja
  [Middlewares](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares)).

Uma chamada tardia nunca lança exceção, então o erro é silencioso. Leia os resources da `$Response`
que o trabalho recebe, toda vez:

```php
// ❌ kept across requests: from the second request on, its send never reaches the request
//    being answered, which goes out as an empty 200
static $JSON = null;

return $Response->defer(function (Response $Response) use (&$JSON): void {
   $JSON ??= $Response->JSON;

   $JSON->send(['status' => 'ok']);
});
```

```php
// ✅ read from the Response the work receives
return $Response->defer(function (Response $Response): void {
   $Response->JSON->send(['status' => 'ok']);
});
```

## Fronteira

Resources não substituem `Response`. Mantenha status codes, headers e entrega de body na
`Response`, e use resources apenas para capacidades focadas de resposta.

`Database`, `KV` e `HTTP` são as pontes async desse conjunto: elas estacionam o Fiber deferido
na prontidão (readiness) em vez de bloquear o worker, então o lugar delas é dentro do
`defer()` — nunca no caminho síncrono da rota.
