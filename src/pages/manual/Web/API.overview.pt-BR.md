# Web API

`Web\API` é o shell REST: dispatch de ações de controller, REST resource routing, problem details RFC 9457 e transformadores de entidades — uma camada opinativa sobre o core WPI não opinativo.

## Um recurso REST

Declare o recurso em um route set — leituras públicas, mutações atrás de JWT:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Web\API\Routes;

use Tasks\Controllers\Tasks;


return static function (Request $Request, Response $Response, Router $Router) use ($JWTStrategy): Generator
{
   yield from Routes::map($Router, '/tasks', Tasks::class, only: ['list', 'show']);
   yield from Routes::map(
      $Router, '/tasks', Tasks::class,
      except: ['list', 'show'],
      middlewares: [new Authentication($JWTStrategy)]
   );
};
```

| Rota         | Métodos    | Ação     |
|--------------|------------|----------|
| `/tasks`     | GET        | `list`   |
| `/tasks`     | POST       | `create` |
| `/tasks/:id` | GET        | `show`   |
| `/tasks/:id` | PUT, PATCH | `update` |
| `/tasks/:id` | DELETE     | `delete` |

Sem páginas de formulário aqui — esse é o mapeamento MVC do [Controllers::map](/manual/Web/App). Middleware por ação são duas chamadas de `map()` com `only`/`except`, como acima.

## Problems (RFC 9457)

Um `Problem` é ao mesmo tempo uma `Exception` e um renderizador — lance-o de qualquer controller e o middleware `Problems` o transforma em `application/problem+json`:

```php
use Web\API\Problem;

public function show (Request $Request, Response $Response): Response
{
   $id = $this->Route->Params->id;

   if ($task === null) {
      throw new Problem(404, detail: "Task {$id} not found.");
   }
   // ...
}
```

```json
{"type":"about:blank","title":"Not Found","status":404,"detail":"Task 13 not found."}
```

Coloque o `Problems` na stack de middlewares do app (ou no grupo de rotas REST). Ele estreita apenas a representação do erro:

- um `Problem` lançado renderiza em **todos** os ambientes — é uma resposta de API projetada, não um defeito;
- um `Throwable` genérico é **relançado** em Development/Test, então o Catcher do core mantém sua página de debug;
- em Production/Staging ele é reportado via `Throwables::notify()` e renderizado como um problem 500 sem internals.

## Resources (transformadores)

Um `Resource` dá forma a entidades (models do ORM ou arrays de linha) na sua representação pública de API:

```php
use Web\API\Resource;


class Tasks extends Resource
{
   public function transform (object|array $Entity): array
   {
      return [
         'id' => (int) $Entity->id,
         'title' => (string) $Entity->title,
         'done' => (bool) $Entity->done
      ];
   }
}
```

`paginate()` mapeia os `items` de um body de paginação do core no lugar — o envelope REST DX (`page`/`pages`/`limit`/`total` ou `limit`/`next`, mais os headers `X-Total-Count`/`Link`) é reutilizado, nunca recalculado:

```php
public function list (Request $Request, Response $Response): Response
{
   $body = $Response->Database->paginate(Task::class);

   return $Response->JSON->send(new Resource()->paginate($body));
}
```

## Dispatch

`Action` é o dispatcher invocável que os dois shells compartilham: ele satisfaz o tipo `callable` do handler do Router adiando a construção do controller para o momento do request — uma **instância nova de controller por request**. Use-o direto para rotas não-CRUD:

```php
use Web\API\Action;

yield $Router->route('/about', new Action(Pages::class, 'show'), GET);
```

---

## Reference

### Web\API\Action

```php
public function __construct (string $controller, string $action)
```

Registra o dispatcher. A ação é validada com `method_exists` — ações desconhecidas lançam `InvalidArgumentException` no momento do registro, nunca no request.

```php
public function __invoke (object $Request, object $Response): mixed
```

Despacha a ação em uma instância nova do controller.

### Web\API\Problem

```php
public function __construct (int $status = 500, string $title = '', null|string $detail = null, string $type = 'about:blank', null|string $instance = null, array $extensions = [])
```

Um problem RFC 9457. Um `title` vazio deriva do texto do status HTTP; `extensions` são membros extras (nunca sobrescrevem os padrão). Sendo uma `Exception`, carrega o title como mensagem e o status como código.

```php
public function render (Response $Response): Response
```

Renderiza o problem como `application/problem+json` na Response dada (status + payload de membros).

### Web\API\Problems

```php
public function process (object $Request, object $Response, Closure $next): object
```

A fronteira de erros em middleware descrita acima. `Problems::$Environment` é um override de ambiente one-shot (espelha o `Catcher::$Environment` do core) consumido pelo ramo de Throwable genérico — para specs E2E exercitarem o caminho de Production.

### Web\API\Resource

```php
abstract public function transform (object|array $Entity): array
```

Dá forma a uma entidade na sua representação pública de API.

```php
public function collect (iterable $Entities): array
```

Transforma uma lista de entidades, em ordem.

```php
public function paginate (array $body): array
```

Transforma os `items` de um body de `$Response->Database->paginate()` no lugar, preservando as chaves do envelope.

### Web\API\Routes

```php
public static function map (Router $Router, string $path, string $controller, null|array $only = null, null|array $except = null, array $middlewares = [], null|string $constraint = 'int'): Generator
```

Expande uma declaração de recurso REST na tabela de rotas acima. Nomes de ação desconhecidos em `only`/`except` lançam no momento do registro; `middlewares:` aplica a toda rota expandida; `constraint:` ajusta o tipo do param `:id` (null registra um `:id` sem constraint).
