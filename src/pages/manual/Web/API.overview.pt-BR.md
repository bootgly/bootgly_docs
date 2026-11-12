# Web API

`Web\API` é o shell REST: dispatch de ações de controller, REST resource routing, problem details RFC 9457 e transformadores de entidades — uma camada opinativa sobre o core WPI não opinativo.

## Um recurso REST

Declare o recurso em um route set — leituras públicas, mutações atrás de JWT:

```php
use Bootgly\API\Security\JWT;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\JWT as JWTGuard;
use Web\API\Routes;

use Demo\Tasks\Controllers\Tasks;


$JWT = new JWT((string) getenv('JWT_SECRET'));  // HS256: no mínimo 32 bytes
$JWTStrategy = new Authenticating(new JWTGuard($JWT));


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

O router faz o `require` de um route set uma vez, quando o `App->load()` roda, então a estratégia JWT é montada no boot e toda rota de mutação a compartilha. Um secret HS256 com menos de 32 bytes — um `JWT_SECRET` não definido incluso — faz o `new JWT()` lançar `InvalidArgumentException`, e o app para ali em vez de rodar com uma chave fraca. O projeto de exemplo `Demo/Tasks` é este route set mais uma rota `POST /auth/token` que emite um token de demonstração; o guard e suas políticas estão em [Authentication](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/#guard-jwt).

## Problems (RFC 9457)

Um `Problem` é ao mesmo tempo uma `Exception` e um renderizador — lance-o de qualquer controller e o middleware `Problems` o transforma em `application/problem+json`:

```php
use Web\API\Problem;

public function show (Request $Request, Response $Response): Response
{
   $id = (int) $this->Route->Params->id;
   $Result = $Response->Database->fetch('SELECT id, title, done FROM tasks WHERE id = $1', [$id]);

   if ($Result->empty === true) {
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
- em Production/Staging ele é reportado via `Throwables::notify()` e renderizado como um problem 500 sem internals;
- a fronteira também cobre **trabalho deferred**: `Problems` implementa `Recovering`, então um `Problem` lançado dentro de `$Response->defer()` ainda renderiza como `application/problem+json`, um `Response\Timeout` vira um problem `503`, e um `Throwable` genérico segue a mesma regra de ambiente — declinado ao Catcher do core em Development/Test, um problem 500 sem internals em Production/Staging.

```php
public function delete (Request $Request, Response $Response): Response
{
   $id = $this->Route->Params->id;

   return $Response->defer(static function (Response $Response) use ($id): void {
      $Response->wait();
      throw new Problem(422, detail: "Task {$id} cannot be deleted.");
   });
}
```

### Erros de validação

Membros de extensão carregam o que os padrão não carregam — as regras que falharam num payload, por exemplo. Rode uma [Validation](/manual/ADI/Validation) nos fields do request e entregue os `errors` dela pelo `extensions:`:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Boolean;
use Bootgly\ADI\Validators\Required;
use Web\API\Problem;

public function create (Request $Request, Response $Response): Response
{
   $Validation = new Validation(
      source: $Request->fields,
      rules: [
         'title' => [new Required],
         'done' => [new Boolean]
      ]
   );

   if ($Validation->valid === false) {
      throw new Problem(422, detail: 'The task payload is invalid.', extensions: [
         'errors' => $Validation->errors
      ]);
   }
   // ...
}
```

Para `{"title": "", "done": "maybe"}`, o cliente recebe:

```json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"The task payload is invalid.","errors":{"title":["title is required."],"done":["done must be a boolean."]}}
```

As extensões vêm depois dos membros padrão e nunca sobrescrevem um deles: uma extensão chamada `status` fica de fora.

### Renderize sem lançar

O `render()` responde o mesmo problem sem desenrolar a pilha: ele escreve o problem na Response e a retorna, então um handler pode retorná-lo direto — e nenhum middleware `Problems` precisa capturar nada. O `show()` acima, respondendo seu 404 desse jeito:

```php
if ($Result->empty === true) {
   return new Problem(404, detail: "Task {$id} not found.")->render($Response);
}
```

A mesma chamada cabe em qualquer lugar que retorna uma Response — no `fallback` do middleware [Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/#validator) do core, por exemplo, que fora isso responde a uma regra que falhou com `application/json` puro:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Boolean;
use Bootgly\ADI\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator\Sources;
use Web\API\Problem;

$Payload = new Validator(
   rules: [
      'title' => [new Required],
      'done' => [new Boolean]
   ],
   Source: Sources::Fields,
   fallback: static fn (Request $Request, Response $Response, Validation $Validation): Response
      => new Problem(422, detail: 'The task payload is invalid.', extensions: [
         'errors' => $Validation->errors
      ])->render($Response)
);
```

Passe o `$Payload` no `middlewares:` da rota que recebe esse payload: um request que falha uma regra recebe o mesmo problem `422` da ação acima, e a ação nunca roda.

## Resources (transformadores)

Um `Resource` dá forma a entidades (models do ORM ou arrays de linha) na sua representação pública de API. O `transform()` recebe qualquer um dos dois, então leia ambos:

```php
namespace Demo\Tasks\Resources;


use function is_object;

use Web\API\Resource;


class Tasks extends Resource
{
   public function transform (object|array $Entity): array
   {
      $id = is_object($Entity) === true ? $Entity->id : $Entity['id'];
      $title = is_object($Entity) === true ? $Entity->title : $Entity['title'];
      $done = is_object($Entity) === true ? $Entity->done : $Entity['done'];

      return [
         'id' => (int) $id,
         'title' => (string) $title,
         'done' => (bool) $done
      ];
   }
}
```

`paginate()` mapeia os `items` de um body de paginação do core no lugar — o envelope REST DX (`page`/`pages`/`limit`/`total` ou `limit`/`next`, mais os headers `X-Total-Count`/`Link`) é reutilizado, nunca recalculado:

```php
use Demo\Tasks\Models\Task;
use Demo\Tasks\Resources\Tasks as Resource;

public function list (Request $Request, Response $Response): Response
{
   $body = $Response->Database->paginate(Task::class);

   return $Response->JSON->send(new Resource()->paginate($body));
}
```

O `Web\API\Resource` é abstrato: um controller instancia a subclasse do projeto. O controller de Tasks também é uma classe `Tasks`, então ele importa o transformador sob o alias `Resource`.

## Dispatch

`Action` é o dispatcher invocável que os dois shells compartilham: ele satisfaz o tipo `callable` do handler do Router adiando a construção do controller para o momento do request — uma **instância nova de controller por request**. Use-o direto para rotas não-CRUD — uma página, ou uma ação extra ao lado de um recurso mapeado:

```php
use Web\API\Action;
use Web\API\Routes;

use Journal\Controllers\Notes;
use Journal\Controllers\Pages;


yield $Router->route('/about', new Action(Pages::class, 'show'), GET);

yield from Routes::map($Router, '/notes', Notes::class);
yield $Router->route('/notes/:id<int>/pin', new Action(Notes::class, 'pin'), POST);
```

O `pin()` é um método público de `Notes` com a assinatura das ações mapeadas — `(Request $Request, Response $Response): Response` — e lê o `:id` de `$this->Route->Params->id`. A rota dele repete a constraint `int` que o `map()` põe no `:id`, e o segmento extra a mantém separada de `/notes/:id<int>`.

---

## Reference

### Web\API\Action

```php
public function __construct (string $controller, string $action)
```

Registra o dispatcher. A ação é validada com `method_exists` — ações desconhecidas lançam `InvalidArgumentException` no momento do registro, nunca no request. Mantenha a ação pública: o `method_exists()` também aceita um método privado ou protegido, e chamá-lo falha no request com um `Error`.

```php
public function __invoke (object $Request, object $Response): mixed
```

Despacha a ação em uma instância nova do controller.

```php
public private(set) string $controller
```

A classe do controller (`class-string`) instanciada a cada dispatch, como registrada. Somente leitura.

```php
public private(set) string $action
```

O método chamado nessa instância. Somente leitura.

### Web\API\Problem

```php
public function __construct (int $status = 500, string $title = '', null|string $detail = null, string $type = 'about:blank', null|string $instance = null, array $extensions = [])
```

Um problem RFC 9457. Um `title` vazio deriva do texto do status HTTP — `'Error'` para um status sem texto no servidor (`299`), que o `render()` então recusa: a Response lança `InvalidArgumentException`. `extensions` são membros extras (nunca sobrescrevem os padrão). Sendo uma `Exception`, carrega o title como mensagem e o status como código. Cada argumento fica guardado na propriedade somente leitura de mesmo nome abaixo.

```php
public function render (Response $Response): Response
```

Renderiza o problem como `application/problem+json` na Response dada e a retorna: o status, e como payload os membros `type`, `title` e `status`, `detail` e `instance` quando definidos, depois as extensões.

```php
public private(set) string $type
```

Referência URI que identifica o tipo do problem (RFC 9457 §3.1.1) — `'about:blank'` por padrão.

```php
public private(set) string $title
```

Resumo curto e legível: o dado, ou o texto derivado do status.

```php
public private(set) int $status
```

O código de status HTTP da resposta.

```php
public private(set) null|string $detail
```

Explicação específica desta ocorrência; `null` a deixa fora do payload.

```php
public private(set) null|string $instance
```

Referência URI que identifica esta ocorrência; `null` a deixa fora do payload.

```php
public private(set) array $extensions
```

Membros de extensão, por nome (`array<string,mixed>`), renderizados depois dos padrão e nunca por cima deles — um chamado `detail` ou `instance` só aparece enquanto o problem deixa esse membro sem valor.

### Web\API\Problems

```php
public function process (object $Request, object $Response, Closure $next): object
```

A fronteira de erros em middleware descrita acima. `Problems::$Environment` é um override de ambiente one-shot (espelha o `Catcher::$Environment` do core) consumido pelo ramo de Throwable genérico — para specs E2E exercitarem o caminho de Production.

```php
public function recover (Request $Request, Response $Response, Throwable $Throwable): null|Response
```

O lado de trabalho deferred da mesma fronteira (`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Recovering`): renderiza um `Problem` em todo ambiente, responde a um `Response\Timeout` com um problem `503`, e aplica a regra de ambiente a qualquer outro `Throwable` — `null` (declinado ao Catcher do core) em Development/Test, um problem 500 sem internals, reportado, em Production/Staging. `Problems::$Environment` também é consumido aqui, por esse ramo de Throwable genérico — um `Problem` ou um `Timeout` não o toca.

### Web\API\Resource

```php
abstract public function transform (object|array $Entity): array
```

Dá forma a uma entidade — um model do ORM ou um array de linha — na sua representação pública de API.

```php
public function collect (iterable $Entities): array
```

Transforma uma lista de entidades, em ordem.

```php
public function paginate (array $body): array
```

Transforma os `items` de um body de `$Response->Database->paginate()` no lugar, preservando as chaves do envelope. Um body sem um array `items` volta inalterado, e uma entrada de `items` que não é objeto nem array é descartada.

### Web\API\Routes

```php
public static function map (Router $Router, string $path, string $controller, null|array $only = null, null|array $except = null, array $middlewares = [], null|string $constraint = 'int'): Generator
```

Expande uma declaração de recurso REST na tabela de rotas acima. Nomes de ação desconhecidos em `only`/`except` lançam no momento do registro; `middlewares:` aplica a toda rota expandida; `constraint:` ajusta o tipo do param `:id` (null registra um `:id` sem constraint).
