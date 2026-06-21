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
depender de API, enquanto API pode usar ADI.

## Demo e guide

As rotas demo executáveis ficam em
`projects/Demo/HTTP_Server_CLI/router/routes/Authorization.php`.

Para o fluxo completo, incluindo migrations, seeders, tabelas RBAC e coleção Postman, veja
**[Authorization guide](/guide/authorization/overview/)**.