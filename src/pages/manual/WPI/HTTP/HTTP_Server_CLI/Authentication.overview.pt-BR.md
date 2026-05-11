# HTTP Server CLI — Authentication

A autenticação HTTP do Bootgly é dividida em camadas pequenas:

- **Credenciais do Request** fazem o parse de headers Basic `Authorization` sem confiar neles.
- **Metadados de token do Request** expõem transporte Bearer como `$Request->token`.
- **Guards de autenticação** verificam credenciais e emitem challenges conscientes do protocolo.
- **O middleware `Authentication`** executa um ou mais guards em rotas protegidas.

Mecanismos suportados no HTTP Server CLI:

| Mecanismo | Caso de uso | Transporte |
| --- | --- | --- |
| Basic | Compatibilidade, desenvolvimento, endpoints simples protegidos | `Authorization: Basic ...` |
| Bearer | Tokens opacos de API e access tokens | `Authorization: Bearer <token>` |
| JWT | Tokens compactos assinados e verificados pelo Bootgly | `Authorization: Bearer <jwt>` |
| Session | Fluxos de browser baseados em `$Request->Session` | Cookie de sessão |

> Digest authentication intencionalmente não faz parte desta primeira implementação.

## Credenciais do Request

`$Request->authenticate()` faz o parse de credenciais Basic no header HTTP `Authorization` e retorna um objeto de credenciais ou `null`:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Authentications\Basic;

$Credentials = $Request->authenticate();

if ($Credentials instanceof Basic) {
   $username = $Credentials->username;
   $password = $Credentials->password;
}
```

O parser não verifica credenciais. A verificação pertence aos guards e resolvers da aplicação. Tokens Bearer e JWT ficam em `Router\Middlewares`: leia `$Request->token` ou use os guards Bearer/JWT.

O request também expõe metadados lazy de autenticação:

```php
$Request->username; // username do Basic
$Request->password; // password do Basic
$Request->token;    // token Bearer
```

## Challenges do Response

Use `$Response->authenticate()` para retornar um challenge Basic `401 Unauthorized`. Challenges Bearer são emitidos pelos guards Bearer/JWT para manter as definições dentro de `Router\Middlewares`.

### Challenge Basic

```php
use Bootgly\WPI\Modules\HTTP\Server\Response\Authentication\Basic;

return $Response->authenticate(new Basic(
   realm: 'Bootgly Protected Area'
));
```

Emite:

```http
WWW-Authenticate: Basic realm="Bootgly Protected Area"
```

### Challenge Bearer

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Bearer;

$Bearer = new Bearer(
   Resolver: fn (string $token): bool => $token === 'demo-bearer-token',
   realm: 'Bootgly API',
   error: 'invalid_token',
   description: 'The access token is missing or invalid.',
   URI: 'https://docs.bootgly.com/manual/WPI/HTTP/HTTP_Server_CLI/Authentication',
   scope: 'demo:read'
);
```

Ao falhar, o guard emite um header `WWW-Authenticate` Bearer com atributos no estilo RFC 6750.

## Middleware Authentication

O middleware recebe um objeto de estratégia `Authenticating`. A estratégia guarda os guards na ordem de avaliação.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
```

Quando qualquer guard autentica com sucesso, o handler da rota executa. Quando todos falham, o middleware usa o primeiro guard para montar o response de challenge.

`Authentication` exige pelo menos um guard. Criá-lo com uma estratégia `Authenticating` vazia lança `InvalidArgumentException`, evitando que rotas protegidas falhem fechadas silenciosamente por má configuração.

Callbacks customizados de fallback podem renderizar body ou headers extras para requests negados, mas o middleware normaliza o response retornado para `401 Unauthorized` antes e depois do callback. Isso evita respostas `200 OK` acidentais em falhas de autenticação.

```php
$Auth = new Authentication(
   Authenticating: $Bearer,
   Fallback: function (Request $Request, Response $Response): Response {
      return $Response(body: 'Custom unauthorized body');
   }
);
```

Guards de autenticação expõem metadados por propriedades declaradas em `Request`: `$Request->identity` para o principal autenticado e `$Request->claims` para claims verificados de tokens. Doubles de Request também devem declarar essas propriedades, ou usar `stdClass` em testes leves.

## Notas de hardening

- Combine rotas Basic e Bearer com `RateLimit` para reduzir tentativas de brute force.
- Callbacks de resolver devem comparar segredos com `hash_equals()` ao verificar passwords, tokens de API ou segredos compartilhados.
- Coloque proteção CSRF antes de rotas autenticadas de browser que alteram estado; rotas de token/API que não usam cookies podem ser isentas pela política da rota.
- JWT é transportado como token Bearer e compartilha o hook `$Request->token` com credenciais Bearer opacas.

## Guard Bearer token

Use o guard Bearer para tokens opacos de API. O resolver recebe o token e o `Request`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Bearer;

$Bearer = new Authenticating(
   new Bearer(function (string $token, Request $Request): bool {
      return $token === 'demo-bearer-token';
   })
);

yield $Router->route('/auth/bearer', function (Request $Request, Response $Response) {
   return $Response->JSON->send([
      'authorized' => true,
      'guard' => 'Bearer',
   ]);
}, GET, middlewares: [new Authentication($Bearer)]);
```

Teste:

```bash
curl -H 'Authorization: Bearer demo-bearer-token' http://localhost:8082/auth/bearer
```

Um resolver pode retornar:

- `false` ou `null` para negar.
- `true` para expor o token como `$Request->identity`.
- qualquer valor customizado para expor esse valor como `$Request->identity`.

## Guard JWT

O Bootgly inclui um signer/verifier JWT nativo em `Bootgly\API\Security\JWT`. JWT não é um schema HTTP separado; ele usa transporte Bearer. Crie o objeto JWT uma vez no boot da aplicação e compartilhe entre requests em vez de reconstruir o key set por request.

```php
use Bootgly\API\Security\JWT;
use Bootgly\API\Security\JWT\Policies;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\JWT as JWTGuard;

$Token = new JWT('bootgly-demo-authentication-secret');

yield $Router->route('/auth/jwt/issue', function (Request $Request, Response $Response) use ($Token) {
   $token = $Token->sign([
      'sub' => 'demo-user',
      'scope' => 'demo:read',
      'exp' => time() + 3600,
   ]);

   return $Response->JSON->send([
      'token' => $token,
      'authorization' => "Bearer {$token}",
   ]);
}, GET);

$Policies = new Policies(
   issuers: 'https://issuer.bootgly.dev',
   audiences: 'api://bootgly-demo',
   subject: true
);
$JWT = new Authenticating(new JWTGuard($Token, $Policies));

yield $Router->route('/auth/jwt', function (Request $Request, Response $Response) {
   return $Response->JSON->send([
      'authorized' => true,
      'guard' => 'JWT',
   ]);
}, GET, middlewares: [new Authentication($JWT)]);
```

A assinatura JWT lança `RuntimeException` quando claims ou headers não podem ser codificados como JSON. A verificação JWT rejeita tokens malformados, algoritmos não suportados, valores `typ` não suportados, assinaturas inválidas, `exp` expirado, `nbf` futuro e `iat` futuro. O segredo HS256 precisa ter no mínimo 32 bytes. `Policies` pode exigir `iss` exato, `aud` compatível, `sub` não vazio e `jti` não vazio. O guard ainda retorna apenas um desafio Bearer genérico `invalid_token` para o cliente.

O padrão de `JWT->leeway` é `0`, então a verificação de claims temporais é estrita. Defina um valor pequeno, como `5` segundos, quando seus servidores puderem ter pequeno desvio de relógio.

Para testes determinísticos, use `JWT->freeze($timestamp)` e depois `JWT->resume()` para voltar ao relógio real.

Quando o claim `sub` existe, o guard expõe `Bootgly\API\Security\Identity` como `$Request->identity`. Ele sempre expõe claims verificados como `$Request->claims` e headers protegidos verificados como `$Request->tokenHeaders`. Um claim JWT `scope` separado por espaços ou um claim `scp` em string/array é normalizado em `Identity->scopes`, então `$Request->identity->check('demo:read')` funciona para usuários JWT. Quando ambos existem, `scope` tem precedência sobre `scp`.

### RS256, JWKS e rotação de chaves

Use `Bootgly\API\Security\JWT\Key` para ids de chave explícitos e `Bootgly\API\Security\JWT\KeysJWKS` para documentos JWKS locais:

```php
use Bootgly\API\Security\JWT;
use Bootgly\API\Security\JWT\Key;
use Bootgly\API\Security\JWT\KeysJWKS;

$Signer = new JWT($privatePem, 'RS256');
$Signer->select(new Key($privatePem, 'RS256', 'current'));

$Verifier = new JWT($publicPem, 'RS256');
$Verifier->trust(KeysJWKS::parse($jwks, 'RS256'));
```

Sempre defina `kid` ao rotacionar chaves JWT. Um key set sem `kid` é intencionalmente single-slot para tokens compatíveis antigos; adicionar uma segunda chave default falha explicitamente em vez de fazer o verifier adivinhar.

Para issuers OAuth/OIDC externos, use `Bootgly\API\Security\JWT\Remote` com o `jwks_uri` do provedor:

```php
use Bootgly\API\Security\JWT;
use Bootgly\API\Security\JWT\Policies;
use Bootgly\API\Security\JWT\Remote;
use Bootgly\API\Security\JWT\Vault;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\JWT as JWTGuard;

$Remote = new Remote('https://issuer.example/.well-known/jwks.json');
$Remote->cache(new Vault);
$Verifier = new JWT($Remote, 'RS256');

$Policies = new Policies(
   issuers: 'https://issuer.example',
   audiences: 'api://bootgly-demo',
   subject: true
);

$JWT = new Authenticating(new JWTGuard($Verifier, $Policies));
```

`Remote` mantém um cache `KeySet` em memória por processo, pode usar `Vault` para cache JWKS file-backed compartilhado entre workers no mesmo filesystem, respeita `Cache-Control: max-age` quando presente, compartilha o cooldown de refresh-on-miss via cache, atualiza o JWKS quando um token chega com `kid` desconhecido e falha fechado quando o endpoint não pode ser buscado, retorna status não-2xx, retorna JSON inválido ou retorna um documento JWKS inválido. JWKS remoto exige HTTPS por padrão; use `insecure: true` apenas em testes ou ambientes locais controlados. OIDC Discovery, `ETag`/`Last-Modified`, backoff exponencial e backends externos de cache multi-host continuam como camadas futuras.

### Refresh tokens e uso de `jti`

Para apps fullstack first-party, mantenha access tokens curtos e rotacione refresh tokens opacos com `Bootgly\API\Security\JWT\Tokens`:

```php
use Bootgly\API\Security\JWT\Replay;
use Bootgly\API\Security\JWT\Token;
use Bootgly\API\Security\JWT\Tokens;
use Bootgly\API\Security\JWT\Usage;
use Bootgly\API\Security\JWT\Vault;

$Vault = new Vault;
$Tokens = new Tokens($Vault);

$Issued = $Tokens->mint('user-42', 60 * 60 * 24 * 30, [
   'role' => 'admin',
]);

$Rotated = $Tokens->rotate($Issued->refresh, 60 * 60 * 24 * 30);
if ($Rotated instanceof Replay) {
   // incidente: registrar subject/family e forçar logout dos siblings
}
elseif ($Rotated instanceof Token) {
   // emitir o novo refresh token para o cliente
}
```

`Tokens` guarda o estado de refresh por hash do token, consome o refresh antigo na rotação, mantém um tombstone com `subject`/claims para auditoria e retorna `Replay` quando um refresh já consumido é reutilizado. Replay revoga a família inteira e deve ser tratado como incidente.

Use `Usage` quando os valores `jti` de access tokens precisam de revogação persistente ou proteção single-use contra replay:

```php
$Usage = new Usage($Vault);
$Verifier->track($Usage);

$Usage->block('access-token-jti', 300);

$SingleUse = new Usage($Vault, single: true);
$Verifier->track($SingleUse);

$OptionalJTI = new Usage($Vault, required: false);
```

`Usage` roda apenas depois de assinatura, claims temporais e `Policies` opcionais passarem. Por padrão ele exige claim `jti`; use `required: false` apenas quando tokens sem identificador devem passar sem revogação persistente. O modo single-use exige claim `exp` para que o marcador `jti` visto expire automaticamente.

## Guard Basic

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Basic as BasicGuard;

$Basic = new Authenticating(
   new BasicGuard(function (string $username, string $password, Request $Request): bool {
      return $username === 'demo' && $password === 'secret';
   })
);

yield $Router->route('/auth/basic', function (Request $Request, Response $Response) {
   return $Response->JSON->send([
      'authorized' => true,
      'guard' => 'Basic',
   ]);
}, GET, middlewares: [new Authentication($Basic)]);
```

Teste:

```bash
curl -u demo:secret http://localhost:8082/auth/basic
```

## Guard Session

Use o guard Session quando o estado de autenticação vive em `$Request->Session`. Ele verifica uma chave de sessão e expõe o valor armazenado como `$Request->identity`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Session as SessionGuard;

$Session = new Authenticating(new SessionGuard(key: 'identity'));

yield $Router->route('/account', function ($Request, $Response) {
   return $Response->JSON->send([
      'authorized' => true,
   ]);
}, GET, middlewares: [new Authentication($Session)]);
```

Falhas de Session retornam um `401 Unauthorized` genérico sem header `WWW-Authenticate`.

## Múltiplos guards

Você pode compor guards em ordem:

```php
$API = new Authenticating(new JWTGuard($Token));
$API->add(new Bearer(function (string $token, Request $Request): bool {
   return $token === 'legacy-api-token';
}));

yield $Router->route('/api/private', $Handler, GET, middlewares: [new Authentication($API)]);
```

Neste exemplo, o Bootgly tenta JWT primeiro e depois o Bearer opaco. Se ambos falharem, o guard JWT define o challenge porque é o primeiro guard.

## Projeto demo

O repositório inclui exemplos funcionais em `projects/Demo-HTTP_Server_CLI`:

- `router/HTTP_Server_CLI-authentication.SAPI.php`
- `router/routes/Authentication.routes.php`

Habilite essa SAPI em `Demo-HTTP_Server_CLI.project.php`, inicie o servidor demo e abra `GET /auth` para ver comandos executáveis das rotas Bearer, JWT e Basic.
