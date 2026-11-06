# HTTP Server CLI — Authorization

Authorization no HTTP Server CLI protege rotas já autenticadas. Authentication prova quem
está fazendo a requisição; Authorization verifica se essa `Identity` pode continuar.

O middleware é pequeno de propósito:

- `Authorizing` guarda gates ordenados.
- `Authorization` executa esses gates ao redor do handler da rota.
- `Gate` é o contrato HTTP base para gates customizados.
- `Denial` normaliza respostas negadas para `403 Forbidden`.
- `Scope`, `Role` e `Policy` são os gates built-in de rota.

## Posição no pipeline

Coloque Authentication antes de Authorization para que os gates recebam uma `Identity`
tipada na request.

```php
use Bootgly\API\Security\JWT;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\JWT as JWTGuard;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorizing;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope;

$JWT = new JWT('application-secret');
$JWTStrategy = new Authenticating(new JWTGuard($JWT));
$Authorizing = new Authorizing(new Scope('demo:read'));

$middlewares = [
   new Authentication($JWTStrategy),
   new Authorization($Authorizing),
];
```

Se não houver identity, todos os gates built-in falham. Normalmente isso significa que
Authentication está ausente, falhou ou foi colocada depois de Authorization.

## `Authorizing`

`Authorizing` é uma coleção ordenada de gates. Todos os gates configurados precisam passar.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorizing;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Role;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope;

$Authorizing = new Authorizing(
   new Scope('demo:read'),
   new Role('editor')
);
```

Use `add()` quando a estratégia é montada aos poucos:

```php
$Authorizing->add(new Scope('demo:write'));
```

## `Authorization`

`Authorization` recebe uma estratégia `Authorizing`. Criá-lo com estratégia vazia lança
`InvalidArgumentException`, então uma rota protegida não roda sem gates por engano.

Quando qualquer gate retorna `false`, o middleware para imediatamente e o handler da rota
não é chamado. O gate que falhou constrói a resposta; por padrão ela é `403 Forbidden`.

Fallbacks customizados podem renderizar body ou headers extras, mas o middleware marca a
resposta como `403` antes e depois do fallback.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization;

$Middleware = new Authorization(
   Authorizing: $Authorizing,
   Fallback: function (Request $Request, Response $Response): Response {
      return $Response->JSON->send([
         'error' => 'forbidden',
      ]);
   }
);
```

## Scope gate

`Scope` verifica grants exatos em `Identity->scopes`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope;

new Scope('posts:view');
new Scope(['posts:view', 'posts:update']);
new Scope(['posts:view', 'posts:update'], all: false);
```

`all: true` é o padrão. Com `all: false`, qualquer scope configurado é suficiente.

### Respondendo `insufficient_scope`

Por padrão um `Scope` negado responde um `403 Forbidden` simples. Passe o guard `Bearer` (ou `JWT`) da rota como `Bearer:` e a negação também informa ao cliente quais scopes ele precisa, como descreve a RFC 6750 §3.1 — o sinal que um cliente OAuth ou MCP lê para pedir um token com mais scope:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Bearer;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope;

$Bearer = new Bearer($Resolver, realm: 'Bootgly API');

new Scope(['posts:view', 'posts:update'], Bearer: $Bearer);
```

Uma requisição cuja identidade não tem um dos scopes recebe então:

```http
HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer realm="Bootgly API", error="insufficient_scope", scope="posts:view posts:update"
```

`scope` lista todos os scopes configurados, separados por espaço (também com `all: false`). Quando o Bearer tem uma URL `metadata:`, `resource_metadata="…"` vem em seguida. O body continua `Forbidden`, exatamente como sem Bearer. Um fallback customizado de `Authorization` é dono da sua resposta, então não recebe o challenge.

Uma requisição sem identidade alguma — nenhuma autenticação rodou antes do gate, ou ela deixou `$Request->identity` como `null` — não é um cliente sem scope, e sim um não autenticado. Com um `Bearer:`, o `Scope` responde então exatamente o que a autenticação responderia: `401 Unauthorized` com o challenge do próprio Bearer.

```php
yield $Router->route('/reports', $Handler, GET, middlewares: [
   new Authorization(new Authorizing(
      new Scope('reports:read', Bearer: new Bearer($Resolver, realm: 'Bootgly API'))
   )),
]);
```

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="Bootgly API", error="invalid_token"
```

Uma identidade que não é um objeto `Identity` (um valor opaco devolvido por um resolver de `Bearer`) é um cliente autenticado sem scopes, então continua recebendo o challenge `403 insufficient_scope`. Sem `Bearer:`, uma requisição sem identidade recebe o `403 Forbidden` simples, como antes.

Como os scopes viajam separados por espaço dentro do challenge, cada um precisa ser um `scope-token` da RFC 6749 quando um `Bearer:` é passado — ASCII imprimível sem espaço, `"` ou `\`. Qualquer outra coisa lança `InvalidArgumentException` na criação do gate. Sem `Bearer:`, qualquer string não vazia continua aceita.

Veja [Protegendo um endpoint MCP](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/) na página Authentication para a rota completa com Bearer + Scope + CORS.

## Role gate

`Role` verifica grants em `Identity->claims['role']` e `Identity->claims['roles']`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Role;

new Role('admin');
new Role(['editor', 'publisher'], all: true);
```

O match de role é estrito e case-sensitive.

## Policy gate

`Policy` delega checks por recurso para o contrato de policy da API. O gate resolve a
identity HTTP, resolve um recurso opcional da rota e chama o engine da API, que é
independente de transporte.

```php
use Bootgly\API\Security\Authorization\Policy as PolicyContract;
use Bootgly\API\Security\Identity;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Policy as PolicyGate;

$Post = (object) ['owner' => 'user-42'];

$Policy = new class extends PolicyContract {
   public function update (Identity $Identity, mixed $Resource = null): null|bool
   {
      if (is_object($Resource) === false || property_exists($Resource, 'owner') === false) {
         return null;
      }

      return $Resource->owner === $Identity->id;
   }
};

new PolicyGate(
   Policy: $Policy,
   action: 'update',
   Resource: static function (object $Request) use ($Post): object {
      return $Post;
   }
);
```

Métodos de policy retornam `null|bool`: `true` permite, `false` nega e `null` significa sem
opinião. O engine trata `null` como negação. Os nomes built-in são `view`, `create`,
`update` e `delete`, mas qualquer método público da policy fornecida pode ser usado. Nomes
ausentes ou não chamáveis são rejeitados quando o gate é construído.

## Limite entre API e RBAC

Os gates WPI continuam focados em HTTP. Lookup RBAC persistido pertence à API:

```php
use Bootgly\API\Security\Authorization\RBAC;

$RBAC = new RBAC($Database);
$Identity = $RBAC->load($Identity);
```

Use RBAC para enriquecer ou checar uma identity antes que a rota HTTP chegue a um gate
`Scope`, `Role` ou `Policy`. Isso preserva a direção de camadas do Bootgly: WPI pode
depender de API, enquanto API pode usar ADI. Para servir esses checks de um cache, e impedir
que uma permissão revogada seja servida depois que `invalidate()` retorna, veja
**[Cache de listas de permissões](/guide/authorization/overview/)** no guide de Authorization.

## Demo e guide

As rotas demo executáveis ficam em
`projects/Demo/HTTP_Server_CLI/router/routes/Authorization.routes.php`.

Para o fluxo completo, incluindo migrations, seeders, tabelas RBAC e coleção Postman, veja
**[Authorization guide](/guide/authorization/overview/)**.

## Referência

### Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope

```php
public function __construct (string|array $scopes, bool $all = true, null|Bearer $Bearer = null)
```

Cria um gate de scope exato. `$scopes` é um scope ou uma lista deles; `$all` exige todos os scopes (`true`, o padrão) ou qualquer um deles (`false`). `$Bearer` transforma a negação em um challenge `insufficient_scope` (ou, para uma requisição sem identidade, no challenge `401` do Bearer). Lança `InvalidArgumentException` para scope ou lista vazios e — com um `$Bearer` — para um scope que não seja `scope-token` da RFC 6749.

```php
public private(set) null|Bearer $Bearer
```

O guard cujo challenge responde a negação, ou `null` (o padrão) para um `403 Forbidden` simples.

```php
public function deny (object $Response): object
```

Monta a negação: `403 Forbidden` com o body `Forbidden`, mais — quando `$Bearer` está definido — o challenge `WWW-Authenticate` escrito por `Bearer::forbid()` com os scopes configurados. Quando `$Bearer` está definido e a Request que a Response responde (`$Response->Request`) não tem identidade alguma, responde `Bearer::challenge()` no lugar: `401 Unauthorized` com o challenge do próprio Bearer. O gate não guarda estado por requisição: ele lê a identidade da própria Request da Response, então cada requisição recebe a sua resposta. O pipeline de middlewares HTTP roda de forma síncrona, então um `resolve()` não pode suspender. Um objeto parecido com uma resposta sem `Request` recebe o `403`.
