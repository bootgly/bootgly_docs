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
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\CORS;
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\Compression;

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
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\RateLimit;

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

Todos os middlewares built-in estão no namespace `Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares`.

---

### CORS

Gerencia a validação de Cross-Origin Resource Sharing e requisições preflight (`OPTIONS`).

```php
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\CORS;

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
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\Compression;

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
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\ETag;

new ETag(
   weak: true  // Usar ETags fracos (padrão: true)
);
```

**Fase:** Pós-processamento — calcula o ETag a partir do corpo da resposta após o handler executar.

---

### RateLimit

Aplica limitação de taxa rastreando contagem de requisições por IP dentro de janelas de tempo. Retorna `429 Too Many Requests` quando excedido.

```php
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\RateLimit;

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
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\BodyParser;

new BodyParser(
   maxSize: 1_048_576  // Tamanho máximo do corpo em bytes (padrão: 1 MB)
);
```

**Fase:** Pré-processamento — valida o tamanho do corpo antes do handler processá-lo.

---

### RequestId

Gera ou propaga identificadores únicos de requisição para rastreamento distribuído e logging.

```php
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\RequestId;

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
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\SecureHeaders;

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
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\TrustedProxy;

new TrustedProxy(
   proxies: ['127.0.0.1', '::1']  // IPs de proxies confiáveis (padrão: ['127.0.0.1', '::1'])
);
```

Só processa headers de encaminhamento quando a requisição origina de um IP de proxy confiável.

**Fase:** Pré-processamento — resolve o IP real do cliente antes do handler executar.
