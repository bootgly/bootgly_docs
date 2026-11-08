# HTTP Server CLI — Middlewares

Os middlewares no HTTP Server CLI seguem um padrão de **pipeline onion**. Cada middleware envolve o próximo, permitindo que lógica seja executada antes (pré-processamento) e depois (pós-processamento) do handler da requisição.

## Escopos de Registro

Middlewares podem ser registrados em três níveis:

### Global (SAPI)

Aplicado a **toda** requisição processada pelo servidor:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\API\Workables\Server as SAPI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CORS;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Compression;

SAPI::$Middlewares->prepend(new CORS);       // Add to the beginning
SAPI::$Middlewares->append(new Compression); // Add to the end
SAPI::$Middlewares->pipe(new CORS, new Compression); // Add multiple at once
```

### Grupo de Rotas

Aplicado a todas as rotas definidas após `intercept()`, no escopo do contexto atual do Router:

```php
$Router->intercept(
   new CORS,
   new RateLimit(limit: 100, window: 60, scope: 'public-api')
);

yield $Router->route('/api/:*', function ($Request, $Response) use ($Router) {
   // All routes inside this group inherit CORS + RateLimit
   yield $Router->route('/users', function ($Request, $Response) {
      return $Response->JSON->send(['users' => []]);
   }, GET);
}, GET);
```

### Nível de Rota

Aplicado a uma única rota específica:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;

yield $Router->route('/login', function ($Request, $Response) {
   // ...
}, POST, middlewares: [new RateLimit(limit: 5, window: 60, scope: 'auth-login')]);
```

Quando middlewares de grupo e de rota estão presentes, eles são **mesclados** — middlewares de grupo executam primeiro, depois os de rota, formando um único pipeline onion ao redor do handler.

## Métodos de Registro

| Método | Descrição |
|---|---|
| `prepend(Middleware $Middleware)` | Adiciona um middleware no **início** do pipeline |
| `append(Middleware $Middleware)` | Adiciona um middleware no **final** do pipeline |
| `pipe(Middleware ...$middlewares)` | Adiciona um ou mais middlewares no final de uma vez |

## Fronteiras de Erro e Trabalho Deferred

Um middleware que envolve `$next()` em `try`/`catch` é uma fronteira de erro só para handlers **síncronos**. Uma resposta deferred (`$Response->defer()`) executa seu trabalho depois que o pipeline já retornou — o handler retorna na hora e o trabalho roda depois, numa Fiber do pool — então um `Throwable` lançado dentro desse trabalho nunca chega ao `catch` em volta de `$next()`: o próprio servidor responde (`500 Internal Server Error`; `503 Service Unavailable` para um `Response\Timeout` ou um `Decoders\Bodies\Refusal`).

Para responder também a essas falhas, implemente `Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Recovering` — um `Middleware` com um método a mais, `recover()`, que o servidor chama quando o trabalho deferred lança:

```php
namespace Demo\Blog\Middlewares;

use Closure;
use Throwable;

use Bootgly\ABI\Debugging\Data\Throwables;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Timeout;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Recovering;

class Errors implements Recovering
{
   public function process (object $Request, object $Response, Closure $next): object
   {
      try {
         return $next($Request, $Response);
      }
      catch (Throwable $Throwable) {
         Throwables::notify($Throwable, ['interface' => 'WPI']);
         $Response->Header->set('Content-Type', 'application/json');
         return $Response(code: 500, body: '{"error":"internal"}');
      }
   }

   public function recover (Request $Request, Response $Response, Throwable $Throwable): null|Response
   {
      $Response->Header->set('Content-Type', 'application/json');

      if ($Throwable instanceof Timeout) {
         return $Response(code: 503, body: '{"error":"timeout"}');
      }

      Throwables::notify($Throwable, ['interface' => 'WPI']);
      return $Response(code: 500, body: '{"error":"internal"}');
   }
}
```

Registre-o exatamente como qualquer outro middleware — global, de grupo ou de rota. Quando o trabalho deferred lança, os middlewares da rota são consultados em ordem, **do mais interno para o mais externo** (os de nível de rota antes das entradas do `intercept()` do grupo), e depois o pipeline global `SAPI::$Middlewares`, da última entrada para a primeira. A primeira `Response` devolvida é enviada como está; devolva `null` para declinar. Uma `Response` deferred sem requisição — a substituta desacoplada (detached stand-in) com que responde um resource mantido além do próprio job deferred (veja [Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources)) — não é resposta: devolvê-la também declina, assim como uma `Response` nova que a própria fronteira marcou com `defer()` (sem transporte, `defer()` não executa nada e só liga a flag). Um `recover()` que lança entrega o **novo** `Throwable` às fronteiras mais externas, exatamente como um relançamento dentro de `process()` alcança o middleware que o envolve. Quando ninguém responde, a resposta de erro do próprio servidor é enviada. Um `Response\Timeout` também é oferecido: ele é um orçamento do servidor, não um erro da aplicação — é registrado como warning antes de qualquer fronteira ser consultada, seja qual for a resposta vencedora — decline para manter o `503`, ou responda com uma indisponibilidade explícita sua.

O reporte segue a resposta. A entrada única `Throwables::notify()` do framework roda quando a resposta de erro built-in responde a um erro da aplicação — então uma fronteira que responde a um `Throwable` genérico também é dona do reporte, e precisa chamar `Throwables::notify()` ela mesma se quiser que o canal `exceptions`, o contador `exceptions_total` e os seus reporters vejam a falha. É a mesma regra que um `catch` síncrono em volta de `$next()` sempre seguiu (um `Response\Timeout` nunca é reportado, em nenhum dos casos: é um orçamento do servidor, registrado como warning). O `Web\API\Problems` built-in já faz isso em Production/Staging.

`recover()` roda dentro da Fiber deferred com o snapshot do request ligado: `$Request` é o request que o trabalho estava respondendo (o mesmo objeto que `$Response->Request`), a Route casada e seus `Params` continuam no lugar, e uma Session escrita antes do throw é persistida seja qual for a resposta vencedora. `$Response` é o clone deferred como o trabalho o deixou — assim como o `$Response` de uma fronteira síncrona carrega o que o handler escreveu — então responder nele mantém o que já está lá: headers que o trabalho definiu, um cookie de sessão definido no primeiro toque, um arquivo enfileirado. Uma fronteira que quer uma representação própria — um corpo de erro que não venha concatenado a um arquivo enfileirado — retorna um `Response` novo em vez de responder no lugar. Responda de forma síncrona: `wait()` não é recusado, mas a caminhada não é ilimitada — quando a geração tem orçamento (`defer(timeout:)` ou `deferredTimeout`), uma fronteira estacionada é interrompida com um `Response\Timeout` novo no seu ponto de espera depois de um orçamento re-armado para a caminhada; esse Timeout substitui o Throwable que foi oferecido, segue para fora como qualquer `recover()` que lança, e termina no `503` built-in quando mais ninguém responde. Sem orçamento, só o teardown do transporte a limita. A fronteira é consultada só por `recover()`, nunca executando o pipeline de novo: `process()` não é reexecutado, então middlewares de admissão na mesma cadeia não rodam duas vezes.

As fronteiras são a cadeia com que a rota foi despachada, capturada enquanto o pipeline roda. Um deferral iniciado depois de o pipeline retornar — de um listener `Request\Events::Handled`, ou de um middleware global depois do seu `$next()` — não carrega a cadeia da rota: só o pipeline global `SAPI::$Middlewares` recebe suas falhas. Trabalho que já fez o handoff da geração não é oferecido a nenhuma fronteira: um `$Response->SSE->open()` bem-sucedido e um `defer()` aninhado liquidam a geração, então um `Throwable` lançado depois desse handoff não chega a nenhum `recover()`, a nenhuma resposta de erro built-in nem ao `Throwables::notify()` — o cliente SSE fica com o stream que recebeu, sem evento de erro e sem chunk terminador, e a resposta do próprio filho aninhado é o que o cliente vê. Reporte dentro do trabalho, antes do handoff, quando essa falha precisar ser visível. (Um handoff feito de dentro de `recover()` é outro caso: a fronteira o escolheu.) Um `defer()` aninhado feito de dentro de `recover()` herda a cadeia, então um filho que lança é oferecido às mesmas fronteiras de novo — uma fronteira que reporta por um filho não pode deixar esse filho lançar.

Headers definidos por um middleware **depois** de `$next()` não chegam sozinhos a uma resposta deferred: nesse ponto o pipeline já retornou, e a resposta é montada depois, dentro do trabalho. Defina-os dentro do trabalho — ou implemente [`Sealing`](#sealing-de-respostas-deferred) no mesmo middleware para que essa decoração rode de novo na liquidação.

## Sealing de Respostas Deferred

O onion de rota é síncrono. O código que um middleware roda **depois** de `$next()` — um header de política, um validador, uma codificação de corpo — muta a `Response` viva enquanto o onion desenrola, enquanto uma geração deferred responde por um clone privado tirado dentro de `defer()`, antes desse desenrolar acontecer. Essas mutações nunca chegam ao fio deferred, então um decorador pós-`$next()` é silenciosamente perdido numa rota deferred. (Uma mutação **pré**-`$next()` sobrevive: o clone a herda.)

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Sealing` é a metade que faltava. Um middleware que também o implementa recebe a `Response` deferred na liquidação, imediatamente antes da serialização, com o resultado **real** no lugar — status final, headers finais, corpo final:

```php
namespace Demo\Blog\Middlewares;

use Closure;

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middleware;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Sealing;

class Policy implements Middleware, Sealing
{
   /**
    * @param Request $Request
    * @param Response $Response
    */
   public function process (object $Request, object $Response, Closure $next): object
   {
      $Result = $next($Request, $Response);

      // @ One pass serves both cycles: here on the unwind, in seal() at settlement
      $this->seal($Request, $Result);

      return $Result;
   }

   public function seal (Request $Request, Response $Response): void
   {
      // ? Idempotent: set() replaces, so sealing the same answer twice is harmless
      $Response->Header->set('X-Policy', 'strict');

      if ($Response->code >= 500) {
         $Response->Header->set('Cache-Control', 'no-store');
      }
   }
}
```

`Sealing` é uma **capacidade, não uma segunda porta**: ele deliberadamente não estende `Middleware`, então a única entrada do pipeline continua sendo `implements Middleware` e um middleware de sealing declara os dois. A paridade entre os dois ciclos continua sendo trabalho do autor — compartilhe a lógica por um método privado que ambos chamam, ou chame `seal()` logo depois de `$next()` como acima. Os `ETag` e `Compression` que acompanham o framework implementam `Sealing`, então uma rota deferred recebe tag e compressão exatamente como uma síncrona.

**Quando a passagem roda.** No caminho de sucesso: depois que o trabalho terminou, antes da serialização, e **antes** do ponto de save da Session deferred — então uma Session escrita por um seal ainda persiste com a geração. No caminho de erro ela roda sobre a resposta que uma fronteira de erro ou o Catcher built-in escolheu, então um seal sempre vê o status que vai para o fio, nunca o placeholder com que o onion retornou. As duas passagens caminham na ordem em que o desenrolar síncrono roda o código pós-`$next()`: o snapshot de middlewares da rota **do mais interno para o mais externo**, depois a pilha global `SAPI::$Middlewares` — a mesma visibilidade que `Recovering` documenta. Um deferral iniciado depois de o pipeline retornar não carrega a cadeia da rota, então só a pilha global é percorrida.

**Mute no lugar.** `seal()` não retorna nada. Defina headers, reescreva o corpo, ou responda uma condicional (`$Response(code: 304, ...)`) — `__invoke` muta o mesmo objeto.

**Lançar.** No caminho de sucesso, um throw vindo de `seal()` pula os seals restantes e segue para as fronteiras `Recovering`, exatamente como um throw depois de `$next()` pula o código pós externo e alcança o middleware que o envolve; a resposta de erro escolhida lá é então oferecida à passagem de sealing **de novo** — então sele de forma idempotente, do jeito que `Header->set()` naturalmente é. No caminho de erro um seal que lança é contido e reportado por `Throwables::notify()`: a resposta já escolhida nunca é sacrificada por um decorador.

**Sele de forma síncrona.** `wait()` não é recusado, mas no caminho de sucesso o deadline do orçamento da geração continua armado — um seal estacionado é interrompido com `Response\Timeout` exatamente como o próprio trabalho.

## Middlewares Built-in

Todos os middlewares built-in estão no namespace `Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares`.

---

### AccessLog

Uma linha de log por requisição, num canal próprio — o access log que o próprio servidor nunca escreve.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\AccessLog;

new AccessLog(
   channel: 'HTTP.Server.CLI.access', // Log channel → storage/logs/HTTP.Server.CLI.access.log (default)
   header: 'X-Request-Id',            // Response header the request id is read back from; null = no id (default: 'X-Request-Id')
   query: false,                      // Keep the query string in the logged target (default: false)
   Formatter: null                    // fn (array $entry): string — your own line (default: the line below)
);
```

Registre-o **uma vez por canal, global e mais externo** — o primeiro middleware do pipeline global, para toda requisição passar por ele:

```php
use Bootgly\API\Workables\Server as SAPI;

SAPI::$Middlewares->pipe(new AccessLog, new TrustedProxy(proxies: [/* ... */]), new RequestId);
```

Isso é cobertura total trocada pelo [cache de resposta de rotas](/manual/WPI/HTTP/HTTP_Server_CLI/Router): um pipeline global com qualquer middleware torna toda resposta não-cacheável e pula o replay, então rotas com `cache:` param de armazenar enquanto este middleware estiver instalado globalmente. `$Router->intercept(new AccessLog)` registra uma instância **de rota** — ela registra só as rotas declaradas depois dela e, como todo middleware de rota, torna essas rotas inelegíveis para o cache também.

Toda requisição então escreve uma linha, qualquer que seja o desfecho — e só uma:

```text
GET /api/health → 200 in 0.2ms
POST /api/account/sign-in → 401 in 353ms
GET /api/report → cancelled after 15002.4ms
```

A severidade segue o desfecho — 5xx `error`, 4xx `warning`, requisição cancelada `notice`, o resto `info` — então o filtro por severidade já separa ruído de problema:

```bash :toolbar="true";
bootgly logs -f --channel=HTTP.Server.CLI.access
bootgly logs --channel=HTTP.Server.CLI.access --level=warning --since=1h
```

O contexto de cada registro carrega os campos brutos (`--json` e o detalhe do viewer os mostram):

| Campo | Significado |
|---|---|
| `method`, `URI`, `protocol` | a linha da requisição — `URI` sem a query a menos que `query: true`; `protocol` é `HTTP/1.1` ou `HTTP/2` |
| `code` | o status que a resposta levou; `null` numa requisição cancelada |
| `ms` | duração — a do handler numa resposta síncrona, a da geração inteira (tempo estacionado incluído) numa deferred |
| `bytes` | bytes do body como o middleware os viu (depois dos middlewares internos, como `Compression`); `null` num throw ou num handoff |
| `peer`, `address` | o peer do socket (não se falsifica) e o endereço do cliente visto pela aplicação — atrás de proxy, o que o [TrustedProxy](#trustedproxy) resolveu |
| `id` | o id da requisição lido de `header` — o que o [RequestId](#requestid) carimbou |
| `deferred`, `cancelled` | como a requisição se desfechou |
| `throwable` | a classe do Throwable que saiu da cebola (throw síncrono → 500) |

**Respostas deferred e requisições canceladas.** Uma rota deferred responde depois de a cebola desenrolar, então uma linha pós-`$next()` comum registraria o status placeholder e ~0 ms. O `AccessLog` deixa o ciclo de vida da requisição fechar a linha: ele dispara quando a resposta é escolhida — a do trabalho, a de um boundary ou a do Catcher (orçamento estourado é o 503 do Catcher) — e também quando **não há** resposta: o cliente saiu com a resposta estacionada, ou a geração foi abandonada. Essa requisição também ganha sua linha, como `cancelled`, com o tempo que ficou estacionada. Nenhum middleware de aplicação consegue registrar esse caso; é a razão de o middleware vir com o framework.

**Sua própria linha.** O `Formatter` recebe os campos do desfecho mais dois neutralizados — `target` (o alvo da requisição) e `method` — e devolve a mensagem:

```php
new AccessLog(Formatter: static fn (array $entry): string => "{$entry['method']} {$entry['target']} {$entry['code']} {$entry['ms']}ms")
```

O alvo bruto está deliberadamente ausente do que o formatter recebe: a mensagem é renderizada pelo motor de template do Output, onde todo `@` abre uma diretiva, e o alvo é controlado pelo cliente. Todo `@` e todo byte fora do ASCII imprimível chegam em `target` como `%XX` (`%40` é como um `@` se escreve numa URI, afinal), limitado a 120 caracteres. O contexto, que é dado, mantém os valores brutos — exceto um valor que não seja UTF-8 válido, que faria o encoder JSON recusar o registro inteiro: ele também é guardado codificado, e `encoded: true` diz isso. Devolva a mensagem sem quebra de linha no fim: o formatter de log termina cada registro por conta própria. Um formatter que falha custa a forma da sua linha, nunca a requisição: a linha padrão é escrita no lugar.

**O que ele não vê.** Um `AccessLog` de rota registra só as suas rotas — nunca o catch-all 404, uma resposta que um middleware global cortou (401/403/429, um preflight CORS) ou uma deferred iniciada fora da sua cadeia. Nenhum dos dois registra o health probe, o responder ACME ou uma requisição que o decoder rejeitou antes do roteamento. Uma resposta cuja codificação falhou depois de uma resposta de erro se desfecha como `cancelled`. Duas instâncias escrevem duas linhas — uma por canal.

**Ele nunca torna uma chave de cache não-compartilhável.** Nada fica guardado na própria requisição: a entrada de uma geração deferred é mantida presa ao token de ciclo de vida daquela geração. O bag de atributos por requisição é o que o cache de rotas usa para particionar, e a chave é composta duas vezes — antes do pipeline para buscar uma entrada, depois dele para guardar uma — então qualquer coisa escrita lá durante a requisição faria as duas divergirem e toda entrada guardada ficaria inalcançável.

**Fase:** Ambas — o pré-processamento abre a entrada; o pós-processamento escreve a linha síncrona, o ciclo de vida escreve a deferred.

---

### Authentication

Protege rotas com guards ordenados de Basic, Bearer, JWT e Session. A autenticação é configurada com uma estratégia `Authenticating` e executada pelo middleware `Authentication`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Bearer;

$Bearer = new Authenticating(
   new Bearer(function (string $token): bool {
      return $token === 'demo-bearer-token';
   })
);

yield $Router->route('/private', $Handler, GET, middlewares: [new Authentication($Bearer)]);
```

Veja a página [Authentication](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/) para Bearer, JWT, Basic, Session, challenges pertencentes ao middleware e rotas demo.

**Fase:** Pré-processamento — rejeita requisições não autenticadas antes do handler executar.

---

### Authorization

Protege rotas autenticadas com gates ordenados de Scope, Role e Policy. A autorização é configurada com uma estratégia `Authorizing` e executada pelo middleware `Authorization`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorizing;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope;

$Authorizing = new Authorizing(new Scope('demo:read'));

yield $Router->route('/private', $Handler, GET, middlewares: [new Authorization($Authorizing)]);
```

Veja a página [Authorization](/manual/WPI/HTTP/HTTP_Server_CLI/Authorization/) para gates Scope, Role, Policy, respostas de negação e limite entre API/RBAC.

**Fase:** Pré-processamento — rejeita requisições não autorizadas antes do handler executar.

---

### CORS

Gerencia a validação de Cross-Origin Resource Sharing e requisições preflight (`OPTIONS`).

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CORS;

new CORS(
   origins: ['https://example.com'],      // Allowed origins (default: [] — empty allowlist; pass ['*'] for wildcard)
   methods: ['GET', 'POST'],              // Allowed methods (default: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'])
   headers: ['Content-Type'],             // Allowed headers (default: ['Content-Type','Authorization'])
   maxAge: 86400,                         // Preflight cache in seconds (default: 86400)
   credentials: false,                    // Allow credentials (default: false)
   expose: ['X-Request-Id']               // Response headers readable by scripts (default: [])
);
```

> **Seguro por padrão.** `origins` usa por padrão uma **allowlist vazia** — toda requisição
> cross-origin é rejeitada (`403`) até você listar as origens confiáveis. Passe `origins: ['*']`
> para optar por uma política wildcard (independente de origem). Quando o `Origin` da requisição
> é refletido (correspondência na allowlist), `Vary: Origin` é emitido para que um cache
> compartilhado (CDN / proxy reverso) nunca sirva a resposta de uma origem para outra. Uma
> allowlist sem `Origin` na requisição não emite `Access-Control-Allow-Origin` — nunca cai
> para `*`.

`expose` lista os headers de resposta que um script do navegador pode ler além dos CORS-safelisted. Ele é enviado como `Access-Control-Expose-Headers: A, B` em respostas reais (não preflight) para uma origem permitida — nunca em um preflight, nunca em uma origem rejeitada, e não em uma requisição sem `Origin` sob uma allowlist. Cada nome precisa ser um token da RFC 9110; qualquer outra coisa (um espaço, uma lista unida por vírgula, um caractere de controle, um valor não string) lança `InvalidArgumentException`. Vazio (o padrão) omite o header. Um endpoint MCP, por exemplo, expõe seus headers de sessão e de challenge:

```php
new CORS(
   origins: ['https://app.example.com'],
   headers: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
   expose: ['Mcp-Session-Id', 'WWW-Authenticate']
);
```

Registre o `CORS` antes de `Authentication`/`Authorization` para que os challenges `401`/`403` deles mantenham esses headers — veja [Protegendo um endpoint MCP](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/).

**Fase:** Pré-processamento — valida a origem e trata o preflight antes do handler executar.

---

### Compression

Comprime o corpo da resposta usando `gzip` ou `deflate` com base no header `Accept-Encoding` do cliente.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Compression;

new Compression(
   level: 6,        // Compression level 1-9 (default: 6)
   minSize: 1024    // Minimum body size in bytes to compress (default: 1024)
);
```

**Fase:** Pós-processamento — comprime o corpo da resposta após o handler produzi-lo.

> **Apenas 2xx/3xx.** Apenas corpos de sucesso e redirecionamento são comprimidos — respostas de erro `4xx`/`5xx` e de desafio de autenticação não são tocadas.

---

### ETag

Gera e valida ETags para cache HTTP. Retorna `304 Not Modified` quando o header `If-None-Match` do cliente corresponde.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\ETag;

new ETag(
   weak: true  // Use weak ETags (default: true)
);
```

**Fase:** Pós-processamento — calcula o ETag a partir do corpo da resposta após o handler executar.

> **Apenas 2xx/3xx + RFC 7232.** Um ETag é definido (e a revalidação `304` realizada) apenas para respostas de sucesso/redirecionamento — nunca para corpos de erro `4xx`/`5xx` ou de desafio de autenticação. O `If-None-Match` é avaliado conforme a RFC 7232: `*` corresponde a qualquer representação, listas separadas por vírgula são suportadas e a comparação fraca ignora o prefixo `W/`. Ordene o `ETag` **fora** do `Compression` para que o tag cubra o corpo codificado (entregue).

---

### RateLimit

Aplica limitação de taxa rastreando contagem de requisições por principal dentro de janelas de tempo. O peer TCP imutável é o principal por padrão. Retorna `429 Too Many Requests` quando excedido.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit\Algorithms;

new RateLimit(
   limit: 60,                        // Maximum requests per window (default: 60)
   window: 60,                       // Time window in seconds (default: 60)
   trustForwarded: false,            // Key on the proxy-resolved $Request->address (default: false)
   ipv6Prefix: 64,                   // Aggregate IPv6 keys to this prefix (default: /64)
   globalLimit: 0,                   // Optional cross-worker aggregate ceiling (default: 0 = off)
   algorithm: Algorithms::Sliding,   // Counting algorithm (default: Sliding; or Fixed)
   key: null,                        // Custom principal resolver fn (Request): ?string (default: IP)
   clock: null,                      // Clock the windows are counted on (default: the system Clock)
   scope: 'public-api',              // Stable per-principal policy identity (default: derived source line)
   globalScope: null                 // Aggregate policy identity (default: scope)
);
```

**Chave do contador (segurança).** Por padrão o limitador usa como chave `$Request->peer` — o **IP de transporte TCP imutável**, que um cliente não pode forjar. Isso é intencional: o `TrustedProxy` pode sobrescrever `$Request->address` a partir de um header `X-Forwarded-For` enviado pelo cliente, então usar `$address` como chave permitiria que um cliente atrás de (ou colocalizado com) um proxy confiável rotacionasse esse header e abrisse um novo balde de rate limit por requisição, burlando o limite por completo.

Defina `trustForwarded: true` **apenas** quando o servidor está atrás de um proxy genuinamente confiável e você quer baldes por cliente real — isso faz o limitador usar `$Request->address` (o IP do cliente resolvido pelo proxy) como chave. Combine com um `TrustedProxy` corretamente configurado para que esse address seja, ele próprio, confiável.

**Agregação IPv6.** Um único cliente costuma receber um `/64` inteiro, com 2⁶⁴ endereços `/128` distintos. Usar o endereço completo como chave permitiria a esse cliente criar um balde novo por requisição, então as chaves IPv6 são mascaradas para `ipv6Prefix` (padrão `/64`) — todo endereço no mesmo `/64` compartilha um contador. Chaves IPv4 são usadas por completo. Reduza o prefixo (ex.: `/56`, `/48`) para agregar de forma ainda mais agressiva.

**Algoritmo.** `Algorithms::Sliding` (padrão) é uma janela deslizante ponderada: combina a janela atual e a anterior pela fração da janela anterior ainda em vista, de modo que um cliente não consegue enviar `2 × limit` estourando na virada de janela. `Algorithms::Fixed` é o contador clássico mais barato (uma chave, reinicia no TTL) caso você não precise do suavizamento de borda.

**Escopo da política.** `scope` identifica a política lógica; `key` identifica o principal dentro dessa política. Quando `scope` é omitido, o Bootgly deriva uma identidade automática do arquivo e da linha normalizados que contêm a expressão `new RateLimit`. Assim, o mesmo local de construção compartilha contadores quando declarações lazy de rotas são construídas independentemente por workers diferentes, enquanto linhas distintas ficam isoladas. Use um escopo estável explícito em factories, subclasses, definições geradas, múltiplas políticas lógicas criadas na mesma linha física e rolling deployments críticos para segurança: reutilizar um local de construção compartilha uma política sem intenção, enquanto movê-lo altera a identidade automática e inicia uma cota nova. Valores explícitos de `scope` e `globalScope` devem conter entre 1 e 256 bytes e não podem ser vazios nem compostos apenas por espaços em branco. Um escopo de principal compartilhado ainda não mistura algoritmos ou janelas incompatíveis; essas semânticas permanecem particionadas.

**Relógio.** As janelas são contadas em segundos inteiros lidos de `clock`, um [`Clock`](/manual/ABI/Clock/overview/) — o do sistema por padrão. O `Cache` padrão dos contadores lê o mesmo Clock, então em um teste um único `Bootgly\ACI\Tests\Doubles\Fake\Clock` dirige os dois: `new RateLimit(limit: 3, window: 60, clock: $Clock)`, e então `$Clock->advance(60)` abre a próxima janela. Uma closure que retorna um timestamp Unix ainda é aceita, mas está depreciada desde a 1.1.0 e é removida na 2.0.0.

**Teto global.** `globalLimit` (padrão `0` = desligado) adiciona um contador agregado entre workers por `globalScope` e janela sobre o limite por principal. Quando `globalScope` é omitido, ele herda `scope`, portanto políticas independentes têm tetos agregados independentes por padrão. As requisições só são contadas globalmente depois de passarem na checagem por principal.

Políticas de rotas disjuntas podem compartilhar deliberadamente um teto agregado usando escopos de principal distintos e o mesmo `globalScope`, namespace de cache, janela e `globalLimit` explícitos:

```php
$LoginLimit = new RateLimit(
   limit: 5,
   window: 60,
   globalLimit: 1_000,
   scope: 'auth-login',
   globalScope: 'public-auth'
);

$ResetLimit = new RateLimit(
   limit: 3,
   window: 60,
   globalLimit: 1_000,
   scope: 'auth-reset',
   globalScope: 'public-auth'
);
```

Não empilhe instâncias de middleware com o mesmo `globalScope` no pipeline de uma requisição: cada invocação de middleware incrementa o contador agregado compartilhado, portanto uma requisição seria contada mais de uma vez.

**Chave customizada.** `key` é um resolvedor `fn (object $Request): ?string`. Retorne uma string para limitar por algo diferente do IP — o proprietário de uma API key, um id de usuário autenticado, um tenant — ou `null` para recair na chave de IP padrão. Autentique e mapeie credenciais não confiáveis para um ID de principal estável e limitado; nunca retorne o valor bruto de um header. Aqui, `$APIKeys` representa um serviço de autenticação da aplicação cujo `resolve()` retorna esse ID ou `null`.

```php
// Rate-limit by the validated API-key owner instead of IP:
new RateLimit(
   limit: 1000,
   window: 3600,
   scope: 'api-key-hourly',
   key: static fn (object $Request): ?string =>
      $APIKeys->resolve($Request->Header->get('X-Api-Key'))
);
```

> [!NOTE]
> **Migração de namespace.** Atualizar contadores legados sem escopos de política inicia contadores novos uma vez. Durante um rolling deployment com versões mistas, workers antigos e novos não compartilham uma única cota; drene os workers antigos ou considere essa divisão temporária. Após a migração, use escopos explícitos sempre que a continuidade da cota precisar sobreviver a movimentos no código ou rolling releases.

> [!WARNING]
> **Capacidade da memória compartilhada.** O backend Shared padrão tem capacidade fixa. Registros expirados deixam de contar, mas seu espaço no segmento não é recuperado automaticamente até um `$Cache->purge()` explícito; `clear()` ou a remoção do segmento também recuperam espaço, mas reiniciam todas as entradas ativas que compartilham esse segmento. Janelas deslizantes e mudanças de principal criam novos registros ao longo do tempo, e um resolvedor `key` customizado pode acelerar o crescimento. O hash do escopo da política não limita a chave customizada do principal armazenada junto dele. Nunca retorne diretamente valores ilimitados, não autenticados e controlados pelo atacante: limite tanto o comprimento quanto a cardinalidade da entrada e prefira identificadores autenticados estáveis. Aplicar hash ao principal por conta própria limita o tamanho da chave em cada entrada, mas não a quantidade de entradas. Em deployments Shared de longa duração, gerencie um cache injetado e programe `purge()` periódico fora do caminho crítico das requisições, ou escolha um backend cujas características de recuperação e operação atendam à carga. O esgotamento de capacidade pode aparecer como respostas HTTP `500`. Veja [Cache](/guide/cache/overview/) para o comportamento dos backends.

> [!NOTE]
> **Backend Redis.** Num cache Redis cada contador de janela é criado junto com a sua expiração num script `EVAL`, e o Redis confere cada comando dentro dele contra a ACL: o usuário do Redis precisa de `EVAL` mais `SET`, `INCRBY` e `GET` (e `TTL`), por exemplo `+eval +set +incrby +get +ttl` ou `+@scripting +@string`. Um `EVAL` negado ou renomeado aparece como HTTP `500`, nunca como um contador que para de expirar. Uma chave de janela que uma versão anterior já deixou sem expiração não é reparada pela atualização: apague uma vez as chaves `<prefixo>v2:*` cujo `TTL` é `-1`.

**Fase:** Pré-processamento — rejeita requisições que excedem o limite antes de alcançar o handler.

---

### BodyParser

Recusa uma requisição cujo corpo passa de `maxSize` bytes. Ele confere primeiro o header `Content-Length`, depois o tamanho do corpo que a requisição tem, e responde `413 Request Entity Too Large` com o corpo `Payload Too Large` — o handler nunca executa. Ele só mede: o servidor preenche `$Request->fields` e `$Request->files` com ele ou sem ele.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\BodyParser;

new BodyParser(
   maxSize: 1_048_576  // Maximum body size in bytes (default: 1 MB)
);
```

O padrão, `1_048_576` bytes, é 1 MiB. Na frente de um `Validator` com `Sources::Files`, ele limita o corpo multipart inteiro, então dê a ele um `maxSize` acima do maior arquivo que as regras aceitam, mais espaço para os boundaries e os headers das partes — veja a rota de upload em [Validação de Requisição](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/#exemplo-end-to-end).

**Fase:** Pré-processamento — valida o tamanho do corpo antes do handler processá-lo.

---

### CSRF

Proteção CSRF baseada em token sincronizador. Gera um token por sessão, armazena em `$Request->Session` e valida os tokens enviados nos métodos HTTP unsafe (`POST`, `PUT`, `PATCH`, `DELETE`) usando comparação timing-safe.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CSRF;

new CSRF(
   sessionKey: '_csrf_token',     // Session key for token storage (default: '_csrf_token')
   headerName: 'X-CSRF-Token',    // Request header carrying the token (default: 'X-CSRF-Token')
   formField: '_token',           // Form field carrying the token (default: '_token')
   checkOrigin: false,            // Validate Origin/Referer hostname against Host (default: false)
   allowedOrigins: [],            // Trusted cross-origin hostnames when checkOrigin=true (default: [])
   tokenBytes: 32                 // Random bytes; token is hex-encoded (default: 32 → 64-char token)
);
```

O token é lido do header `X-CSRF-Token` **ou** do campo de formulário `_token`. Métodos safe (`GET`, `HEAD`, `OPTIONS`) emitem o token mas pulam a validação. Métodos unsafe que falham na validação são rejeitados com `403 Forbidden`:

- `Invalid CSRF token` — token ausente ou divergente.
- `Invalid CSRF origin` — apenas quando `checkOrigin: true` e o hostname de `Origin` (fallback `Referer`) não corresponde a `Host` nem a nenhuma entrada de `allowedOrigins`.

O token só é rotacionado quando você chama `$Request->Session->regenerate()` (ex.: após login ou escalada de privilégio). A comparação usa `hash_equals()` para evitar ataques de timing.

**Renderize o token mascarado (proteção BREACH).** O token de sessão é um segredo estável; renderizá-lo raw em um corpo que também é comprimido (veja [Compression](#compression)) e reflete entrada do atacante o expõe a um oráculo de comprimento de compressão (BREACH). Renderize `CSRF::mask()` em vez do token raw — ele retorna um valor por resposta (`hex(nonce ‖ (token XOR nonce))`, diferente a cada chamada), de modo que não há segredo estável no corpo. A validação desmascara o token enviado automaticamente (e ainda aceita o token raw, então formulários existentes continuam funcionando).

```php
// In your view/template — emit a masked token, never the raw session value:
<input type="hidden" name="_token"
       value="<?= CSRF::mask($Request->Session->get('_csrf_token')) ?>">
```

```php
// Equivalent for an API/JS client (e.g. a meta tag the front end reads):
$masked = CSRF::mask($Request->Session->get('_csrf_token'));
```

> Um app que renderiza *o seu próprio* segredo (uma API key, um valor de sessão) junto a entrada refletida da requisição em uma resposta comprimida ainda deve evitar comprimir essa resposta — o mascaramento cobre apenas o token CSRF do framework.

**Fase:** Pré-processamento — gera e valida o token antes do handler executar.

---

### Validator

Validação de requisição fail-closed. Executa um conjunto de regras contra uma fonte do Request (`Fields`, `Queries`, `Headers`, `Cookies` ou `Files`) e curto-circuita com uma resposta de erro se alguma regra falhar — o handler da rota nunca executa.

```php
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator\Sources;

new Validator(
   rules: [
      'email' => [new Required, new Email],
   ],
   Source: Sources::Fields,   // Fields | Queries | Headers | Cookies | Files
   code: 422,                  // HTTP status on validation failure (default: 422)
   fallback: null              // Optional Closure(Request, Response, Validation): object
);
```

Uma requisição que falha recebe o status `code` — `422 Unprocessable Entity` por padrão — com `Content-Type: application/json` e os erros em JSON compacto: uma lista de mensagens por campo que falhou, na ordem das regras. Para `email=invalid`, o corpo é:

```json
{"errors":{"email":["email must be a valid email address."]}}
```

As barras ficam sem escape, e caracteres fora do ASCII são escritos como escapes `\u` (`é` como `\u00e9`). Se os erros não puderem ser codificados — uma mensagem que não é UTF-8 válido —, o corpo é `{"errors":[]}`. O construtor não confere `code`: um para o qual o servidor não tem status, como `499`, faz toda requisição que falha lançar `InvalidArgumentException` com `Invalid HTTP response status code: 499.`

Forneça uma closure em `fallback` para renderizar uma resposta de erro customizada mantendo a rota fail-closed: o middleware devolve o que a closure devolver. O `code` não é aplicado nesse caso — defina o status na closure, ou a resposta fica com `200`.

Com `Sources::Headers`, as chaves das regras casam com os nomes dos headers de forma case-insensitive (RFC 9110) — uma regra com a chave `'X-API-Key'` liga ao header enviado pelo cliente independentemente da capitalização, e os erros de validação mantêm a chave exatamente como você a escreveu. Com `Sources::Cookies`, as regras ligam pelo nome do cookie, e um nome enviado em várias linhas `Cookie` fica com o valor da primeira linha. Todas as outras fontes casam as chaves de forma case-sensitive.

Consulte a seção [Validação de Requisição](/manual/WPI/HTTP/HTTP_Server_CLI/Request/#validação-de-requisição) para exemplos end-to-end. As regras são objetos do ADI: toda regra built-in está em [Validadores](/manual/ADI/Validators/overview/), como um conjunto de regras é executado — valores em branco, regras implícitas, mensagens — em [Validação](/manual/ADI/Validation/overview/), e como escrever uma regra sua em [Escreva uma regra customizada](/manual/ADI/Validation/overview/#escreva-uma-regra-customizada).

**Fase:** Pré-processamento — valida a entrada antes do handler executar.

---

### RequestId

Gera ou propaga identificadores únicos de requisição para rastreamento distribuído e logging.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RequestId;

new RequestId(
   header: 'X-Request-Id'  // Header name to read/write (default: 'X-Request-Id')
);
```

Se a requisição já contém o header especificado, o valor existente é preservado. Caso contrário, um novo ID único é gerado.

**Fase:** Pré-processamento — define o ID da requisição antes do handler executar.

---

### SecureHeaders

Adiciona headers de segurança para proteção contra vulnerabilidades web comuns (XSS, clickjacking, MIME sniffing, etc.).

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\SecureHeaders;

new SecureHeaders(
   contentSecurityPolicy: "default-src 'self'",  // CSP directive (default: "default-src 'self'")
   hsts: true,                                    // Enable HSTS (default: true)
   hstsMaxAge: 31536000                           // HSTS max-age in seconds (default: 31536000)
);
```

**Fase:** Pós-processamento — adiciona headers de segurança à resposta.

---

### TrustedProxy

Resolve o IP real do cliente (`$Request->address`) e o esquema (`$Request->scheme`) a partir dos headers de encaminhamento quando o servidor roda atrás de um reverse proxy, load balancer ou CDN — mas só quando a conexão vem de um proxy em que você confia.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\TrustedProxy;

new TrustedProxy(
   // Trusted proxy IPs and CIDR ranges — set these explicitly in production
   proxies: ['10.0.0.1', '173.245.48.0/20', '2400:cb00::/32']
);
```

Quando o par do socket está em `proxies`, o middleware:

- Lê o endereço do cliente conforme a sua `strategy` (por padrão: `X-Forwarded-For` da direita para a esquerda, primeiro hop não confiável, ou `X-Real-IP` quando não há `X-Forwarded-For`) para atualizar `$Request->address`
- Lê `X-Forwarded-Proto` para atualizar `$Request->scheme`

IPs de proxy não confiáveis são ignorados — o endereço e o esquema permanecem inalterados. Um valor ausente ou malformado também nunca substitui o endereço: a requisição mantém o par do socket.

#### Escolha a estratégia que a sua borda sustenta

Nenhum header prova quem o escreveu. Cada estratégia só é segura para um formato de deploy — escolha a que corresponde ao que a sua borda faz com o header que ela lê.

**Atrás de proxies que acrescentam ao `X-Forwarded-For` (AWS ALB, HAProxy `option forwardfor`, nginx com `$proxy_add_x_forwarded_for`, uma CDN cujas faixas você lista)** — mantenha o default. Todo hop que acrescenta precisa estar em `proxies`; a caminhada pula esses hops pela direita e para no primeiro endereço que nenhum deles avaliza.

```php
new TrustedProxy(proxies: ['10.0.0.0/8']);
```

**Atrás de um nginx que define só o `X-Real-IP`** (`proxy_set_header X-Real-IP $remote_addr;` e nenhuma linha de `X-Forwarded-For`) — leia esse único header. Na estratégia padrão, um `X-Forwarded-For` escrito pelo cliente, repassado por esse nginx, venceria.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\TrustedProxy\Strategies;

new TrustedProxy(
   proxies: ['10.0.0.5'],
   strategy: Strategies::Header,
   header: 'X-Real-IP'
);
```

O mesmo formato serve para qualquer borda que define um header próprio em toda requisição — `Fly-Client-IP`, ou `CF-Connecting-IP` quando a origem só é alcançada pela Cloudflare.

**Atrás de uma borda que sobrescreve o `X-Forwarded-For` e cujos hops não são publicados** — a caminhada pela direita pararia num hop da borda e daria um mesmo endereço a todo visitante que passa por ele. Leia a entrada mais à esquerda:

```php
new TrustedProxy(proxies: ['10.0.0.0/8'], strategy: Strategies::Leftmost);
```

**Com uma CDN na frente da borda** — quando o endereço escolhido pela estratégia é ele mesmo um proxy confiável (um nó da CDN), o header de visitante da CDN nomeia o cliente. Adicione as faixas da CDN em `proxies` e nomeie esse header como `relay`:

```php
new TrustedProxy(
   proxies: ['10.0.0.2', '10.0.0.3', '173.245.48.0/20', '2400:cb00::/32'],
   strategy: Strategies::Leftmost,
   relay: 'CF-Connecting-IP'
);
```

O relay só é lido quando dados encaminhados escolheram um endereço confiável. Uma requisição sem nenhum header de encaminhamento mantém o par do socket, então um cliente que chega direto na sua borda não escolhe o próprio endereço escrevendo `CF-Connecting-IP` — desde que a borda escreva o campo que a estratégia lê; o relay herda a premissa da estratégia. Um valor de relay ausente ou malformado deixa o endereço no par do socket, nunca no nó da CDN, e o mesmo vale para um visitante dentro da lista de confiança: um proxy na frente nomeia o cliente, nunca outro proxy.

Toda entrada de `proxies` é confiável para nomear o visitante pelo `relay`, então mantenha a lista restrita aos seus proxies reais — os endereços exatos da borda, não uma faixa privada inteira. Qualquer host dentro de uma faixa listada que alcance a borda consegue definir o header do relay.

> **Segurança — `Leftmost` e `Header` confiam que a sua borda sobrescreve o header.** As duas leem um valor que a borda precisa escrever ela mesma em **toda** requisição, descartando o que o cliente mandou. Atrás de uma borda que acrescenta ao header ou o repassa intacto, **qualquer cliente escolhe o próprio endereço** — e com ele o seu balde de rate limit (`RateLimit(trustForwarded: true)`), qualquer allowlist de IP que leia `$Request->address` e o que o `AccessLog` registra. Na dúvida, mantenha a estratégia padrão. O Bootgly não consegue detectar isso em runtime: é um fato sobre a sua borda, não sobre a requisição.

> **Segurança — uma faixa de CDN prova a rede, não o cliente da CDN.** Uma CDN compartilhada atende muitos clientes a partir dos mesmos endereços, e alguns deles podem rodar código ali (Workers, edge functions) que manda o `CF-Connecting-IP` que quiser. Confiar nas faixas da CDN é confiar em todo cliente dela. Se isso importa para a sua aplicação, restrinja a origem à sua própria zona no nível de rede (authenticated origin pulls, um túnel privado) — isso fica fora deste middleware.

Toda estratégia falha fechada: `Leftmost` nunca pula uma primeira entrada inválida para chegar a uma posterior, e a caminhada pela direita para num hop não confiável inválido em vez de passar por ele — as entradas à esquerda desse hop são escritas por quem o escreveu, então seguir em frente deixaria o cliente escolher.

**Faixas CIDR.** Atrás de uma CDN cada requisição chega de um endereço de borda diferente, então nenhuma lista literal expressa o conjunto de confiança — liste as faixas publicadas do provedor. Um IP literal vale como `/32` | `/128`, então listas existentes de IPs válidos seguem funcionando; variantes textuais de IPv6 (`0:0:0:0:0:0:0:1` vs `::1`) agora casam por valor; a forma IPv4-mapeada (`::ffff:a.b.c.d`) casa seu equivalente IPv4 nos dois lados; e espaços em volta são tolerados. Uma entrada CIDR com bits de host preenchidos (`10.0.0.8/8`) confia em toda a sua rede, pela convenção usual. A lista é compilada uma vez na construção, então o match por requisição é comparação de bytes — e uma entrada que não seja um IP ou CIDR válido agora lança `InvalidArgumentException` no boot em vez de silenciosamente nunca casar, que é a única quebra de compatibilidade aqui. A caminhada do `X-Forwarded-For` pula hops confiáveis pelo mesmo match de faixa, então um endereço de borda dentro da cadeia nunca é confundido com o cliente. Faixas de provedor mudam com o tempo — carregue-as de um arquivo que você possa atualizar (`proxies: require 'faixas.php'`) em vez de embutir.

**Cache de rota.** Um `header` ou `relay` que você configura é tratado como `X-Forwarded-For`, `X-Forwarded-Proto` e `X-Real-IP` pelo [cache de respostas de rota](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/): uma requisição que o carrega é buscada em um espaço de chaves próprio e nunca armazena uma entrada, então a representação de um visitante nunca é servida a outro.

**`$Request->address` vs `$Request->peer`.** Este middleware só altera `$Request->address` (o IP do cliente voltado à aplicação). O par de socket real está sempre disponível, inalterado, como **`$Request->peer`** — use-o para decisões anti-abuso que não podem ser forjáveis (o rate limiting usa-o como chave por padrão; veja [RateLimit](#ratelimit)).

> **Segurança — defina `proxies` explicitamente em produção.** Quando você constrói o `TrustedProxy` sem o argumento `proxies`, ele recai no padrão localhost (`127.0.0.1`, `::1`) e registra um `WARNING` único na primeira vez que confia em um header encaminhado. Com esse padrão, qualquer coisa que alcance o servidor a partir do localhost — um sidecar, um pivô de SSRF, um port-forward de desenvolvimento — é confiada e pode forjar `$Request->address` via `X-Forwarded-For`. Sempre passe os IPs reais do seu proxy reverso / balanceador de carga.

**Fase:** Pré-processamento — resolve o IP real do cliente antes do handler executar. Só processa headers encaminhados quando a requisição se origina de um IP de proxy confiável.

## Reference

### Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Recovering

```php
public function recover (Request $Request, Response $Response, Throwable $Throwable): null|Response
```

Responde a um `Throwable` lançado pelo trabalho deferred, ou declina com `null`. `$Request` é o snapshot capturado da geração, `$Response` o clone deferred como o trabalho o deixou, `$Throwable` a falha — um `Response\Timeout` quando o orçamento do deferral estourou. As fronteiras são percorridas do mais interno para o mais externo ao longo da cadeia da rota, depois ao longo do pipeline global da última entrada para a primeira; a primeira `Response` vence (uma substituta desacoplada — uma `Response` deferred sem requisição — conta como declínio), um `recover()` que lança substitui o `Throwable` para as fronteiras mais externas, e a resposta de erro do próprio servidor é enviada quando toda fronteira declina. O reporte segue a resposta: a entrada `Throwables::notify()` do core roda só quando a própria resposta de erro dele responde, então uma fronteira que responde é dona do reporte. `Recovering` estende o contrato `Middleware`, então `process()` mantém seu papel síncrono na mesma classe.

### Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Sealing

```php
public function seal (Request $Request, Response $Response): void
```

Decora, no lugar, a `Response` que uma geração deferred está prestes a serializar — a passagem existe porque a metade pós-`$next()` do onion nunca rodou contra o clone deferred. `$Request` é o snapshot capturado do Request da geração; `$Response` é a Response realmente escolhida para o fio (a do trabalho, a de uma fronteira de erro ou a do Catcher), com status, headers e corpo finais. Ela roda na liquidação, antes do ponto de save da Session deferred, percorrendo o snapshot de middlewares da rota do mais interno para o mais externo e depois a pilha global `SAPI::$Middlewares`. `seal()` não retorna nada: mute o objeto. No caminho de sucesso um throw pula os seals restantes e alcança as fronteiras `Recovering`, e a resposta que elas escolhem é selada de novo — então `seal()` precisa ser idempotente; no caminho de erro um throw é contido e reportado. `Sealing` deliberadamente **não** estende `Middleware`: um middleware de sealing declara `implements Middleware, Sealing`, e manter `process()` e `seal()` em paridade é trabalho do autor.

### Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CORS

```php
public function __construct (array $origins = [], array $methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], array $headers = ['Content-Type', 'Authorization'], int $maxAge = 86400, bool $credentials = false, array $expose = [])
```

Cria o middleware CORS. `$origins` é a allowlist (vazia rejeita toda requisição cross-origin; `['*']` é a política wildcard, que força `$credentials` para `false`). `$methods`, `$headers` e `$maxAge` preenchem os headers `Access-Control-Allow-*` e `Access-Control-Max-Age`. `$expose` preenche `Access-Control-Expose-Headers`. Lança `InvalidArgumentException` quando um nome exposto não é token da RFC 9110.

```php
public private(set) array $expose
```

Os nomes de headers de resposta expostos, na ordem configurada, unidos com `, ` em `Access-Control-Expose-Headers` em respostas reais para origens permitidas.

### Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\TrustedProxy

```php
public function __construct (null|array $proxies = null, Strategies $strategy = Strategies::Rightmost, null|string $header = null, null|string $relay = null)
```

Cria o middleware. `$proxies` lista os IPs literais e faixas CIDR confiáveis; `null` recai em `127.0.0.1` e `::1` com um aviso único. `$strategy` escolhe de onde o endereço do cliente é lido. `$header` nomeia o campo que `Strategies::Header` lê. `$relay` nomeia o header de visitante de um proxy confiável na frente — toda entrada de `$proxies` pode escrevê-lo, e um visitante dentro da lista de confiança é recusado. Lança `InvalidArgumentException` quando uma entrada de `proxies` não é um IP ou faixa CIDR válida, quando `Strategies::Header` não recebe `$header` ou outra estratégia recebe um, ou quando `$header`/`$relay` não é um token de nome de campo da RFC 9110. Um `$header` ou `$relay` entra nos campos de encaminhamento que o cache de rota usa na chave e com os quais nunca armazena.

```php
public function process (object $Request, object $Response, Closure $next): object
```

Quando `$Request->peer` é confiável, define `$Request->address` a partir do valor da estratégia — ou do relay, quando esse valor é ele mesmo um proxy confiável — e `$Request->scheme` a partir do `X-Forwarded-Proto` (só `http` ou `https`). Um valor ausente ou malformado não muda nada, e um campo de `header`/`relay` repetido (unido por vírgula na chegada) é recusado; linhas repetidas de `X-Forwarded-For` são unidas e lidas como uma só cadeia. Depois chama `$next($Request, $Response)` e retorna o resultado. Um par não confiável vai direto para `$next`.

```php
public private(set) array $proxies
```

A lista de confiança, como configurada (ou o padrão localhost).

```php
public private(set) Strategies $strategy
```

De onde o endereço do cliente é lido: `Strategies::Rightmost`, a menos que o construtor receba outra.

```php
public private(set) null|string $header
```

O header que `Strategies::Header` lê, como configurado; `null` em qualquer outra estratégia.

```php
public private(set) null|string $relay
```

O header de visitante de um proxy confiável na frente, como configurado; `null` quando não há relay.

### Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\TrustedProxy\Strategies

```php
enum Strategies: string
{
   case Rightmost = 'rightmost';
   case Leftmost = 'leftmost';
   case Header = 'header';
}
```

De onde o `TrustedProxy` lê o endereço do cliente depois que o par do socket é confiável. `Rightmost` percorre o `X-Forwarded-For` pela direita, pulando hops confiáveis, e para no primeiro não confiável — o cliente quando é um IP válido, nada caso contrário; sem `X-Forwarded-For`, lê o `X-Real-IP`. `Leftmost` lê só a primeira entrada do `X-Forwarded-For` e não tem fallback. `Header` lê o único campo nomeado por `TrustedProxy::$header`; um campo repetido chega unido por vírgula e é recusado.

### Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator

```php
public function __construct (array $rules, Sources $Source, int $code = 422, null|Closure $fallback = null)
```

Guarda os quatro argumentos e não confere nenhum deles. `$rules` mapeia cada campo para uma `Condition` ou uma lista delas (`array<string,Condition|array<int,Condition>>`). Uma regra de outro formato é aceita aqui e recusada pela `Validation` que `process()` monta a cada requisição, então toda requisição que chega a ele lança `InvalidArgumentException` — as mensagens estão em [Validação → Erros](/manual/ADI/Validation/overview/#erros).

```php
public function process (object $Request, object $Response, Closure $next): object
```

Executa uma `Bootgly\ADI\Validation` de `$rules` sobre os dados da requisição que `$Source` nomeia. Uma requisição válida segue por `$next($Request, $Response)`. Uma inválida recebe o que `fallback` devolver, quando há um, ou então `$Response` com `code`, `Content-Type: application/json` e os erros em JSON (veja [Validator](#validator)).

```php
public private(set) array $rules
```

As regras, como foram dadas ao construtor.

```php
public private(set) Sources $Source
```

Os dados da requisição que as regras leem.

```php
public private(set) int $code
```

O status da resposta de falha: `422`, a menos que o construtor tenha recebido outro.

```php
public private(set) null|Closure $fallback
```

A `Closure(Request, Response, Validation): object` que responde a uma requisição inválida no lugar dos erros em JSON, ou `null`.

### Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator\Sources

```php
enum Sources
{
   case Queries;
   case Headers;
   case Cookies;
   case Fields;
   case Files;
}
```

Os dados da requisição que um `Validator` lê: `Queries` lê `$Request->queries`; `Headers` lê `$Request->headers`, casando as chaves das regras sem diferenciar maiúsculas de minúsculas; `Cookies` lê os cookies de todas as linhas `Cookie` juntados pelo nome, com a primeira linha vencendo; `Fields` lê `$Request->fields`; e `Files` lê `$Request->files`. Toda fonte, menos `Headers`, casa as chaves das regras diferenciando maiúsculas de minúsculas.
