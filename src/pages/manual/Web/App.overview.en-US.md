# Web App

`Web\App` is the MVC application shell: an opinionated boot of the canonical `HTTP_Server_CLI` with a default middleware stack, controller dispatch, resource routing, view conventions and inline static assets.

## A minimal app

The project's `boot` closure builds and starts the App:

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Web\App;
use Web\App\Configs;


return new Project(
   name: 'Blog',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $App = new App(Mode: Modes::Daemon);

      $App
         ->configure(new Configs(port: 8080, workers: 1))
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

`load()` reads the standard router folder (`router/router.index.php` + `router/routes/<Name>.routes.php`) — the same convention as any WPI project. `start()` wires the events, applies the view conventions and boots the server.

`configure()` takes **Configs** — the same typed value objects every WPI node takes. One `Web\App\Configs` carries every option of the underlying `HTTP_Server_CLI\Configs` (bind address, workers, TLS or Auto-TLS, privilege dropping, HTTP/2, health endpoint, connection caps) with the platform defaults filled in — `host: '0.0.0.0'`, `port: 8080`, `workers: 2`, `health: '/health'` — plus the three shell concerns, `Middlewares`, `Resources` and `deferredTimeout`. Nothing is required: `$App->configure()` alone boots on the defaults. Named arguments only — a positional `new Configs('0.0.0.0', 8080)` raises a `TypeError`.

> [!WARNING]
> **Breaking: the flat named parameters are gone.** `configure(port: 8080, middlewares: [...])` no longer exists, with no alias — the App follows the WPI nodes, which moved to typed Configs in `1.0.0-rc.1`. Wrap the same options in a `Web\App\Configs`: `middlewares:` becomes `Middlewares:`, `resources:` becomes `Resources:`, and `secure: new AutoTLS(...)` becomes `AutoTLS: new AutoTLS(...)` (`secure:` keeps the manual TLS context only).

Every route gets the **default middleware stack**: `SecureHeaders`, `RequestId`, `BodyParser` and `CSRF`. Replace it wholesale when the project needs a different one (a REST API drops CSRF, for example):

```php
$App->configure(new Configs(
   port: 8090,
   Middlewares: [
      new SecureHeaders,
      new RequestId,
      new BodyParser,
      new Problems  // problem+json error boundary (Web\API)
   ]
));
```

When the project ships `configs/database/` (or `configs/kv/`), the **Database** (or **KV**) response resource is provided automatically — controllers just use `$Response->Database`. Extra resources go in `Resources:` (name => factory); an explicit `Database`/`KV` entry wins over the automatic one.

The node Configs the server takes on its own travel in the same call: `Request\Configs` (body and multipart limits) is forwarded verbatim, in any order. A later `configure()` that carries only such a node Configs refines on top of the `Web\App\Configs` last applied — it never resets the transport to the platform defaults. `HTTP_Server_CLI\Configs` and `Response\Configs` are composed by the App from its own Configs — handing them directly throws `InvalidArgumentException` naming `Web\App\Configs` as the way. The whole set is validated first (a repeated class, an unsupported one), so a rejected call applies nothing:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Configs as RequestConfigs;

$App->configure(
   new Configs(port: 8080, workers: 1, health: null),  // health: null switches the built-in endpoint off
   new RequestConfigs(maxBodySize: 32 * 1024 * 1024)
);
```

## Controllers

A controller is a plural noun of its resource; actions are single-word verbs receiving `(Request, Response)` — the same calling convention as closure handlers:

```php
namespace Demo\Blog\Controllers;

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Web\App\Controller;


class Posts extends Controller
{
   public function list (Request $Request, Response $Response): Response
   {
      $body = $Response->Database->paginate(Post::class);

      return $this->render('posts/list', ['Posts' => $body['items']]);
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

use Demo\Blog\Controllers\Posts;


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

`start()` registers a global file sink: exception reports and opted-in loggers persist to `storage/logs/<channel>.log` in every mode. In **Daemon** mode the workers detach from the terminal — the log file is where errors land — and this sink takes the place of the default one the server would otherwise install at that path, so no record is persisted twice.

---

## Reference

### Web\App

```php
public function __construct (Modes $Mode = Modes::Daemon)
```

Creates the shell: a `HTTP_Server_CLI` in the given mode, the `Views` conventions and the default middleware stack (`SecureHeaders`, `RequestId`, `BodyParser`, `CSRF`).

```php
public function configure (Bootgly\ABI\Configs ...$Configs): self
```

Configures the underlying HTTP Server: at most one `Web\App\Configs` (none applies the platform defaults) plus the node Configs the server takes on its own — `Request\Configs` is forwarded verbatim, in any order. Throws `InvalidArgumentException` on a repeated Configs class, on a Configs the App does not accept, and on `HTTP_Server_CLI\Configs` or `Response\Configs` handed directly (the App composes those from its own Configs). The whole set is validated before anything is applied.

```php
public function load (string $path): self
```

Loads the project router folder (`router.index.php` + `routes/*.routes.php`) and keeps the handler for `start()`.

```php
public function start (): void
```

Registers the global log sink, wires the platform events (view conventions + global middleware stack on the first-request drain, the launch banner on `Events::ServerAdvertised` — rendered by the process that owns the terminal, so it survives the Daemon detach — and the stop banner) and starts the server. Throws when no router was loaded.

### Web\App\Configs

```php
public function __construct (
   Argument $Named = Argument::Undefined,
   null|string $host = null,                 // '0.0.0.0'
   null|int $port = null,                    // 8080
   null|int $workers = null,                 // 2
   null|array $secure = null,
   null|string $user = null,
   null|string $group = null,
   null|AutoTLS $AutoTLS = null,
   null|bool $enableHTTP2 = null,
   null|string $health = '/health',
   null|int $maxConnections = null,
   null|int $maxConnectionsPerIP = null,
   null|int $connectionIdleTimeout = null,
   null|array $Middlewares = null,
   null|array $Resources = null,
   null|int|float $deferredTimeout = null
)
```

Extends `HTTP_Server_CLI\Configs`: every server option, with the Web platform defaults filled in (`host`, `port` and `workers` fall back instead of being required), plus the three shell concerns. Named arguments only — the first slot is the `Bootgly\ABI\Argument` guard, so a positional call raises a `TypeError`. Throws `InvalidArgumentException` at `new` when both `secure` and `AutoTLS` are given, on a `Middlewares` entry that is not a `Middleware`, or on a `Resources` value that is not a Closure keyed by name.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `null\|string` | `null` (= `'0.0.0.0'`) | Bind address. |
| `port` | `null\|int` | `null` (= `8080`) | Listen port. |
| `workers` | `null\|int` | `null` (= `2`) | Number of forked worker processes. |
| `secure` | `null\|array` | `null` | Secure SSL/TLS stream context options; switches the scheme to `https://`. Mutually exclusive with `AutoTLS`. |
| `user` | `null\|string` | `null` | POSIX user name to demote the process to after binding. |
| `group` | `null\|string` | `null` | POSIX group name to demote the process to after binding. |
| `AutoTLS` | `null\|AutoTLS` | `null` | Automatic HTTPS via Let's Encrypt (ACME). Mutually exclusive with `secure`. See the [Auto-TLS](/guide/auto-tls) guide. |
| `enableHTTP2` | `null\|bool` | `null` (= enabled) | `false` serves HTTP/1.x only. |
| `health` | `null\|string` | `'/health'` | Built-in health-check endpoint, answered before any middleware. `null` disables it. |
| `maxConnections` | `null\|int` | `null` (= `10000`) | Maximum established connections per worker; `0` disables the limit. |
| `maxConnectionsPerIP` | `null\|int` | `null` (= `0`) | Maximum established connections per client IP; `0` means unlimited. |
| `connectionIdleTimeout` | `null\|int` | `null` (= `15`) | Seconds of silence before an idle connection is closed; `0` disables the reaper. |
| `Middlewares` | `null\|array<int,Middleware>` | `null` | Replaces the default middleware stack wholesale; `null` keeps it. |
| `Resources` | `null\|array<string,Closure>` | `null` | Extra response resources (name => factory), merged with the automatic Database/KV — explicit entries win. |
| `deferredTimeout` | `null\|int\|float` | `null` (= server default) | Seconds a deferred response may take before it is cancelled. |

The server options are the same as the node's — their full semantics are on the [HTTP Server](/manual/WPI/HTTP/HTTP_Server_CLI/) page.

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
