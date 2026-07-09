# Web Platform

Build web applications — MVC sites and REST APIs — with Bootgly's opinionated Web platform. Controllers, resource routing, problem+json errors and view conventions over the native HTTP server. Zero dependencies, pure PHP.

## Set it up

The [canonical installer](/guide/getting-started) can install it right away — it asks which platforms to set up, so just pick **Web**:

```bash
curl -fsSL https://bootgly.com/install | bash
```

Didn't pick it at install time? Add it later to an existing kit:

```bash
git submodule update --init Web
```

Or through the wizard flag:

```bash
php bootgly project create --platform=web
```

## Your first web app

Create a project (interface **WPI**) with the wizard, then make its `.project.php` boot a `Web\App`:

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

Routes live in the standard router folder. Declare a full CRUD resource with one line:

```php
// router/routes/Hello.php
use Web\App\Controllers;
use Web\App\Statics;

use projects\Hello\Controllers\Posts;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   yield from Controllers::map($Router, '/posts', Posts::class);

   yield $Router->route('/statics/:file*', new Statics, GET);
};
```

And write the controller — a plural noun with single-word verb actions:

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

Views render through the template engine, wrapped by the `views/layouts/main.template.php` layout. Start it:

```bash
php bootgly project Hello start
```

You get the shell for free: SecureHeaders, RequestId, BodyParser and CSRF on every route, sessions ready for the CSRF token, exception logs in `storage/logs/` and a fresh controller instance per request.

## A REST API

Swap the stack (no CSRF; a problem+json error boundary instead) and use the REST mapping:

```php
$App->configure(
   port: 8090,
   middlewares: [new SecureHeaders, new RequestId, new BodyParser, new Problems]
);
```

```php
// router/routes/Tasks.php (excerpt)
yield from Routes::map($Router, '/tasks', Tasks::class, only: ['list', 'show']);
yield from Routes::map(
   $Router, '/tasks', Tasks::class,
   except: ['list', 'show'],
   middlewares: [new Authentication($JWTStrategy)]
);
```

Controllers throw problems instead of hand-rolling error JSON:

```php
throw new Problem(404, detail: "Task {$id} not found.");
```

```json
{"type":"about:blank","title":"Not Found","status":404,"detail":"Task 13 not found."}
```

Pagination comes from the core: `$Response->Database->paginate(Task::class)` reads `?page`/`?limit`/`?cursor` and sets the `X-Total-Count`/`Link` headers — a `Resource` transformer shapes the items.

## Try the demos

The platform ships four complete exportable projects — import them with the wizard (**Import projects from Platforms**) and run:

```bash
php bootgly project Blog start    # MVC: posts CRUD + CSRF forms + SQLite  → :8080
php bootgly project Tasks start   # REST: JWT + problem+json + pagination → :8090
php bootgly project Chat start    # Realtime WS rooms (client page inside) → :8085
php bootgly project Site start    # Landing pages + layouts + statics      → :8088
```

Each is a compact reference: **Blog** for the full MVC loop (ORM models, migrations + seeds at boot, Session flash, masked CSRF tokens), **Tasks** for the REST shell, **Chat** for WebSocket Channels (open <http://localhost:8085> in two tabs — the WS server serves its own client page) and **Site** for controller-dispatched pages without a database.

## Going deeper

- [Web](/manual/Web) — how the platform boots and how projects bind to it.
- [App](/manual/Web/App) — the MVC shell: App, Controller, Controllers, Statics, Views.
- [API](/manual/Web/API) — the REST shell: Action, Problem/Problems, Resource, Routes.
