# Plataforma Web

Construa aplicações web — sites MVC e APIs REST — com a plataforma Web opinativa do Bootgly. Controllers, resource routing, erros problem+json e convenções de views sobre o servidor HTTP nativo. Zero dependências, PHP puro.

## Configure

O [instalador canônico](/guide/getting-started) pode instalá-la de imediato — ele pergunta quais plataformas configurar, então basta escolher **Web**:

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

## Seu primeiro app web

Crie um projeto (interface **WPI**) com o wizard, e faça o `.project.php` dele inicializar um `Web\App`:

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Web\App;


return new Project(
   name: 'Hello',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $App = new App(Mode: match (true) {
         isset($options['f']) => Modes::Foreground,
         default => Modes::Daemon
      });

      $App
         ->configure(port: 8080, workers: 1)
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

Rotas vivem na pasta de router padrão. Declare um recurso CRUD completo com uma linha:

```php
// router/routes/Hello.php
use Web\App\Controllers;
use Web\App\Statics;

use Hello\Controllers\Posts;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   yield from Controllers::map($Router, '/posts', Posts::class);

   yield $Router->route('/statics/:file*', new Statics, GET);
};
```

E escreva o controller — um substantivo plural com ações em verbos de uma palavra:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Web\App\Controller;


class Posts extends Controller
{
   public function list (Request $Request, Response $Response): Response
   {
      return $this->render('posts/list', ['posts' => [/* ... */]]);
   }

   public function show (Request $Request, Response $Response): Response
   {
      $id = $this->Route->Params->id;

      return $this->render('posts/show', ['id' => $id]);
   }
}
```

Views renderizam pelo template engine, envolvidas pelo layout `views/layouts/main.template.php`. Inicie:

```bash :toolbar="true";
php bootgly project Hello start
```

O shell vem de graça: SecureHeaders, RequestId, BodyParser e CSRF em toda rota, sessões prontas para o token CSRF, logs de exceção em `storage/logs/` e uma instância nova de controller por request.

## Uma API REST

Troque a stack (sem CSRF; uma fronteira de erros problem+json no lugar) e use o mapeamento REST:

```php
$App->configure(
   port: 8090,
   middlewares: [new SecureHeaders, new RequestId, new BodyParser, new Problems]
);
```

```php
// router/routes/Tasks.php (trecho)
yield from Routes::map($Router, '/tasks', Tasks::class, only: ['list', 'show']);
yield from Routes::map(
   $Router, '/tasks', Tasks::class,
   except: ['list', 'show'],
   middlewares: [new Authentication($JWTStrategy)]
);
```

Controllers lançam problems em vez de montar JSON de erro na mão:

```php
throw new Problem(404, detail: "Task {$id} not found.");
```

```json
{"type":"about:blank","title":"Not Found","status":404,"detail":"Task 13 not found."}
```

A paginação vem do core: `$Response->Database->paginate(Task::class)` lê `?page`/`?limit`/`?cursor` e define os headers `X-Total-Count`/`Link` — um transformador `Resource` dá forma aos items.

## Experimente os demos

A plataforma inclui quatro projetos exportáveis completos — importe-os com o wizard (**Import projects from Platforms**) e execute:

```bash
php bootgly project Blog start    # MVC: CRUD de posts + forms CSRF + SQLite → :8080
php bootgly project Tasks start   # REST: JWT + problem+json + paginação    → :8090
php bootgly project Chat start    # Salas WS em tempo real (client incluso) → :8085
php bootgly project Site start    # Páginas de landing + layouts + estáticos → :8088
```

Cada um é uma referência compacta: **Blog** para o ciclo MVC completo (models do ORM, migrations + seeds no boot, flash de Session, tokens CSRF mascarados), **Tasks** para o shell REST, **Chat** para os Channels de WebSocket (abra <http://localhost:8085> em duas abas — o servidor WS serve a própria página do cliente) e **Site** para páginas despachadas por controller sem banco.

## Indo além

- [Web](/manual/Web) — como a plataforma inicializa e como projetos se vinculam a ela.
- [App](/manual/Web/App) — o shell MVC: App, Controller, Controllers, Statics, Views.
- [API](/manual/Web/API) — o shell REST: Action, Problem/Problems, Resource, Routes.
