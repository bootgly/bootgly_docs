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
$Router->intercept(new CORS, new RateLimit(limit: 100, window: 60));

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
}, POST, middlewares: [new RateLimit(limit: 5, window: 60)]);
```

Quando middlewares de grupo e de rota estão presentes, eles são **mesclados** — middlewares de grupo executam primeiro, depois os de rota, formando um único pipeline onion ao redor do handler.

## Métodos de Registro

| Método | Descrição |
|---|---|
| `prepend(Middleware $Middleware)` | Adiciona um middleware no **início** do pipeline |
| `append(Middleware $Middleware)` | Adiciona um middleware no **final** do pipeline |
| `pipe(Middleware ...$middlewares)` | Adiciona um ou mais middlewares no final de uma vez |

## Middlewares Built-in

Todos os middlewares built-in estão no namespace `Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares`.

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
   origins: ['https://example.com'],      // Origens permitidas (padrão: ['*'])
   methods: ['GET', 'POST'],              // Métodos permitidos (padrão: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'])
   headers: ['Content-Type'],             // Headers permitidos (padrão: ['Content-Type','Authorization'])
   maxAge: 86400,                         // Cache do preflight em segundos (padrão: 86400)
   credentials: false                     // Permitir credenciais (padrão: false)
);
```

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

---

### RateLimit

Aplica limitação de taxa rastreando contagem de requisições por IP dentro de janelas de tempo. Retorna `429 Too Many Requests` quando excedido.

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
   key: null                         // Resolvedor de chave fn (Request): ?string (padrão: IP)
);
```

**Chave do contador (segurança).** Por padrão o limitador usa como chave `$Request->peer` — o **IP de transporte TCP imutável**, que um cliente não pode forjar. Isso é intencional: o `TrustedProxy` pode sobrescrever `$Request->address` a partir de um header `X-Forwarded-For` enviado pelo cliente, então usar `$address` como chave permitiria que um cliente atrás de (ou colocalizado com) um proxy confiável rotacionasse esse header e abrisse um novo balde de rate limit por requisição, burlando o limite por completo.

Defina `trustForwarded: true` **apenas** quando o servidor está atrás de um proxy genuinamente confiável e você quer baldes por cliente real — isso faz o limitador usar `$Request->address` (o IP do cliente resolvido pelo proxy) como chave. Combine com um `TrustedProxy` corretamente configurado para que esse address seja, ele próprio, confiável.

**Agregação IPv6.** Um único cliente costuma receber um `/64` inteiro, com 2⁶⁴ endereços `/128` distintos. Usar o endereço completo como chave permitiria a esse cliente criar um balde novo por requisição, então as chaves IPv6 são mascaradas para `ipv6Prefix` (padrão `/64`) — todo endereço no mesmo `/64` compartilha um contador. Chaves IPv4 são usadas por completo. Reduza o prefixo (ex.: `/56`, `/48`) para agregar de forma ainda mais agressiva.

**Algoritmo.** `Algorithms::Sliding` (padrão) é uma janela deslizante ponderada: combina a janela atual e a anterior pela fração da janela anterior ainda em vista, de modo que um cliente não consegue enviar `2 × limit` estourando na virada de janela. `Algorithms::Fixed` é o contador clássico mais barato (uma chave, reinicia no TTL) caso você não precise do suavizamento de borda.

**Teto global.** `globalLimit` (padrão `0` = desligado) adiciona um único contador agregado entre workers sobre o limite por chave — uma rede de segurança contra um cliente distribuído/botnet que fica abaixo do limite por chave em muitas chaves. As requisições só são contadas globalmente depois de passarem na checagem por chave.

**Chave customizada.** `key` é um resolvedor `fn (object $Request): ?string`. Retorne uma string para limitar por algo diferente do IP — uma API key, um id de usuário autenticado, um tenant — ou `null` para recair na chave de IP padrão.

```php
// Limitar por API key em vez de IP:
new RateLimit(
   limit: 1000,
   window: 3600,
   key: fn (object $Request): ?string =>
      ($k = $Request->Header->get('X-Api-Key')) !== null ? "api:{$k}" : null
);
```

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

**Fase:** Pré-processamento — gera e valida o token antes do handler executar.

---

### Validator

Validação de requisição fail-closed. Executa um conjunto de regras contra uma fonte do Request (`Fields`, `Queries`, `Headers`, `Cookies` ou `Files`) e curto-circuita com uma resposta JSON de erro se alguma regra falhar — o handler da rota nunca executa.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Sources;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Email;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;

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

Consulte a seção [Request Validation](/manual/WPI/HTTP/HTTP_Server_CLI/Request/#request-validation) para o catálogo completo de validadores, regras customizadas e exemplos end-to-end.

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

Resolve o IP real do cliente a partir dos headers de proxy confiáveis (`X-Forwarded-For`, `X-Real-IP`) quando o servidor roda atrás de um reverse proxy ou load balancer.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\TrustedProxy;

new TrustedProxy(
   proxies: ['10.0.0.1']  // IPs de proxies confiáveis — defina-os explicitamente em produção
);
```

Quando a requisição vem de um IP de proxy confiável, o middleware:

- Lê `X-Forwarded-For` (da direita para a esquerda, primeiro hop não confiável) ou `X-Real-IP` para atualizar `$Request->address`
- Lê `X-Forwarded-Proto` para atualizar `$Request->scheme`

IPs de proxy não confiáveis são ignorados — o endereço e esquema permanecem inalterados.

**`$Request->address` vs `$Request->peer`.** Este middleware só altera `$Request->address` (o IP do cliente voltado à aplicação). O par de socket real está sempre disponível, inalterado, como **`$Request->peer`** — use-o para decisões anti-abuso que não podem ser forjáveis (o rate limiting usa-o como chave por padrão; veja [RateLimit](#ratelimit)).

> **Segurança — defina `proxies` explicitamente em produção.** Quando você constrói o `TrustedProxy` sem o argumento `proxies`, ele recai no padrão localhost (`127.0.0.1`, `::1`) e registra um `WARNING` único na primeira vez que confia em um header encaminhado. Com esse padrão, qualquer coisa que alcance o servidor a partir do localhost — um sidecar, um pivô de SSRF, um port-forward de desenvolvimento — é confiada e pode forjar `$Request->address` via `X-Forwarded-For`. Sempre passe os IPs reais do seu proxy reverso / balanceador de carga.

**Fase:** Pré-processamento — resolve o IP real do cliente antes do handler executar. Só processa headers encaminhados quando a requisição se origina de um IP de proxy confiável.
