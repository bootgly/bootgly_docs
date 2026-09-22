# Build a contacts Web REST API

Build **Contacts**, a REST API for an address book: JSON in, JSON out, five endpoints (list, show, create, update, delete), validation with clear error messages, RFC 9457 `problem+json` errors, pagination headers and a SQLite file — seeded with three contacts so the API answers from the first request. The Web platform's **API** shell brings resource routing, the problem+json error boundary and entity transformers; you write the resource.

You will write 10 short files (about 30 minutes) and learn how a `Web\App` runs the REST middleware stack, how a migration and a seeder prepare the database, how a controller paginates, validates and throws problems, how a `Resource` shapes the JSON, and how a project is tested with `bootgly test`.

```text
$ curl -s -i http://localhost:8090/contacts | grep -E "X-Total-Count|^\{"
X-Total-Count: 3
{"items":[{"id":1,"name":"Ada Lovelace","email":"ada@example.com","phone":"+44 20 7946 0001"}, …],"page":1,"pages":1,"limit":10,"total":3}
$ curl -s -X POST http://localhost:8090/contacts -H 'Content-Type: application/json' -d '{"name":"","email":"nope"}'
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"The contact is invalid.","errors":{"name":["name is required."],"email":["email must be a valid email address."]}}
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

Create a **WPI** (web) project named `Contacts` on the **Web** platform, on port 8090. On the first run this also sets the platform up (its git submodule and the shipped examples — `Demo/Tasks` is the REST reference with JWT on top), so it takes a moment:

```bash :toolbar="true";
php bootgly projects create Contacts --platform=web --interfaces=WPI --port=8090 --yes
```

The project lands in `projects/Contacts/` as a git repository of its own (the scaffold becomes its first commit once git knows your name and e-mail) — `Contacts.Project.php` (the signature), a `router/` with a welcome route set, `schedule.php` and `tests/`. You will replace the signature and the router manifest, add a `Contacts.routes.php` route set (delete `Welcome.routes.php` if you like); the next step creates every folder in one go. Everything goes inside `projects/Contacts/`.

  </d-block-step>

  <d-block-step title="Create the folders">

Every folder the next steps write into, in one command — from here on you only create files and paste their content. Run it from the kit directory (`mkdir -p` leaves the folders the scaffold already created alone):

```bash :toolbar="true";
mkdir -p projects/Contacts/Controllers \
   projects/Contacts/Models \
   projects/Contacts/Resources \
   projects/Contacts/configs/database \
   projects/Contacts/database/migrations \
   projects/Contacts/database/seeders \
   projects/Contacts/router/routes \
   projects/Contacts/tests/project
```

  </d-block-step>

  <d-block-step title="Write the project signature">

Replace the scaffolded `Contacts.Project.php`. Its `boot` function migrates and seeds the SQLite file, then starts a `Web\App` with the **REST stack**: no CSRF (there are no browser forms) and `Problems` as the error boundary that turns any thrown `Problem` into `application/problem+json`:

**File** `projects/Contacts/Contacts.Project.php`

```php :filename="projects/Contacts/Contacts.Project.php";
<?php

use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner as Migrations;
use Bootgly\ADI\Databases\SQL\Seed\Runner as Seeds;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\BodyParser;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RequestId;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\SecureHeaders;
use Web\API\Problems;
use Web\App;
use Web\App\Configs;


return new Project(
   // # Project Metadata
   name: 'Contacts',
   description: 'Contacts — a REST API on the Web platform API shell (JSON CRUD, validation, problem+json, pagination, SQLite)',
   version: '1.0.0',
   author: 'Cookbook',
   exportable: true,

   // # Project Boot Function
   boot: function (array $arguments = [], array $options = []): void
   {
      // @ Zero-setup database — migrate + seed the SQLite file before the fork
      $file = __DIR__ . '/database/contacts.sqlite';
      $Database = new SQL(['driver' => 'sqlite', 'database' => $file]);
      new Migrations($Database, __DIR__ . '/database/migrations', "{$file}.migrations.lock")->up();
      new Seeds($Database, __DIR__ . '/database/seeders', "{$file}.seeders.lock")->run();

      // @ App shell with the REST stack: no CSRF (no browser forms),
      //   Problems as the problem+json error boundary
      $App = new App(Mode: match (true) {
         isset($options['f']) => Modes::Foreground,
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $App
         ->configure(new Configs(
            port: getenv('PORT') ? (int) getenv('PORT') : 8090,
            // ! Single worker — one SQLite file, no write contention
            workers: 1,
            Middlewares: [
               new SecureHeaders,
               new RequestId,
               new BodyParser,
               new Problems
            ]
         ))
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

  </d-block-step>

  <d-block-step title="Configure the database">

The `Database` response resource reads `configs/database/` — one SQLite connection pointing at a file inside the project:

**File** `projects/Contacts/configs/database/database.Config.php`

```php :filename="projects/Contacts/configs/database/database.Config.php";
<?php

use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;


return new Config(scope: 'database')
   ->Enabled->bind(key: 'DB_ENABLED', default: true, cast: Types::Boolean)
   ->Default->bind(key: '', default: 'sqlite')
   ->Connections
      ->SQLite
         ->Driver->bind(key: '', default: 'sqlite')
         ->Database->bind(key: 'DB_NAME', default: __DIR__ . '/../../database/contacts.sqlite')
         ->up()
      ->up();
```

  </d-block-step>

  <d-block-step title="Write the migration and the seeder">

The migration creates the table (`phone` is optional — `nullable`); the seeder upserts three contacts by id, so restarting the server never duplicates them:

**File** `projects/Contacts/database/migrations/20260921000000_create_contacts.php`

```php :filename="projects/Contacts/database/migrations/20260921000000_create_contacts.php";
<?php

use Bootgly\ADI\Databases\SQL\Builder\Expression;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;


return new Migration(
   Up: function (Migrating $Schema) {
      return $Schema->create('contacts', function (Blueprint $Table): void {
         $Table->add('id', Types::BigInteger)
            ->generate()
            ->constrain(Keys::Primary);
         $Table->add('name', Types::String)
            ->limit(80);
         $Table->add('email', Types::String)
            ->limit(120);
         $Table->add('phone', Types::String)
            ->limit(30)
            ->nullable = true;
         $Table->add('created_at', Types::Timestamp)->default = new Expression('CURRENT_TIMESTAMP');
      });
   },
   Down: function (Migrating $Schema) {
      return $Schema->drop('contacts');
   }
);
```

**File** `projects/Contacts/database/seeders/contacts.php`

```php :filename="projects/Contacts/database/seeders/contacts.php";
<?php

use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;


return new Seeder(
   Run: function (SQL $Database, Seed $Seed): array {
      return [
         $Database->table(new Identifier('contacts'))
            ->insert()
            ->set(new Identifier('id'), 1, 2, 3)
            ->set(new Identifier('name'), 'Ada Lovelace', 'Grace Hopper', 'Linus Torvalds')
            ->set(new Identifier('email'), 'ada@example.com', 'grace@example.com', 'linus@example.com')
            ->set(new Identifier('phone'), '+44 20 7946 0001', '+1 212 555 0002', null)
            ->upsert(new Identifier('id')),
      ];
   }
);
```

  </d-block-step>

  <d-block-step title="Write the model and the resource">

The **model** maps the table for the ORM — `paginate()` hydrates rows into it. The **resource** is the public shape of a contact: it types the fields and drops what the API should not expose (`created_at` here), from a model or a row array alike:

**File** `projects/Contacts/Models/Contact.php`

```php :filename="projects/Contacts/Models/Contact.php";
<?php

namespace Contacts\Models;


use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;


#[Table('contacts')]
class Contact
{
   // * Data
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';

   #[Column]
   public string $email = '';

   #[Column]
   public null|string $phone = null;

   #[Column('created_at')]
   public null|string $created = null;
}
```

**File** `projects/Contacts/Resources/Contacts.php`

```php :filename="projects/Contacts/Resources/Contacts.php";
<?php

namespace Contacts\Resources;


use function is_object;

use Web\API\Resource;


/**
 * The public shape of a contact — from a Contact model or a row array.
 */
class Contacts extends Resource
{
   public function transform (object|array $Entity): array
   {
      $read = static fn (string $field): mixed => is_object($Entity) ? $Entity->{$field} : $Entity[$field];

      // :
      return [
         'id' => (int) $read('id'),
         'name' => (string) $read('name'),
         'email' => (string) $read('email'),
         'phone' => $read('phone') === null ? null : (string) $read('phone')
      ];
   }
}
```

`namespace Contacts\Models;` and `namespace Contacts\Resources;` mirror the folders — that is how Bootgly autoloads your classes.

  </d-block-step>

  <d-block-step title="Write the controller">

Five actions, one per endpoint. `list` paginates through the core (`?page`, `?limit`, `?cursor` — the `X-Total-Count` and `Link` headers are set for you) and transforms the items; `show`, `update` and `delete` fetch the routed row or throw a `404` problem; `create` and `update` validate with the core `Validation` and throw a `422` problem carrying the error messages:

**File** `projects/Contacts/Controllers/Contacts.php`

```php :filename="projects/Contacts/Controllers/Contacts.php";
<?php

namespace Contacts\Controllers;


use function trim;

use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Contacts\Models\Contact;
use Contacts\Resources\Contacts as Resource;
use Web\API\Problem;
use Web\App\Controller;


class Contacts extends Controller
{
   public function list (Request $Request, Response $Response): Response
   {
      // @ Paginated by the core (`?page` / `?limit` / `?cursor`) — X-Total-Count
      //   and Link headers are set; items hydrate as Contact models
      $body = $Response->Database->paginate(Contact::class);

      // : Transformed items, untouched envelope
      return $Response->JSON->send(new Resource()->paginate($body));
   }

   public function show (Request $Request, Response $Response): Response
   {
      $contact = $this->find($Response);

      return $Response->JSON->send(new Resource()->transform($contact));
   }

   public function create (Request $Request, Response $Response): Response
   {
      $fields = $this->validate($Request->fields);

      $Response->Database->fetch(
         'INSERT INTO contacts (name, email, phone) VALUES ($1, $2, $3)',
         [$fields['name'], $fields['email'], $fields['phone']]
      );
      $Result = $Response->Database->fetch(
         'SELECT id, name, email, phone FROM contacts WHERE id = last_insert_rowid()'
      );

      // : 201 Created
      $Response->code(201);

      return $Response->JSON->send(new Resource()->transform($Result->row));
   }

   public function update (Request $Request, Response $Response): Response
   {
      $contact = $this->find($Response);

      // @ Partial update — fields left out keep their value
      $fields = $this->validate($Request->fields + $contact);

      $Response->Database->fetch(
         'UPDATE contacts SET name = $1, email = $2, phone = $3 WHERE id = $4',
         [$fields['name'], $fields['email'], $fields['phone'], $contact['id']]
      );

      return $Response->JSON->send(new Resource()->transform(['id' => $contact['id']] + $fields));
   }

   public function delete (Request $Request, Response $Response): Response
   {
      $contact = $this->find($Response);

      $Response->Database->fetch('DELETE FROM contacts WHERE id = $1', [$contact['id']]);

      // : 204 No Content
      return $Response(code: 204);
   }

   // ---

   /**
    * Fetch the routed contact row (`:id`) — a 404 problem when it does not exist.
    *
    * @return array<string,mixed>
    */
   private function find (Response $Response): array
   {
      $id = (int) $this->Route->Params->id;
      $Result = $Response->Database->fetch(
         'SELECT id, name, email, phone FROM contacts WHERE id = $1',
         [$id]
      );

      // ?
      if ($Result->empty === true) {
         throw new Problem(404, detail: "Contact {$id} not found.");
      }

      // :
      return $Result->row;
   }

   /**
    * Validate a contact payload — a 422 problem carrying the errors on failure.
    *
    * @param array<string,mixed> $fields
    * @return array{name:string,email:string,phone:null|string}
    */
   private function validate (array $fields): array
   {
      $name = trim((string) ($fields['name'] ?? ''));
      $email = trim((string) ($fields['email'] ?? ''));
      $phone = trim((string) ($fields['phone'] ?? ''));

      $Validation = new Validation(
         source: ['name' => $name, 'email' => $email],
         rules: [
            'name' => [new Required],
            'email' => [new Required, new Email]
         ]
      );

      // ?
      if ($Validation->valid === false) {
         throw new Problem(422, detail: 'The contact is invalid.', extensions: ['errors' => $Validation->errors]);
      }

      // :
      return ['name' => $name, 'email' => $email, 'phone' => $phone === '' ? null : $phone];
   }
}
```

A fresh controller instance is built per request; `$this->Route->Params->id` reads the matched route live.

  </d-block-step>

  <d-block-step title="Write the routes">

`Routes::map()` expands one line into the REST route set — `GET /contacts`, `POST /contacts`, `GET|PUT|PATCH|DELETE /contacts/:id` — and the fallback throws a problem too, so even an unknown path answers in `problem+json`:

**File** `projects/Contacts/router/router.index.php`

```php :filename="projects/Contacts/router/router.index.php";
<?php

return [
   'Contacts'
];
```

**File** `projects/Contacts/router/routes/Contacts.routes.php`

```php :filename="projects/Contacts/router/routes/Contacts.routes.php";
<?php

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Web\API\Problem;
use Web\API\Routes;

use Contacts\Controllers\Contacts;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   // * Contacts — GET /contacts, POST /contacts, GET|PUT|PATCH|DELETE /contacts/:id
   yield from Routes::map($Router, '/contacts', Contacts::class);

   // * Fallback — a problem+json 404 like every other error
   yield $Router->route('/*', function (Request $Request, Response $Response) {
      throw new Problem(404, detail: "No route for {$Request->method} {$Request->URI}.");
   });
};
```

  </d-block-step>

  <d-block-step title="Run it">

Start the server from the kit directory:

```bash :toolbar="true";
php bootgly project Contacts start
```

Port 8090 already taken? `PORT=8091 php bootgly project Contacts start` — the boot function reads `PORT`; use that port in the `curl` lines below too.

The server is detached, so follow its log in a second terminal — every request, and the exception report when something goes wrong (the files live in `storage/logs/`):

```bash :toolbar="true";
php bootgly project Contacts logs -f
```

Then walk the API with `curl` — list, show, create, an invalid create, a partial update, delete, and the 404 that follows:

```bash :toolbar="true";
curl -s -i http://localhost:8090/contacts | grep -E "^HTTP|X-Total-Count|^\{"
curl -s http://localhost:8090/contacts/1
curl -s -i -X POST http://localhost:8090/contacts -H 'Content-Type: application/json' -d '{"name":"Margaret Hamilton","email":"margaret@example.com"}' | grep -E "^HTTP|^\{"
curl -s -i -X POST http://localhost:8090/contacts -H 'Content-Type: application/json' -d '{"name":"","email":"nope"}' | grep -E "^HTTP|^Content-Type|^\{"
curl -s -X PATCH http://localhost:8090/contacts/4 -H 'Content-Type: application/json' -d '{"phone":"+1 617 555 0004"}'
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:8090/contacts/4
curl -s -i http://localhost:8090/contacts/4 | grep -E "^HTTP|^\{"
curl -s -i "http://localhost:8090/contacts?page=1&limit=2" | grep -E "X-Total-Count|^Link"
```

```text
HTTP/1.1 200 OK
X-Total-Count: 3
{"items":[{"id":1,"name":"Ada Lovelace","email":"ada@example.com","phone":"+44 20 7946 0001"},{"id":2,"name":"Grace Hopper","email":"grace@example.com","phone":"+1 212 555 0002"},{"id":3,"name":"Linus Torvalds","email":"linus@example.com","phone":null}],"page":1,"pages":1,"limit":10,"total":3}
{"id":1,"name":"Ada Lovelace","email":"ada@example.com","phone":"+44 20 7946 0001"}
HTTP/1.1 201 Created
{"id":4,"name":"Margaret Hamilton","email":"margaret@example.com","phone":null}
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"The contact is invalid.","errors":{"name":["name is required."],"email":["email must be a valid email address."]}}
{"id":4,"name":"Margaret Hamilton","email":"margaret@example.com","phone":"+1 617 555 0004"}
204
HTTP/1.1 404 Not Found
{"type":"about:blank","title":"Not Found","status":404,"detail":"Contact 4 not found."}
X-Total-Count: 3
Link: </contacts?limit=2&page=2>; rel="next"
```

Stop the server when you are done:

```bash :toolbar="true";
php bootgly project Contacts stop
```

  </d-block-step>

  <d-block-step title="Test it">

A project carries its own suites. Replace the scaffolded registry so it lists a `Project` suite with two tests — the signature contract and the resource transformer, a pure unit test that needs no server:

**File** `projects/Contacts/tests/autoboot.php`

```php :filename="projects/Contacts/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/project/',
   ]
);
```

**File** `projects/Contacts/tests/project/autoboot.php`

```php :filename="projects/Contacts/tests/project/autoboot.php";
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
      '1.2-resource',
   ]
);
```

**File** `projects/Contacts/tests/project/1.1-signature.Test.php`

```php :filename="projects/Contacts/tests/project/1.1-signature.Test.php";
<?php

use Bootgly\ACI\Tests\Suite\Test;
use Bootgly\API\Projects\Project;


return new Test(
   description: 'Project signature: metadata contract',
   test: function () {
      $Project = include __DIR__ . '/../../Contacts.Project.php';

      yield assert(
         assertion: $Project instanceof Project,
         description: 'the signature file returns a Project'
      );
      yield assert(
         assertion: $Project->name === 'Contacts',
         description: 'name'
      );
      yield assert(
         assertion: $Project->exportable === true,
         description: 'exportable — listed by the import picker'
      );
   }
);
```

**File** `projects/Contacts/tests/project/1.2-resource.Test.php`

```php :filename="projects/Contacts/tests/project/1.2-resource.Test.php";
<?php

use Bootgly\ACI\Tests\Suite\Test;

use Contacts\Models\Contact;
use Contacts\Resources\Contacts as Resource;


return new Test(
   description: 'Resource: the public shape of a contact',
   test: function () {
      $row = ['id' => '7', 'name' => 'Ada Lovelace', 'email' => 'ada@example.com', 'phone' => null];

      $Contact = new Contact;
      $Contact->id = 7;
      $Contact->name = 'Ada Lovelace';
      $Contact->email = 'ada@example.com';

      $expected = ['id' => 7, 'name' => 'Ada Lovelace', 'email' => 'ada@example.com', 'phone' => null];

      yield assert(
         assertion: new Resource()->transform($row) === $expected,
         description: 'a row array is typed and trimmed to the public fields'
      );
      yield assert(
         assertion: new Resource()->transform($Contact) === $expected,
         description: 'a Contact model gives the same shape'
      );
   }
);
```

Run the project's suites from inside the project directory — the launcher is two levels up, in the kit root:

```bash :toolbar="true";
cd projects/Contacts && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Next steps

- Protect the mutations with a JWT: two `Routes::map()` calls — `only: ['list', 'show']` public, `except: ['list', 'show']` behind `new Authentication($JWTStrategy)` — as the shipped `Demo/Tasks` does.
- Add a search: read `$Request->query('q')` in `list` and filter with the ORM `Repository` instead of `paginate()`'s default selection.
- Rate-limit the API with the `RateLimit` middleware and add `CORS` when a browser front end will call it.
- Move the seeded contacts to your own data: `php bootgly project Contacts seed run` and `migrate up` are the same runners the boot function uses.

## Reference

- [Web API](/manual/Web/API/overview/) — `Routes`, `Action`, `Problem`, `Problems`, `Resource`.
- [Web App](/manual/Web/App/overview/) — `App`, `Configs`, `Controller` (the API shell shares the App's controllers and configs).
- [Validation](/guide/validation/overview/) — `Validation`, the bundled validators and custom rules.
- [Database migrations](/guide/database-migrations/overview/) and [seeders](/guide/database-seeders/overview/) — `Migration`, `Blueprint`, `Seeder` and the runners.
- [Database ORM](/guide/database-orm/overview/) — models, repositories and pagination.
- [Projects](/manual/Bootgly/essential/projects/overview/) — `projects create` flags, the project signature and the autoloader namespaces.
- [Testing](/testing/about/testing/overview/) — suites, the Basic and Advanced assertion APIs and `bootgly test`.
