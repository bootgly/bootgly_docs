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

SAPI::$Middlewares->prepend(new CORS);       // Adicionar no início
SAPI::$Middlewares->append(new Compression); // Adicionar no final
SAPI::$Middlewares->pipe(new CORS, new Compression); // Adicionar múltiplos de uma vez
```

### Grupo de Rotas

Aplicado a todas as rotas definidas após `intercept()`, no escopo do contexto atual do Router:

```php
$Router->intercept(
   new CORS,
   new RateLimit(limit: 100, window: 60, scope: 'public-api')
);

yield $Router->route('/api/:*', function ($Request, $Response) use ($Router) {
   // Todas as rotas dentro deste grupo herdam CORS + RateLimit
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

Um middleware que envolve `$next()` em `try`/`catch` é uma fronteira de erro só para handlers **síncronos**. Uma resposta deferred (`$Response->defer()`) executa seu trabalho depois que o pipeline já retornou — o handler retorna na hora e o trabalho roda depois, numa Fiber do pool — então um `Throwable` lançado dentro desse trabalho nunca chega ao `catch` em volta de `$next()`: o próprio servidor responde (`500 Internal Server Error`; `503 Service Unavailable` para um `Response\Timeout`).

Para responder também a essas falhas, implemente `Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Recovering` — um `Middleware` com um método a mais, `recover()`, que o servidor chama quando o trabalho deferred lança:

```php
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

Registre-o exatamente como qualquer outro middleware — global, de grupo ou de rota. Quando o trabalho deferred lança, os middlewares da rota são consultados em ordem, **do mais interno para o mais externo** (os de nível de rota antes das entradas do `intercept()` do grupo), e depois o pipeline global `SAPI::$Middlewares`, da última entrada para a primeira. A primeira `Response` devolvida é enviada como está; devolva `null` para declinar. Um `recover()` que lança entrega o **novo** `Throwable` às fronteiras mais externas, exatamente como um relançamento dentro de `process()` alcança o middleware que o envolve. Quando ninguém responde, a resposta de erro do próprio servidor é enviada. Um `Response\Timeout` também é oferecido: ele é um orçamento do servidor, não um erro da aplicação — é registrado como warning antes de qualquer fronteira ser consultada, seja qual for a resposta vencedora — decline para manter o `503`, ou responda com uma indisponibilidade explícita sua.

O reporte segue a resposta. A entrada única `Throwables::notify()` do framework roda quando a resposta de erro built-in responde a um erro da aplicação — então uma fronteira que responde a um `Throwable` genérico também é dona do reporte, e precisa chamar `Throwables::notify()` ela mesma se quiser que o canal `exceptions`, o contador `exceptions_total` e os seus reporters vejam a falha. É a mesma regra que um `catch` síncrono em volta de `$next()` sempre seguiu (um `Response\Timeout` nunca é reportado, em nenhum dos casos: é um orçamento do servidor, registrado como warning). O `Web\API\Problems` built-in já faz isso em Production/Staging.

`recover()` roda dentro da Fiber deferred com o snapshot do request ligado: `$Request` é o request que o trabalho estava respondendo (o mesmo objeto que `$Response->Request`), a Route casada e seus `Params` continuam no lugar, e uma Session escrita antes do throw é persistida seja qual for a resposta vencedora. `$Response` é o clone deferred como o trabalho o deixou — assim como o `$Response` de uma fronteira síncrona carrega o que o handler escreveu — então responder nele mantém o que já está lá: headers que o trabalho definiu, um cookie de sessão definido no primeiro toque, um arquivo enfileirado. Uma fronteira que quer uma representação própria — um corpo de erro que não venha concatenado a um arquivo enfileirado — retorna um `Response` novo em vez de responder no lugar. Responda de forma síncrona: `wait()` não é recusado, mas a caminhada não é ilimitada — quando a geração tem orçamento (`defer(timeout:)` ou `deferredTimeout`), uma fronteira estacionada é interrompida com um `Response\Timeout` novo no seu ponto de espera depois de um orçamento re-armado para a caminhada; esse Timeout substitui o Throwable que foi oferecido, segue para fora como qualquer `recover()` que lança, e termina no `503` built-in quando mais ninguém responde. Sem orçamento, só o teardown do transporte a limita. A fronteira é consultada só por `recover()`, nunca executando o pipeline de novo: `process()` não é reexecutado, então middlewares de admissão na mesma cadeia não rodam duas vezes.

As fronteiras são a cadeia com que a rota foi despachada, capturada enquanto o pipeline roda. Um deferral iniciado depois de o pipeline retornar — de um listener `Request\Events::Handled`, ou de um middleware global depois do seu `$next()` — não carrega a cadeia da rota: só o pipeline global `SAPI::$Middlewares` recebe suas falhas. Trabalho que já fez o handoff da geração não é oferecido a nenhuma fronteira: um `$Response->SSE->open()` bem-sucedido e um `defer()` aninhado liquidam a geração, então um `Throwable` lançado depois desse handoff não chega a nenhum `recover()`, a nenhuma resposta de erro built-in nem ao `Throwables::notify()` — o cliente SSE fica com o stream que recebeu, sem evento de erro e sem chunk terminador, e a resposta do próprio filho aninhado é o que o cliente vê. Reporte dentro do trabalho, antes do handoff, quando essa falha precisar ser visível. (Um handoff feito de dentro de `recover()` é outro caso: a fronteira o escolheu.) Um `defer()` aninhado feito de dentro de `recover()` herda a cadeia, então um filho que lança é oferecido às mesmas fronteiras de novo — uma fronteira que reporta por um filho não pode deixar esse filho lançar.

Headers definidos por um middleware **depois** de `$next()` não se aplicam a uma resposta deferred: nesse ponto o pipeline já retornou, e a resposta é montada depois, dentro do trabalho. Defina-os dentro do trabalho.

## Middlewares Built-in

Todos os middlewares built-in estão no namespace `Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares`.

---

### AccessLog

Uma linha de log por requisição, num canal próprio — o access log que o próprio servidor nunca escreve.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\AccessLog;

new AccessLog(
   channel: 'HTTP.Server.CLI.access', // Canal de log → storage/logs/HTTP.Server.CLI.access.log (padrão)
   header: 'X-Request-Id',            // Header da resposta de onde o id da requisição é lido; null = sem id (padrão: 'X-Request-Id')
   query: false,                      // Manter a query string no alvo registrado (padrão: false)
   Formatter: null                    // fn (array $entry): string — sua própria linha (padrão: a linha abaixo)
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
   origins: ['https://example.com'],      // Origens permitidas (padrão: [] — allowlist vazia; passe ['*'] para wildcard)
   methods: ['GET', 'POST'],              // Métodos permitidos (padrão: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'])
   headers: ['Content-Type'],             // Headers permitidos (padrão: ['Content-Type','Authorization'])
   maxAge: 86400,                         // Cache do preflight em segundos (padrão: 86400)
   credentials: false                     // Permitir credenciais (padrão: false)
);
```

> **Seguro por padrão.** `origins` usa por padrão uma **allowlist vazia** — toda requisição
> cross-origin é rejeitada (`403`) até você listar as origens confiáveis. Passe `origins: ['*']`
> para optar por uma política wildcard (independente de origem). Quando o `Origin` da requisição
> é refletido (correspondência na allowlist), `Vary: Origin` é emitido para que um cache
> compartilhado (CDN / proxy reverso) nunca sirva a resposta de uma origem para outra. Uma
> allowlist sem `Origin` na requisição não emite `Access-Control-Allow-Origin` — nunca cai
> para `*`.

**Fase:** Pré-processamento — valida a origem e trata o preflight antes do handler executar.

---

### Compression

Comprime o corpo da resposta usando `gzip` ou `deflate` com base no header `Accept-Encoding` do cliente.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Compression;

new Compression(
   level: 6,        // Nível de compressão 1-9 (padrão: 6)
   minSize: 1024    // Tamanho mínimo do corpo em bytes para comprimir (padrão: 1024)
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
   weak: true  // Usar ETags fracos (padrão: true)
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
   limit: 60,                        // Máximo de requisições por janela (padrão: 60)
   window: 60,                       // Janela de tempo em segundos (padrão: 60)
   trustForwarded: false,            // Usar o $Request->address resolvido pelo proxy (padrão: false)
   ipv6Prefix: 64,                   // Agregar chaves IPv6 neste prefixo (padrão: /64)
   globalLimit: 0,                   // Teto agregado entre workers opcional (padrão: 0 = desligado)
   algorithm: Algorithms::Sliding,   // Algoritmo de contagem (padrão: Sliding; ou Fixed)
   key: null,                        // Resolvedor de principal fn (Request): ?string (padrão: IP)
   scope: 'public-api',              // Identidade estável da política por principal (padrão: linha derivada)
   globalScope: null                 // Identidade da política agregada (padrão: scope)
);
```

**Chave do contador (segurança).** Por padrão o limitador usa como chave `$Request->peer` — o **IP de transporte TCP imutável**, que um cliente não pode forjar. Isso é intencional: o `TrustedProxy` pode sobrescrever `$Request->address` a partir de um header `X-Forwarded-For` enviado pelo cliente, então usar `$address` como chave permitiria que um cliente atrás de (ou colocalizado com) um proxy confiável rotacionasse esse header e abrisse um novo balde de rate limit por requisição, burlando o limite por completo.

Defina `trustForwarded: true` **apenas** quando o servidor está atrás de um proxy genuinamente confiável e você quer baldes por cliente real — isso faz o limitador usar `$Request->address` (o IP do cliente resolvido pelo proxy) como chave. Combine com um `TrustedProxy` corretamente configurado para que esse address seja, ele próprio, confiável.

**Agregação IPv6.** Um único cliente costuma receber um `/64` inteiro, com 2⁶⁴ endereços `/128` distintos. Usar o endereço completo como chave permitiria a esse cliente criar um balde novo por requisição, então as chaves IPv6 são mascaradas para `ipv6Prefix` (padrão `/64`) — todo endereço no mesmo `/64` compartilha um contador. Chaves IPv4 são usadas por completo. Reduza o prefixo (ex.: `/56`, `/48`) para agregar de forma ainda mais agressiva.

**Algoritmo.** `Algorithms::Sliding` (padrão) é uma janela deslizante ponderada: combina a janela atual e a anterior pela fração da janela anterior ainda em vista, de modo que um cliente não consegue enviar `2 × limit` estourando na virada de janela. `Algorithms::Fixed` é o contador clássico mais barato (uma chave, reinicia no TTL) caso você não precise do suavizamento de borda.

**Escopo da política.** `scope` identifica a política lógica; `key` identifica o principal dentro dessa política. Quando `scope` é omitido, o Bootgly deriva uma identidade automática do arquivo e da linha normalizados que contêm a expressão `new RateLimit`. Assim, o mesmo local de construção compartilha contadores quando declarações lazy de rotas são construídas independentemente por workers diferentes, enquanto linhas distintas ficam isoladas. Use um escopo estável explícito em factories, subclasses, definições geradas, múltiplas políticas lógicas criadas na mesma linha física e rolling deployments críticos para segurança: reutilizar um local de construção compartilha uma política sem intenção, enquanto movê-lo altera a identidade automática e inicia uma cota nova. Valores explícitos de `scope` e `globalScope` devem conter entre 1 e 256 bytes e não podem ser vazios nem compostos apenas por espaços em branco. Um escopo de principal compartilhado ainda não mistura algoritmos ou janelas incompatíveis; essas semânticas permanecem particionadas.

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
// Limitar pelo proprietário validado da API key em vez de IP:
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

**Fase:** Pré-processamento — rejeita requisições que excedem o limite antes de alcançar o handler.

---

### BodyParser

Valida e aplica tamanho máximo do corpo da requisição. Retorna `413 Content Too Large` quando excedido.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\BodyParser;

new BodyParser(
   maxSize: 1_048_576  // Tamanho máximo do corpo em bytes (padrão: 1 MB)
);
```

**Fase:** Pré-processamento — valida o tamanho do corpo antes do handler processá-lo.

---

### CSRF

Proteção CSRF baseada em token sincronizador. Gera um token por sessão, armazena em `$Request->Session` e valida os tokens enviados nos métodos HTTP unsafe (`POST`, `PUT`, `PATCH`, `DELETE`) usando comparação timing-safe.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CSRF;

new CSRF(
   sessionKey: '_csrf_token',     // Chave de sessão onde o token é armazenado (padrão: '_csrf_token')
   headerName: 'X-CSRF-Token',    // Header da requisição que carrega o token (padrão: 'X-CSRF-Token')
   formField: '_token',           // Campo de formulário que carrega o token (padrão: '_token')
   checkOrigin: false,            // Validar o hostname de Origin/Referer contra Host (padrão: false)
   allowedOrigins: [],            // Hostnames cross-origin confiáveis quando checkOrigin=true (padrão: [])
   tokenBytes: 32                 // Bytes aleatórios; token é hex-encoded (padrão: 32 → token de 64 caracteres)
);
```

O token é lido do header `X-CSRF-Token` **ou** do campo de formulário `_token`. Métodos safe (`GET`, `HEAD`, `OPTIONS`) emitem o token mas pulam a validação. Métodos unsafe que falham na validação são rejeitados com `403 Forbidden`:

- `Invalid CSRF token` — token ausente ou divergente.
- `Invalid CSRF origin` — apenas quando `checkOrigin: true` e o hostname de `Origin` (fallback `Referer`) não corresponde a `Host` nem a nenhuma entrada de `allowedOrigins`.

O token só é rotacionado quando você chama `$Request->Session->regenerate()` (ex.: após login ou escalada de privilégio). A comparação usa `hash_equals()` para evitar ataques de timing.

**Renderize o token mascarado (proteção BREACH).** O token de sessão é um segredo estável; renderizá-lo raw em um corpo que também é comprimido (veja [Compression](#compression)) e reflete entrada do atacante o expõe a um oráculo de comprimento de compressão (BREACH). Renderize `CSRF::mask()` em vez do token raw — ele retorna um valor por resposta (`hex(nonce ‖ (token XOR nonce))`, diferente a cada chamada), de modo que não há segredo estável no corpo. A validação desmascara o token enviado automaticamente (e ainda aceita o token raw, então formulários existentes continuam funcionando).

```php
// No seu view/template — emita um token mascarado, nunca o valor raw da sessão:
<input type="hidden" name="_token"
       value="<?= CSRF::mask($Request->Session->get('_csrf_token')) ?>">
```

```php
// Equivalente para um cliente API/JS (ex.: uma meta tag que o front-end lê):
$masked = CSRF::mask($Request->Session->get('_csrf_token'));
```

> Um app que renderiza *o seu próprio* segredo (uma API key, um valor de sessão) junto a entrada refletida da requisição em uma resposta comprimida ainda deve evitar comprimir essa resposta — o mascaramento cobre apenas o token CSRF do framework.

**Fase:** Pré-processamento — gera e valida o token antes do handler executar.

---

### Validator

Validação de requisição fail-closed. Executa um conjunto de regras contra uma fonte do Request (`Fields`, `Queries`, `Headers`, `Cookies` ou `Files`) e curto-circuita com uma resposta JSON de erro se alguma regra falhar — o handler da rota nunca executa.

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
   code: 422,                  // Status HTTP na falha de validação (padrão: 422)
   fallback: null              // Closure opcional Closure(Request, Response, Validation): object
);
```

A resposta padrão de falha é `422 Unprocessable Entity` com corpo `{"errors": {"email": ["email must be a valid email address."]}}`. Forneça uma closure em `fallback` para renderizar uma resposta de erro customizada mantendo a rota fail-closed.

Com `Sources::Headers`, as chaves das regras casam com os nomes dos headers de forma case-insensitive (RFC 9110) — uma regra com a chave `'X-API-Key'` liga ao header enviado pelo cliente independentemente da capitalização, e os erros de validação mantêm a chave exatamente como você a escreveu. Todas as outras fontes casam as chaves de forma case-sensitive.

Consulte a seção [Request Validation](/manual/WPI/HTTP/HTTP_Server_CLI/Request/#request-validation) para exemplos end-to-end, e a página [ADI Validation](/manual/ADI/Validation/overview/) para o catálogo completo de regras e regras customizadas.

**Fase:** Pré-processamento — valida a entrada antes do handler executar.

---

### RequestId

Gera ou propaga identificadores únicos de requisição para rastreamento distribuído e logging.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RequestId;

new RequestId(
   header: 'X-Request-Id'  // Nome do header para ler/escrever (padrão: 'X-Request-Id')
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
   contentSecurityPolicy: "default-src 'self'",  // Diretiva CSP (padrão: "default-src 'self'")
   hsts: true,                                    // Habilitar HSTS (padrão: true)
   hstsMaxAge: 31536000                           // Max-age do HSTS em segundos (padrão: 31536000)
);
```

**Fase:** Pós-processamento — adiciona headers de segurança à resposta.

---

### TrustedProxy

Resolve o IP real do cliente a partir dos headers de proxy confiáveis (`X-Forwarded-For`, `X-Real-IP`) quando o servidor roda atrás de um reverse proxy, load balancer ou CDN.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\TrustedProxy;

new TrustedProxy(
   // IPs e faixas CIDR de proxies confiáveis — defina-os explicitamente em produção
   proxies: ['10.0.0.1', '173.245.48.0/20', '2400:cb00::/32']
);
```

Quando a requisição vem de um proxy confiável, o middleware:

- Lê `X-Forwarded-For` (da direita para a esquerda, primeiro hop não confiável) ou `X-Real-IP` para atualizar `$Request->address`
- Lê `X-Forwarded-Proto` para atualizar `$Request->scheme`

IPs de proxy não confiáveis são ignorados — o endereço e esquema permanecem inalterados.

**Faixas CIDR.** Atrás de uma CDN cada requisição chega de um endereço de borda diferente, então nenhuma lista literal expressa o conjunto de confiança — liste as faixas publicadas do provedor. Um IP literal vale como `/32` | `/128`, então listas existentes de IPs válidos seguem funcionando; variantes textuais de IPv6 (`0:0:0:0:0:0:0:1` vs `::1`) agora casam por valor; a forma IPv4-mapeada (`::ffff:a.b.c.d`) casa seu equivalente IPv4 nos dois lados; e espaços em volta são tolerados. Uma entrada CIDR com bits de host preenchidos (`10.0.0.8/8`) confia em toda a sua rede, pela convenção usual. A lista é compilada uma vez na construção, então o match por requisição é comparação de bytes — e uma entrada que não seja um IP ou CIDR válido agora lança `InvalidArgumentException` no boot em vez de silenciosamente nunca casar, que é a única quebra de compatibilidade aqui. A caminhada do `X-Forwarded-For` pula hops confiáveis pelo mesmo match de faixa, então um endereço de borda dentro da cadeia nunca é confundido com o cliente. Faixas de provedor mudam com o tempo — carregue-as de um arquivo que você possa atualizar (`proxies: require 'faixas.php'`) em vez de embutir.

> **CDNs que não acrescentam ao `X-Forwarded-For`.** Algumas bordas publicam o cliente apenas em um header próprio (`CF-Connecting-IP`, `True-Client-IP`). Ler esses headers ainda não é suportado — confiar num quarto campo com segurança exige também ensinar o cache de rota sobre ele, senão uma resposta que varia por endereço, cacheada para um cliente, poderia ser reservida a outro. A Cloudflare e a maioria das CDNs também acrescentam ao `X-Forwarded-For`, então listar as faixas delas acima já resolve o cliente real.

**`$Request->address` vs `$Request->peer`.** Este middleware só altera `$Request->address` (o IP do cliente voltado à aplicação). O par de socket real está sempre disponível, inalterado, como **`$Request->peer`** — use-o para decisões anti-abuso que não podem ser forjáveis (o rate limiting usa-o como chave por padrão; veja [RateLimit](#ratelimit)).

> **Segurança — defina `proxies` explicitamente em produção.** Quando você constrói o `TrustedProxy` sem o argumento `proxies`, ele recai no padrão localhost (`127.0.0.1`, `::1`) e registra um `WARNING` único na primeira vez que confia em um header encaminhado. Com esse padrão, qualquer coisa que alcance o servidor a partir do localhost — um sidecar, um pivô de SSRF, um port-forward de desenvolvimento — é confiada e pode forjar `$Request->address` via `X-Forwarded-For`. Sempre passe os IPs reais do seu proxy reverso / balanceador de carga.

**Fase:** Pré-processamento — resolve o IP real do cliente antes do handler executar. Só processa headers encaminhados quando a requisição se origina de um IP de proxy confiável.

## Reference

### Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Recovering

```php
public function recover (Request $Request, Response $Response, Throwable $Throwable): null|Response
```

Responde a um `Throwable` lançado pelo trabalho deferred, ou declina com `null`. `$Request` é o snapshot capturado da geração, `$Response` o clone deferred como o trabalho o deixou, `$Throwable` a falha — um `Response\Timeout` quando o orçamento do deferral estourou. As fronteiras são percorridas do mais interno para o mais externo ao longo da cadeia da rota, depois ao longo do pipeline global da última entrada para a primeira; a primeira `Response` vence, um `recover()` que lança substitui o `Throwable` para as fronteiras mais externas, e a resposta de erro do próprio servidor é enviada quando toda fronteira declina. O reporte segue a resposta: a entrada `Throwables::notify()` do core roda só quando a própria resposta de erro dele responde, então uma fronteira que responde é dona do reporte. `Recovering` estende o contrato `Middleware`, então `process()` mantém seu papel síncrono na mesma classe.
