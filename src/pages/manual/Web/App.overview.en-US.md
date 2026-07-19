# Web App

`Web\App` is the MVC application shell: an opinionated boot of the canonical `HTTP_Server_CLI` with a default middleware stack, controller dispatch, resource routing, view conventions and inline static assets.

## A minimal app

The project's `boot` closure builds and starts the App:

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Web\App;


return new Project(
   name: 'Blog',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $App = new App(Mode: Modes::Daemon);

      $App
         ->configure(port: 8080, workers: 1)
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

`load()` reads the standard router folder (`router/router.index.php` + `router/routes/<Name>.php`) — the same convention as any WPI project. `start()` wires the events, applies the view conventions and boots the server.

Every route gets the **default middleware stack**: `SecureHeaders`, `RequestId`, `BodyParser` and `CSRF`. Replace it wholesale when the project needs a different one (a REST API drops CSRF, for example):

```php
$App->configure(
   port: 8090,
   middlewares: [
      new SecureHeaders,
      new RequestId,
      new BodyParser,
      new Problems  // problem+json error boundary (Web\API)
   ]
);
```

When the project ships `configs/database/` (or `configs/kv/`), the **Database** (or **KV**) response resource is provided automatically — controllers just use `$Response->Database`.

## Controllers

A controller is a plural noun of its resource; actions are single-word verbs receiving `(Request, Response)` — the same calling convention as closure handlers:

```php
namespace Blog\Controllers;

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Web\App\Controller;


class Posts extends Controller
{
   public function list (Request $Request, Response $Response): Response
   {
      $body = $Response->Database->paginate(Post::class);

      return $this->render('posts/list', ['posts' => $body['items']]);
   }

   public function show (Request $Request, Response $Response): Response
   {
      $id = $this->Route->Params->id;
      // ...

      return $this->render('posts/show', ['post' => $post]);
   }
}
```

A **fresh controller instance is constructed per request** — the server is preforked and long-running, so no request state ever survives on the instance. The matched route is read live through the `$Route` hook.

## Resource routing

`Controllers::map()` expands one declaration into the HTML-form-aware route set, inside a route set file:

```php
use Web\App\Controllers;

use Blog\Controllers\Posts;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   yield from Controllers::map($Router, '/posts', Posts::class);
};
```

| Route              | Methods          | Action   | Notes             |
|--------------------|------------------|----------|-------------------|
| `/posts`           | GET              | `list`   |                   |
| `/posts/create`    | GET              | `create` | renders the form  |
| `/posts`           | POST             | `create` | persists          |
| `/posts/:id`       | GET              | `show`   |                   |
| `/posts/:id/edit`  | GET              | `edit`   | renders the form  |
| `/posts/:id`       | POST, PUT, PATCH | `update` | POST = HTML forms |
| `/posts/:id/delete`| POST             | `delete` | HTML forms        |
| `/posts/:id`       | DELETE           | `delete` |                   |

`create` is the one dual-faced action: GET renders the blank form and POST persists — branch on `$Request->method` inside the action. Filter the set with `only:` / `except:`, and adjust the `:id` constraint with `constraint:` (`'int'` by default).

## Views

Views live in the project `views/` directory and render through the core View resource. The platform convention: a default layout at `views/layouts/main.template.php` wraps every render (the view's loose output becomes the layout `content` section):

```php
<!-- views/layouts/main.template.php -->
<main>
   @yield content;
</main>
```

Change the convention through `$App->Views` before `start()`:

```php
$App->Views->layout = 'layouts/site';
$App->Views->share(['app' => 'Blog']);
```

## Static assets

`Statics` serves project assets **inline with the right media type** — `Response->upload()` is download semantics (`Content-Disposition: attachment`), which browsers reject for stylesheets and scripts under `nosniff`:

```php
use Web\App\Statics;

yield $Router->route('/statics/:file*', new Statics, GET);
```

Files resolve inside the project `statics/` jail (path-normalized and base-contained); unknown extensions stay `application/octet-stream`.

## Logs

`start()` registers a global file sink: exception reports and opted-in loggers persist to `storage/logs/<channel>.log` in every mode. In **Daemon** mode the workers detach from the terminal — the log file is where errors land.

---

## Reference

### Web\App

```php
public function __construct (Modes $Mode = Modes::Daemon)
```

Creates the shell: a `HTTP_Server_CLI` in the given mode, the `Views` conventions and the default middleware stack (`SecureHeaders`, `RequestId`, `BodyParser`, `CSRF`).

```php
public function configure (string $host = '0.0.0.0', int $port = 8080, int $workers = 2, null|array $middlewares = null, null|array|AutoTLS $secure = null, null|array $resources = null, null|string $health = '/health'): self
```

Configures the underlying HTTP Server. `middlewares:` replaces the default stack wholesale; `secure:` takes the TLS context options — or an `AutoTLS` instance for automatic HTTPS via Let's Encrypt; `resources:` adds response resources (name => provider) — Database/KV are auto-provided when the project ships their configs; `health:` sets the built-in health-check endpoint (`null` disables it).

```php
public function load (string $path): self
```

Loads the project router folder (`router.index.php` + `routes/*.php`) and keeps the handler for `start()`.

```php
public function start (): void
```

Registers the global log sink, wires the platform events (view conventions + global middleware stack on the first-request drain, the launch banner on `Events::ServerAdvertised` — rendered by the process that owns the terminal, so it survives the Daemon detach — and the stop banner) and starts the server. Throws when no router was loaded.

### Web\App\Controller

```php
public Route $Route { get }
```

The current matched route, read live from the server (params via `$this->Route->Params`).

```php
protected function render (string $view, null|array $data = null, null|string|false $layout = null): Response
```

Renders a project view through the Response View resource. `layout:` overrides the configured default (false/'' renders bare).

```php
protected function redirect (string $URI, null|int $code = null): Response
```

Redirects through the Response. A null code derives from the request method (POST → 303, otherwise 307).

### Web\App\Controllers

```php
public static function map (Router $Router, string $path, string $controller, null|array $only = null, null|array $except = null, array $middlewares = [], null|string $constraint = 'int'): Generator
```

Expands one MVC resource declaration into the route table above. Unknown `only`/`except` action names throw at registration time; `middlewares:` applies to every expanded route.

### Web\App\Statics

```php
public function __construct (string $path = 'statics', string $param = 'file', string $cache = 'public, max-age=3600')
```

Invokable static-file handler for a catch-all param route (`/statics/:file*`). Serves inline with the media type mapped from the file extension and the given `Cache-Control`.

### Web\App\Views

```php
public function share (array $variables): self
```

Merges variables exported to every render (later values win).

```php
public function apply (Response $Response): void
```

Applies the layout + shared exports onto the Response View resource — called by `App->start()` on the first-request drain of each worker.
