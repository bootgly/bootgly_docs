# Guestbook

Build **Guestbook**, a small web app where visitors sign a book: a form and the list of entries on one page, stored in SQLite, protected by CSRF, wrapped in a layout with its own stylesheet. The Web platform's **App** shell brings the HTTP server, the middleware stack (secure headers, request ids, body parsing, CSRF), sessions, controllers, views and static files; you write the app.

You will write 11 short files (about 30 minutes) and learn how a `Web\App` boots, how a migration creates the database, how a controller lists and creates records, how views and layouts render, how the CSRF token travels through a form and how a project is tested with `bootgly test`.

```text
$ curl -s -c cookies.txt http://localhost:8080/entries -o page.html
$ curl -s -b cookies.txt -i -X POST http://localhost:8080/entries \
     --data-urlencode "_token=$token" --data-urlencode "name=Ada" --data-urlencode "message=Hello from curl!" | head -1
HTTP/1.1 303 See Other
$ curl -s -b cookies.txt http://localhost:8080/entries | grep -E "flash|Hello"
<p class="flash">Thanks, Ada! Your message is in the book.</p>
   <p>Hello from curl!</p>
```

<d-block-stepper>
  <d-block-step title="Install Bootgly">

One command installs everything on Linux (or WSL2): it checks for **git** and **PHP 8.4+** (with the extensions Bootgly's built-ins use — the SQLite driver among them), offers to install what is missing through your package manager and clones the Bootgly Kit into `./bootgly.kit`. `--no-wizard` skips the interactive project wizard — the next step creates the project with an explicit command instead.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash -s -- --no-wizard
cd bootgly.kit
```

> [!TIP]
> The installer also asks whether to install the `bootgly` command globally — either answer is fine, every page here uses `php bootgly …`. Already have a kit? The installer resumes the one it finds at `./bootgly.kit` and offers to move it to the current release — accept it, these pages assume 1.0.2 or newer — then `cd` into it and go to the next step. Every command below runs from the kit directory as `php bootgly …` — if you installed the CLI globally (`php bootgly setup`), `bootgly …` works too. The [Getting started](/guide/getting-started/overview/) guide explains the installer and the kit layout.

  </d-block-step>

  <d-block-step title="Create the project">

Create a **WPI** (web) project named `Guestbook` on the **Web** platform, on port 8080. On the first run this also sets the platform up (its git submodule and the shipped examples — Blog, Site, Tasks, Chat and Auth are worth a look later), so it takes a moment:

```bash :toolbar="true";
php bootgly projects create Guestbook --platform=web --interfaces=WPI --port=8080 --yes
```

The project lands in `projects/Guestbook/` as a git repository of its own (the scaffold becomes its first commit once git knows your name and e-mail):

```text
projects/Guestbook/
├── Guestbook.Project.php     ← the project signature: metadata + the boot function
├── .gitignore
├── router/
│   ├── router.index.php      ← which route sets are active
│   └── routes/
│       └── Welcome.routes.php
├── schedule.php
└── tests/
    ├── autoboot.php          ← the project's test registry
    └── example/              ← an example suite (de-registered in the last step; delete it when you like)
```

You will replace the signature and the router manifest, add a `Guestbook.routes.php` route set (delete `Welcome.routes.php` if you like) and create the `configs/`, `database/`, `Controllers/`, `views/` and `statics/` folders. Everything goes inside `projects/Guestbook/`.

  </d-block-step>

  <d-block-step title="Write the project signature">

Replace the scaffolded `Guestbook.Project.php`. Its `boot` function runs the migrations on the SQLite file and starts a `Web\App` — the default middleware stack (`SecureHeaders`, `RequestId`, `BodyParser`, `CSRF`) and the `Database` response resource come with it:

**File** `projects/Guestbook/Guestbook.Project.php`

```php :filename="projects/Guestbook/Guestbook.Project.php";
<?php

use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner as Migrations;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Web\App;
use Web\App\Configs;


return new Project(
   // # Project Metadata
   name: 'Guestbook',
   description: 'Guestbook — a form and a list on the Web platform App shell (SQLite, CSRF, views)',
   version: '1.0.0',
   author: 'Cookbook',
   exportable: true,

   // # Project Boot Function
   boot: function (array $arguments = [], array $options = []): void
   {
      // @ Zero-setup database — create the SQLite file and run the migrations before the fork
      $file = __DIR__ . '/database/guestbook.sqlite';
      $Database = new SQL(['driver' => 'sqlite', 'database' => $file]);
      new Migrations($Database, __DIR__ . '/database/migrations', "{$file}.migrations.lock")->up();

      // @ App shell — the default middleware stack (SecureHeaders, RequestId,
      //   BodyParser, CSRF); the Database resource comes from configs/database/
      $App = new App(Mode: match (true) {
         isset($options['f']) => Modes::Foreground,
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $App
         ->configure(new Configs(
            port: getenv('PORT') ? (int) getenv('PORT') : 8080,
            // ! Single worker — one SQLite file, no write contention
            workers: 1
         ))
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

`Modes::Daemon` detaches the server from your terminal (`php bootgly project Guestbook stop` stops it); `-f` keeps it in the foreground with the logs in front of you.

  </d-block-step>

  <d-block-step title="Configure the database">

The `Database` response resource reads `configs/database/` — one SQLite connection pointing at a file inside the project:

**File** `projects/Guestbook/configs/database/database.Config.php`

```php :filename="projects/Guestbook/configs/database/database.Config.php";
<?php

use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;


return new Config(scope: 'database')
   ->Enabled->bind(key: 'DB_ENABLED', default: true, cast: Types::Boolean)
   ->Default->bind(key: '', default: 'sqlite')
   ->Connections
      ->SQLite
         ->Driver->bind(key: '', default: 'sqlite')
         ->Database->bind(key: 'DB_NAME', default: __DIR__ . '/../../database/guestbook.sqlite')
         ->up()
      ->up();
```

  </d-block-step>

  <d-block-step title="Write the migration">

Migrations live in `database/migrations/` and are run by the boot function before the server forks, so the table always exists when the first request lands:

**File** `projects/Guestbook/database/migrations/20260921000000_create_entries.php`

```php :filename="projects/Guestbook/database/migrations/20260921000000_create_entries.php";
<?php

use Bootgly\ADI\Databases\SQL\Builder\Expression;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;


return new Migration(
   Up: function (Migrating $Schema) {
      return $Schema->create('entries', function (Blueprint $Table): void {
         $Table->add('id', Types::BigInteger)
            ->generate()
            ->constrain(Keys::Primary);
         $Table->add('name', Types::String)
            ->limit(40);
         $Table->add('message', Types::Text);
         $Table->add('created_at', Types::Timestamp)->default = new Expression('CURRENT_TIMESTAMP');
      });
   },
   Down: function (Migrating $Schema) {
      return $Schema->drop('entries');
   }
);
```

  </d-block-step>

  <d-block-step title="Write the controller">

A controller is a plural noun; its actions are single-word verbs receiving `(Request, Response)`. `list` renders the page with the entries, the flash message and a masked CSRF token for the form; `create` validates the POST, inserts the row, flashes a message and redirects with `303 See Other`. A fresh controller instance is built per request, so nothing survives between visitors:

**File** `projects/Guestbook/Controllers/Entries.php`

```php :filename="projects/Guestbook/Controllers/Entries.php";
<?php

namespace Guestbook\Controllers;


use function mb_strlen;
use function trim;

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CSRF;
use Web\App\Controller;


class Entries extends Controller
{
   public function list (Request $Request, Response $Response): Response
   {
      // @ Newest first — the Database resource runs the query on the project's SQLite file
      $Result = $Response->Database->fetch(
         'SELECT id, name, message, created_at FROM entries ORDER BY id DESC LIMIT 50'
      );

      return $this->render('entries/list', [
         'entries' => $Result->rows,
         'flash' => $Request->Session->pull('flash'),
         // ! Per-render masked CSRF token for the form (BREACH mitigation)
         'token' => CSRF::mask((string) $Request->Session->get('_csrf_token', ''))
      ]);
   }

   public function create (Request $Request, Response $Response): Response
   {
      // ?: GET — the form lives on the list page
      if ($Request->method === 'GET') {
         return $this->redirect('/entries', 303);
      }

      // @ POST — validate, persist, flash, redirect
      $name = trim((string) ($Request->fields['name'] ?? ''));
      $message = trim((string) ($Request->fields['message'] ?? ''));

      // ?
      if ($name === '' || mb_strlen($name) > 40 || $message === '' || mb_strlen($message) > 280) {
         $Request->Session->set('flash', 'A name (up to 40 characters) and a message (up to 280) are required.');

         return $this->redirect('/entries', 303);
      }

      $Response->Database->fetch(
         'INSERT INTO entries (name, message) VALUES ($1, $2)',
         [$name, $message]
      );
      $Request->Session->set('flash', "Thanks, {$name}! Your message is in the book.");

      // : POST → 303 See Other
      return $this->redirect('/entries', 303);
   }
}
```

`namespace Guestbook\Controllers;` mirrors the folder — that is how Bootgly autoloads your classes.

  </d-block-step>

  <d-block-step title="Write the routes">

The router manifest names the active route sets; each set is a file yielding routes. `Controllers::map()` expands one line into the resource routes — filtered here to `list` (`GET /entries`) and `create` (`GET /entries/create`, `POST /entries`) — and `Statics` serves the stylesheet inline with the right media type:

**File** `projects/Guestbook/router/router.index.php`

```php :filename="projects/Guestbook/router/router.index.php";
<?php

return [
   'Guestbook'
];
```

**File** `projects/Guestbook/router/routes/Guestbook.routes.php`

```php :filename="projects/Guestbook/router/routes/Guestbook.routes.php";
<?php

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Web\App\Controllers;
use Web\App\Statics;

use Guestbook\Controllers\Entries;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   // * Entries — GET /entries (list), GET /entries/create and POST /entries (create)
   yield from Controllers::map($Router, '/entries', Entries::class, only: ['list', 'create']);

   // * Commons
   yield $Router->route('/', function (Request $Request, Response $Response) {
      return $Response->redirect('/entries', 307);
   }, GET);

   yield $Router->route('/statics/:file*', new Statics, GET);

   // * Fallback
   yield $Router->route('/*', function (Request $Request, Response $Response) {
      $Response->View->render('errors/404');

      return $Response->code(404);
   }, GET);
};
```

  </d-block-step>

  <d-block-step title="Write the views and the stylesheet">

Views are PHP templates in `views/`; `views/layouts/main.template.php` wraps every render and `@yield content;` is where the view goes. The page view holds the form (with the hidden `_token` the CSRF middleware checks) and the entries:

**File** `projects/Guestbook/views/layouts/main.template.php`

```php :filename="projects/Guestbook/views/layouts/main.template.php";
<!DOCTYPE html>
<html lang="en">
<head>
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <title>Guestbook</title>
   <link rel="stylesheet" href="/statics/guestbook.css">
</head>
<body>
   <header>
      <strong>Guestbook</strong>
      <nav><a href="/entries">Entries</a></nav>
   </header>
   <main>
      @yield content;
   </main>
   <footer>Powered by the Bootgly Web platform</footer>
</body>
</html>
```

**File** `projects/Guestbook/views/entries/list.template.php`

```php :filename="projects/Guestbook/views/entries/list.template.php";
<h1>Sign the book</h1>

<?php if ($flash !== null): ?>
<p class="flash"><?= htmlspecialchars((string) $flash) ?></p>
<?php endif; ?>

<form method="post" action="/entries">
   <input type="hidden" name="_token" value="<?= htmlspecialchars((string) $token) ?>">
   <label>
      Name
      <input type="text" name="name" maxlength="40" required>
   </label>
   <label>
      Message
      <textarea name="message" rows="4" maxlength="280" required></textarea>
   </label>
   <button type="submit">Sign</button>
</form>

<h2><?= count($entries) ?> entries</h2>

<?php foreach ($entries as $entry): ?>
<article>
   <p><?= htmlspecialchars($entry['message']) ?></p>
   <footer>— <strong><?= htmlspecialchars($entry['name']) ?></strong>, <?= htmlspecialchars($entry['created_at']) ?></footer>
</article>
<?php endforeach; ?>

<?php if ($entries === []): ?>
<p class="empty">Nobody has signed yet — be the first!</p>
<?php endif; ?>
```

**File** `projects/Guestbook/views/errors/404.template.php`

```php :filename="projects/Guestbook/views/errors/404.template.php";
<h1>404</h1>
<p>There is nothing here. <a href="/entries">Back to the book</a>.</p>
```

**File** `projects/Guestbook/statics/guestbook.css`

```css :filename="projects/Guestbook/statics/guestbook.css";
:root {
   color-scheme: light dark;
   --accent: #2563eb;
}

body {
   font: 16px/1.6 system-ui, sans-serif;
   max-width: 40rem;
   margin: 0 auto;
   padding: 1rem;
}

header {
   display: flex;
   justify-content: space-between;
   align-items: center;
   padding-bottom: .75rem;
   border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
}

nav a {
   color: var(--accent);
   text-decoration: none;
}

main {
   min-height: 60vh;
   padding: 2rem 0;
}

form {
   display: grid;
   gap: .75rem;
   margin-bottom: 2rem;
}

label {
   display: grid;
   gap: .25rem;
}

input, textarea {
   font: inherit;
   padding: .5rem;
}

button {
   justify-self: start;
   padding: .5rem 1.25rem;
   background: var(--accent);
   color: white;
   border: 0;
   border-radius: .25rem;
   cursor: pointer;
}

article {
   padding: 1rem 0;
   border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent);
}

article footer {
   font-size: .9rem;
   opacity: .75;
}

.flash {
   padding: .75rem 1rem;
   border-left: 4px solid var(--accent);
   background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.empty {
   opacity: .75;
}
```

  </d-block-step>

  <d-block-step title="Run it">

Start the server from the kit directory and open <http://localhost:8080> — sign the book, watch the flash message and your entry at the top of the list:

```bash :toolbar="true";
php bootgly project Guestbook start
```

Port 8080 already taken? `PORT=8081 php bootgly project Guestbook start` — the boot function reads `PORT`; use that port in the `curl` lines below too.

The server is detached, so follow its log in a second terminal — every request, and the exception report when something goes wrong (the files live in `storage/logs/`):

```bash :toolbar="true";
php bootgly project Guestbook logs -f
```

From a terminal, the same flow takes three requests — the session cookie and the masked token from the form are what let the POST through the CSRF middleware:

```bash :toolbar="true";
curl -s -c cookies.txt http://localhost:8080/entries -o page.html
token=$(grep -o 'name="_token" value="[^"]*"' page.html | cut -d'"' -f4)
curl -s -b cookies.txt -i -X POST http://localhost:8080/entries --data-urlencode "_token=$token" --data-urlencode "name=Ada" --data-urlencode "message=Hello from curl!" | head -1
curl -s -b cookies.txt http://localhost:8080/entries | grep -c "Hello from curl!"
```

A POST without the token is refused with `403`, an empty name or message comes back with the error flash, and an unknown path renders the 404 view. Stop the server when you are done:

```bash :toolbar="true";
php bootgly project Guestbook stop
```

  </d-block-step>

  <d-block-step title="Test it">

A project carries its own suites. Replace the scaffolded registry so it lists a `Project` suite with two tests — the signature contract and the router/migration files:

**File** `projects/Guestbook/tests/autoboot.php`

```php :filename="projects/Guestbook/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/project/',
   ]
);
```

**File** `projects/Guestbook/tests/project/autoboot.php`

```php :filename="projects/Guestbook/tests/project/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suite;


return new Suite(
   // * Config
   autoBoot: __DIR__,
   autoInstance: true,
   autoReport: true,
   autoSummarize: true,
   exitOnFailure: true,
   // * Data
   suiteName: 'Project',
   tests: [
      '1.1-signature',
      '1.2-router',
   ]
);
```

**File** `projects/Guestbook/tests/project/1.1-signature.Test.php`

```php :filename="projects/Guestbook/tests/project/1.1-signature.Test.php";
<?php

use Bootgly\ACI\Tests\Suite\Test;
use Bootgly\API\Projects\Project;


return new Test(
   description: 'Project signature: metadata contract',
   test: function () {
      $Project = include __DIR__ . '/../../Guestbook.Project.php';

      yield assert(
         assertion: $Project instanceof Project,
         description: 'the signature file returns a Project'
      );
      yield assert(
         assertion: $Project->name === 'Guestbook',
         description: 'name'
      );
      yield assert(
         assertion: $Project->exportable === true,
         description: 'exportable — listed by the import picker'
      );
   }
);
```

**File** `projects/Guestbook/tests/project/1.2-router.Test.php`

```php :filename="projects/Guestbook/tests/project/1.2-router.Test.php";
<?php

use Bootgly\ACI\Tests\Suite\Test;
use Bootgly\ADI\Databases\SQL\Schema\Migration;


return new Test(
   description: 'Router manifest and migration',
   test: function () {
      $routes = include __DIR__ . '/../../router/router.index.php';
      $Migration = include __DIR__ . '/../../database/migrations/20260921000000_create_entries.php';

      yield assert(
         assertion: $routes === ['Guestbook'],
         description: 'the manifest lists the Guestbook route set'
      );
      yield assert(
         assertion: (include __DIR__ . '/../../router/routes/Guestbook.routes.php') instanceof Closure,
         description: 'the route set is a Closure'
      );
      yield assert(
         assertion: $Migration instanceof Migration,
         description: 'the entries migration returns a Migration'
      );
   }
);
```

Run the project's suites from inside the project directory — the launcher is two levels up, in the kit root:

```bash :toolbar="true";
cd projects/Guestbook && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Next steps

- Paginate the book: `$Response->Database->paginate(Entry::class)` with an ORM model reads `?page`/`?limit` and sets the `X-Total-Count`/`Link` headers — the [Contacts](/cookbook/web/contacts/overview/) API does exactly that.
- Let authors delete their own entries: `Controllers::map()` also maps `edit`, `update` and `delete`; keep the entry ids in the session.
- Seed a few entries at boot with a `database/seeders/` file and the `Seed\Runner`, as the shipped `Demo/Blog` does.
- Go HTTPS: hand an `AutoTLS` to the `Configs` and the server obtains a Let's Encrypt certificate on its own.

## Reference

- [Web App](/manual/Web/App/overview/) — `App`, `Configs`, `Controller`, `Controllers`, `Statics`, `Views`.
- [Router](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/) — route sets, parameters, the middlewares (CSRF among them).
- [Database migrations](/guide/database-migrations/overview/) — `Migration`, `Blueprint`, types and the runner.
- [Templates](/guide/templates/overview/) — `@yield`, `@include`, layouts and partials.
- [Projects](/manual/Bootgly/essential/projects/overview/) — `projects create` flags, the project signature and the autoloader namespaces.
- [Testing](/testing/about/testing/overview/) — suites, the Basic and Advanced assertion APIs and `bootgly test`.
