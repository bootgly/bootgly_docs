# HTTP Server CLI — Middlewares

Os middlewares no HTTP Server CLI seguem um padrão de **pipeline onion**. Cada middleware envolve o próximo, permitindo que lógica seja executada antes (pré-processamento) e depois (pós-processamento) do handler da requisição.

## Escopos de Registro

Middlewares podem ser registrados em três níveis:

### Global (SAPI)

Aplicado a **toda** requisição processada pelo servidor:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\API\Servers\SAPI;
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
      $Response->Json->encode(['users' => []]);
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

new RateLimit(
   limit: 60,   // Máximo de requisições por janela (padrão: 60)
   window: 60   // Janela de tempo em segundos (padrão: 60)
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
   proxies: ['127.0.0.1', '::1']  // IPs de proxies confiáveis (padrão: ['127.0.0.1', '::1'])
);
```

Quando a requisição vem de um IP de proxy confiável, o middleware:

- Lê `X-Forwarded-For` (primeiro IP) ou `X-Real-IP` para atualizar `$Request->address`
- Lê `X-Forwarded-Proto` para atualizar `$Request->scheme`

IPs de proxy não confiáveis são ignorados — o endereço e esquema permanecem inalterados.

**Fase:** Pré-processamento — resolve o IP real do cliente antes do handler executar.
