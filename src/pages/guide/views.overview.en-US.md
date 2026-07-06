# Views

On the Web side, a **view** is a project template rendered into an HTTP response. Views are
files of the same engine described in [Templates](/templates) — `.template.php` files living
under your project `views/` directory — reached through the `View` response resource. On top of
plain rendering, the Web layer adds a **default layout** and **content negotiation**: one
payload served as JSON, XML or HTML depending on the request `Accept` header.

> [!NOTE]
> Everything in [Templates](/templates) (`@extends`, `@section`, `@yield`, `@include`,
> `@component`, `@>>`, verbatim, the compilation cache and template-line error reporting)
> applies to `views/*.template.php` unchanged. This page is the Web-side wiring around it.

## Render your first view

`render()` compiles and renders a view into the response body; chain `send()` to flush it:

```php
$Response->View->render('home')->send();
```

The name resolves to `views/home.template.php`. Pass data as the second argument — it becomes
local variables in the template:

```php
$Response->View->render('users/show', [
   'name' => 'Ada',
   'role' => 'admin'
])->send();
```

`send()` is shorthand for the common case — render one view and flush it:

```php
$Response->View->send('users/show', ['name' => 'Ada']);
```

The current route is always available inside the view as `$Route`.

## Sharing data across views

`export()` registers variables once, then every later `render()` on the same response sees
them — useful for layout/partial data (site name, the signed-in user, a nav tree):

```php
$Response->View
   ->export(['site' => 'Bootgly', 'User' => $User])
   ->render('dashboard', ['stats' => $stats])
   ->send();
```

Per-render data wins over exported data on a key clash.

## Layouts

Views compose through the engine's `@extends`/`@section`/`@yield` — a layout declares the
holes, a view fills them. The conventional home for shared templates:

```text
views/
├── layouts/
│   └── app.template.php
├── partials/
│   └── nav.template.php
└── dashboard.template.php
```

`views/layouts/app.template.php`:

```text
<!doctype html>
<title>@yield title;</title>
<body>
   @include partials/nav;
   @yield content;
</body>
```

### Default layout

Set a **default layout** and any view that does not declare its own `@extends` is wrapped in
it automatically — the view's whole output becomes the layout's `content` section:

```php
$Response->View->layout = 'layouts/app';

// dashboard.template.php has no @extends — it is wrapped in layouts/app
$Response->View->render('dashboard', ['stats' => $stats])->send();
```

> [!WARNING]
> The `View` resource is **persistent per worker**: `layout` survives across requests. Treat
> it as an application default — set it once at startup, not conditionally inside one route
> (that would leak to every later request on the worker). For per-route choices, use the
> per-render `layout:` argument below.

The default is opt-in (empty by default). Rules:

- A view with its own `@extends` ignores the default — explicit inheritance always wins.
- A view that declares `@section content:` fills `content` itself; only a view's *loose*
  output falls back into `content`.
- Override per render with the `layout:` argument — a name picks another layout, `false`
  renders bare:

```php
$Response->View->render('report', $data, layout: 'layouts/print')->send();
$Response->View->render('fragment', $data, layout: false)->send(); // no layout
```

## Content negotiation

The `Negotiation` resource serves **one payload** in the representation the client asked for.
It reads the request `Accept` header (already parsed, q-sorted, by `Request::negotiate()`) and
picks among the offers — `application/json` and `application/xml` always, plus `text/html`
when you pass a `view`:

```php
$Response->Negotiation->send(
   ['id' => 7, 'name' => 'Ada'], // the single payload
   view: 'users/show'            // used only if HTML is selected
);
```

Same route, three clients:

```text
Accept: application/json  →  {"id":7,"name":"Ada"}
Accept: application/xml   →  <?xml version="1.0" encoding="UTF-8"?><response><id>7</id><name>Ada</name></response>
Accept: text/html         →  users/show rendered with ['id' => 7, 'name' => 'Ada']
```

For the HTML branch the payload becomes the view's data, so the array does double duty. Omit
`view` for an API-only endpoint (JSON/XML only).

Selection details:

- The most-preferred acceptable offer wins; `*/*`, `*` and `type/*` wildcards are honored.
  Types refused with `q=0` are never served (RFC 9110).
- **No `Accept` header** → JSON (the default representation) — keeps curl and health checks
  working.
- **`Accept` present but unsatisfiable** (e.g. `image/png`, everything refused with `q=0`, or
  `text/html` with no `view`) → `406 Not Acceptable`.
- Every negotiated response — the `406` included — carries `Vary: Accept`, so shared caches
  store each representation separately.

## XML representation

The `XML` resource is a dependency-free array→XML encoder (you can also use it directly via
`$Response->XML->send($data)`). The mapping:

- Root element `<response>`.
- Associative keys become elements; numeric/list keys become `<item>`.
- Scalars are text (XML-escaped); booleans render `true`/`false`; `null` is an empty element.
- Objects expose **only their public properties** (`json_encode` parity — private/protected
  state never reaches the output).
- Nesting past 64 levels truncates to an empty element, so reference cycles cannot crash the
  encoder.
- Keys are sanitized to valid XML names (invalid characters → `_`, a leading digit is
  prefixed with `_`).
- A non-empty string payload is treated as already-encoded XML and passed through untouched.

```php
$Response->XML->send(['tags' => ['php', 'web'], 'active' => true]);
// <?xml version="1.0" encoding="UTF-8"?><response><tags><item>php</item><item>web</item></tags><active>true</active></response>
```

## Security: the view whitelist

View names are validated at the sink before any file resolution — `render()` is
include-based, so a traversal would be remote code execution, not mere disclosure. Empty
names, null bytes, absolute paths and any character outside `[A-Za-z0-9_/-]` are rejected with
`403`, then the name is normalized and jailed (realpath-contained) to the `views/` directory:

```php
$Response->View->render('../../../etc/passwd')->send(); // 403 Forbidden
```

Keep view names static or drawn from a fixed allowlist — never interpolate raw user input into
a view name.

## Reference

```php
public function render (string $view, null|array $data = null, null|Closure $callback = null, null|string|false $layout = null): Response
```

Renders `views/{$view}.template.php` into the response body (not yet sent) and returns the
`Response`. `$data` is extracted as template variables; `$callback($content, $Throwable)` runs
after rendering. `$layout` overrides the default: `null` uses the configured default, a name
selects that layout, `false`/`''` renders bare. Invalid names return `403`; render failures are
reported and yield an empty body.

```php
public function send (mixed $view = null, null|array $data = null, null|Closure $callback = null): Response
```

Renders and flushes in one call. A non-string `$view` returns `403`. For a layout override,
use `render(..., layout: ...)->send()`.

```php
public function export (array ...$variables): static
```

Registers variables shared with every later `render()` on this response; returns `$this` for
chaining. Per-render data wins on a key clash.

```php
public string $layout = '';
```

Default layout applied to views without their own `@extends`. Empty disables it. The `View`
resource is persistent, so the value lives for the whole worker — set it at startup and use
the `layout:` render argument for per-route overrides.

```php
public function send (mixed $payload = null, null|string $view = null): Response
```

`Negotiation` — serves `$payload` as JSON, XML or HTML based on the request `Accept` header.
`view` is the template used when HTML is selected (and enables HTML as an offer). No `Accept`
defaults to JSON; an unsatisfiable `Accept` returns `406`.

```php
public static function choose (array $accepted, array $offers): null|string
```

`Negotiation` — the pure matcher: given the client's q-sorted media types and the server's
offers, returns the first offer that satisfies a preference (honoring `*/*`, `*`, `type/*`), or
`null` when none match.

```php
public function send (mixed $body = null): Response
```

`XML` — sets `Content-Type: application/xml` and sends `$body` encoded as XML (a non-empty
string is treated as pre-encoded and passed through).
