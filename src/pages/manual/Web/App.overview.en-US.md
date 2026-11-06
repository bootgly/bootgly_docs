# Web App

`Web\App` is the MVC application shell: an opinionated boot of the canonical `HTTP_Server_CLI` with a default middleware stack, controller dispatch, resource routing, view conventions, inline static assets and single-page app hosting.

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
   new RequestConfigs(maxBodySize: 12 * 1024 * 1024)  // 12 MB — two such bodies at once fit the default worker memory budget
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

yield $Router->route('/statics/:file*', new Statics, [GET, HEAD]);
```

Files resolve inside the project `statics/` jail: the requested name is percent-decoded once (`/statics/a%20b.png` serves `a b.png`; a `+` stays a plus sign), path-normalized and base-contained. Before 1.1 `Statics` did not decode at all, so a file stored with a literal `%XX` in its name (`a%20b.png`) is now reached as `/statics/a%2520b.png` — rename such files instead. Unknown extensions stay `application/octet-stream`. Every file is sent with `Cache-Control: public, max-age=3600` unless the constructor's `cache:` says otherwise. Registering `HEAD` beside `GET` answers `HEAD` with the same headers and no body.

A public folder never hands out server-side code or secrets — these answer `404` even when the file exists:

- dotfiles and dot-directories: `/statics/.env`, `/statics/.git/config`, encoded or not;
- PHP sources: `.php`, `.phtml`, `.pht`, `.phar` and `.php<N>`/`.phps`, in any letter case — a symlink is judged by the file it points to, so `notes.txt -> config.php` is refused too, and a symlink out of the folder answers `404` like `../`;
- names the core `File` would complete to `<name>.php` or `<name>/index.php` (`/statics/config` with a `config.php` beside it).

The one public dot-directory is `.well-known/` ([RFC 8615](https://www.rfc-editor.org/rfc/rfc8615)), as the first segment only: `/statics/.well-known/security.txt` and `/statics/.well-known/assetlinks.json` are served, while a dotfile below it (`/.well-known/.env`) and a nested `a/.well-known/` stay refused. Other server-side leftovers — `.inc` includes, `.bak` copies, editor swap files — are served like any other unknown extension: keeping them out of the public folder is the deployer's call.

`Statics` reads the whole file into memory on each request — right for stylesheets, scripts, images and fonts, wrong for video or multi-megabyte downloads (use `Response->upload()` or a CDN). Add `middlewares: [new ETag, new Compression]` for `304` revalidation and gzip; [Static Files](/manual/WPI/HTTP/HTTP_Server_CLI/#static-files) in the HTTP Server CLI manual walks through the setup and the production trade-offs.

## Single-page apps

A React, Vue or Svelte build is an `index.html` plus fingerprinted assets, and the browser-side router owns the paths: a reload on `/settings/profile` must answer the `index.html`, while `/assets/index-4f9a2c1e.js` must answer the script. `SPA` does both — the history-API fallback — from one catch-all route.

### Serve a build with history routing

Copy the build output (Vite's `dist/`) into the project's `statics/` folder:

```text
projects/Shop/
├── router/
│   ├── router.index.php
│   └── routes/Shop.routes.php
└── statics/
    ├── index.html
    ├── favicon.svg
    └── assets/
        ├── index-4f9a2c1e.js
        └── index-7b3d8e05.css
```

Register the API first and the SPA last, on the root and on a catch-all:

```php
<?php

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\ETag;
use Web\App\SPA;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   // * API
   yield $Router->route('/api/health', function (Request $Request, Response $Response) {
      return $Response->JSON->send(['status' => 'ok']);
   }, GET);

   // * Interface — every other path
   $SPA = new SPA(excludes: ['api']);

   yield $Router->route('/', $SPA, [GET, HEAD], middlewares: [new ETag]);
   yield $Router->route('/:file*', $SPA, [GET, HEAD], middlewares: [new ETag]);
};
```

What each request gets:

| Request | Answer | `Cache-Control` |
|---|---|---|
| `/`, `/settings/profile` (no extension) | `200`, the `index.html` | `no-cache` |
| `/assets/index-4f9a2c1e.js` | `200`, the file | `public, max-age=31536000, immutable` |
| `/favicon.svg` | `200`, the file | `public, max-age=3600` |
| `/assets/missing.js` (an extension, no file) | `404` | — |
| `/api/unknown` (an excluded first segment) | `404` | — |
| `/.env`, `/.git/config`, `/index.php` | `404` | — |
| `/LICENSE` (no extension, a regular file of the build) | `200`, the file | `public, max-age=3600` |
| `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association` | `200`, the file | `public, max-age=3600` |
| `/.well-known/missing` | `404` | — |
| a client route while `statics/index.html` is missing | `503`, `Service Unavailable` | `no-store` |

A name with an extension is a file; so is a name under `.well-known/` and an extension-less name that is a regular file of the build (`LICENSE`, `.well-known/apple-app-site-association`). Any other name without an extension is a client route — so keep dots out of the last segment of your client routes (`/users/jane.doe` is looked up as a file and answers `404`), and do not name a client route after a file the build ships. The fallback is for routes only, so a bot probing `/wp-login.php` or `/.env` gets `404`, not `200` with your HTML, and an unmatched `/api/...` call gets `404` instead of a page its client cannot parse. Files resolve exactly as in `Statics` (one shared `Files` routine): the same jail, decoding, media types and refusals.

### Revalidate with ETag

`ETag` on the SPA routes tags every answer — the `index.html` included — and answers `304` with an empty body when the browser sends the tag back in `If-None-Match`. The `no-cache` on the index makes the browser revalidate it on every visit, so a new deploy is picked up at once while unchanged visits cost a `304`:

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8
Cache-Control: no-cache
ETag: W/"5b49ea7eb15657d8"

HTTP/1.1 304 Not Modified
ETag: W/"5b49ea7eb15657d8"
```

The same middleware works on a `Statics` route: `middlewares: [new ETag]`.

### Robots, favicons and the API prefix

```php
$SPA = new SPA(
   excludes: ['api', 'auth'],
   robots: "User-agent: *\nDisallow: /\n",
   aliases: ['favicon.ico' => 'favicon.svg']
);
```

- `excludes` — first path segments that never receive the index: exact, case-sensitive matches (`'api'` excludes `/api/x`, not `/API/x` nor `/apis/x`).
- `robots` — the `/robots.txt` body, answered from the configuration (handy to keep a staging deploy out of search engines); `null` serves the build's own `robots.txt`.
- `aliases` — names browsers request on their own, mapped to the file the build ships.

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

Extends `HTTP_Server_CLI\Configs`: every server option but the worker memory budget (`maxWorkerPendingBytes` — set `TCP_Server_CLI::$maxWorkerPendingBytes` before `start()` until the App forwards it), with the Web platform defaults filled in (`host`, `port` and `workers` fall back instead of being required), plus the three shell concerns. Named arguments only — the first slot is the `Bootgly\ABI\Argument` guard, so a positional call raises a `TypeError`. Throws `InvalidArgumentException` at `new` when both `secure` and `AutoTLS` are given, on a `Middlewares` entry that is not a `Middleware`, or on a `Resources` value that is not a Closure keyed by name.

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

### Web\App\Files

The file routine `SPA` and `Statics` share. Use it directly to serve files from a handler of your own.

```php
public function __construct (string $path = 'statics')
```

Jails every name under the project directory `path` (relative to the project root).

```php
public function resolve (string $file): null|string
```

Turns a requested name — the catch-all route param exactly as the router hands it, still percent-encoded — into a clean name relative to the jail: decoded once (`rawurldecode()`: `+` stays a plus sign), separators unified, `.`/`..` collapsed. Returns `null` for an empty name, a null byte, an absolute path, a name that normalizes to the jail itself (`./`, `a/../`) or any dotfile segment of the normalized name — except a first `.well-known` segment (RFC 8615).

```php
public function serve (string $file, Response $Response, string $cache): false|Response
```

Sends one resolved name inline with the media type of its real target's extension (a symlink is typed and judged by the file it points to) and the given `Cache-Control`, reading the whole file into memory. The name is not decoded again. Returns `false`, writing nothing, when the file is a PHP source (`.php`, `.php<N>`, `.phps`, `.phtml`, `.pht`, `.phar`), missing, a directory, unreadable or outside the jail — the core `File` conversion to `<name>.php` / `<name>/index.php` is disabled.

```php
public string $base
```

The absolute jail directory (the project path plus `path`), with a trailing slash. Read-only.

```php
public const array TYPES
```

Media type by lowercase extension (26 entries: CSS, JavaScript, JSON and source maps, HTML, SVG, the web manifest and the usual image, font, video, PDF and WebAssembly formats). Text types carry `charset=UTF-8`; JSON does not (RFC 8259 defines no charset parameter). An extension not listed is sent as `application/octet-stream`.

### Web\App\SPA

```php
public function __construct (
   string $path = 'statics',
   string $index = 'index.html',
   string $param = 'file',
   array $excludes = [],
   string $immutable = 'assets/',
   string $cache = 'public, max-age=3600',
   null|string $robots = null,
   array $aliases = []
)
```

Invokable single-page-app handler for the root route and a catch-all param route (`/:file*`). Serves the files of the build through `Files` — a name with an extension, a name under `.well-known/` or an extension-less regular file of the build — and answers the index to every other path. `$SPA->path` reads the jail of its `Files`.

```php
string $path = 'statics'
```

Project directory (relative to the project root) holding the build.

```php
string $index = 'index.html'
```

The document every client route falls back to, sent with `Cache-Control: no-cache` — also when requested by name. Missing, it makes every fallback answer `503` with the neutral body `Service Unavailable` and `Cache-Control: no-store`.

```php
string $param = 'file'
```

Route param carrying the requested path; empty on the root route.

```php
array $excludes = []
```

First path segments (`['api']`) answered `404`, never the index. Exact, case-sensitive matches of the first segment, compared after decoding and normalization: `/%61pi/x` and `/./api/x` are excluded too, `/API/x` and `/apis/x` are not.

```php
string $immutable = 'assets/'
```

Path prefix of fingerprinted build output, sent with `Cache-Control: public, max-age=31536000, immutable`. `''` disables it.

```php
string $cache = 'public, max-age=3600'
```

`Cache-Control` of every other served file.

```php
null|string $robots = null
```

Body of `/robots.txt`, sent as `text/plain; charset=UTF-8` with `Cache-Control: public, max-age=86400`. `null` serves the build's own file.

```php
array $aliases = []
```

Requested name => served name (`['favicon.ico' => 'favicon.svg']`); the served file keeps its own media type.

### Web\App\Statics

```php
public function __construct (string $path = 'statics', string $param = 'file', string $cache = 'public, max-age=3600')
```

Invokable static-file handler for a catch-all param route (`/statics/:file*`). Serves through `Files` — inline, with the media type mapped from the file extension and the given `Cache-Control` — and answers `404` to a refused, missing or PHP-source name. `$Statics->path` reads the jail of its `Files`. The requested name is percent-decoded once (new in 1.1).

### Web\App\Views

```php
public function share (array $variables): self
```

Merges variables exported to every render (later values win).

```php
public function apply (Response $Response): void
```

Applies the layout + shared exports onto the Response View resource — called by `App->start()` on the first-request drain of each worker.
