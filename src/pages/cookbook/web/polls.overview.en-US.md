# Build a Web App on PostgreSQL

Build **Polls**, a small voting app on PostgreSQL: anyone asks a question with two or three options, everyone votes once per poll — and can change their mind, because the vote is an **upsert** on a unique index — and the results show live counts. The poll and its options are written in one transaction with `RETURNING`, the timestamps are `TIMESTAMPTZ`, the models load their relations through the ORM. PostgreSQL runs in a container you start with one command; Bootgly talks to it natively, no PHP extension involved. The Web platform's **App** shell brings the HTTP server, the middleware stack (secure headers, request ids, body parsing, CSRF), sessions, controllers, views and static files; you write the app.

You will write 20 short files (about 45 minutes) and learn how a `Web\App` connects to PostgreSQL, how a migration declares foreign keys and a composite unique index, how a seeder keeps identity sequences honest, how ORM models and relations work, how `transact()` and `RETURNING` fit together, how one `INSERT … ON CONFLICT` replaces a read-then-write, and how a project is tested with `bootgly test`.

```text
$ curl -s -b cookies.txt -c cookies.txt -i -X POST http://localhost:8082/polls/3/vote \
     --data-urlencode "_token=$token" --data-urlencode "option=8" | grep -E "^HTTP|^Location"
HTTP/1.1 303 See Other
Location: /polls/3
$ curl -s -b cookies.txt http://localhost:8082/polls/3 | grep -E "flash|checked|<h2|count"
<p class="flash">Your vote counts — you can change it any time.</p>
      <input type="radio" name="option" value="8" checked required>
<h2>1 vote(s)</h2>
   <span class="count">0 (0%)</span>
   <span class="count">1 (100%)</span>
```

<d-block-stepper>
  <d-block-step title="Install Bootgly">

One command installs everything on Linux (or WSL2): it checks for **git** and **PHP 8.4+** (with the extensions Bootgly's built-ins use), offers to install what is missing through your package manager and clones the Bootgly Kit into `./bootgly.kit`. `--no-wizard` skips the interactive project wizard — a later step creates the project with an explicit command instead.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash -s -- --no-wizard
cd bootgly.kit
```

> [!TIP]
> The installer also asks whether to install the `bootgly` command globally — either answer is fine, every page here uses `php bootgly …`. Already have a kit? The installer resumes the one it finds at `./bootgly.kit` and offers to move it to the current release — accept it, these pages assume 1.0.2 or newer — then `cd` into it and go to the next step. Every command below runs from the kit directory as `php bootgly …` — if you installed the CLI globally (`php bootgly setup`), `bootgly …` works too. The [Getting started](/guide/getting-started/overview/) guide explains the installer and the kit layout.

  </d-block-step>

  <d-block-step title="Start PostgreSQL">

The app needs a PostgreSQL server. The quickest one is the official image in a container — a database `polls` owned by the user `polls`, password `secret`, on the default port:

```bash :toolbar="true";
docker run --name polls-postgres -e POSTGRES_USER=polls -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=polls -p 5432:5432 -d postgres:16
```

PostgreSQL takes a few seconds to initialize on its first start. This loop returns as soon as the server accepts connections on the port — run it before going on, or the project would try to migrate a database that is not there yet. It prints `no response` while PostgreSQL initializes; if it keeps going for more than a minute, the container did not start (`docker ps -a`, `docker logs polls-postgres` — a PostgreSQL already on port 5432 is the usual reason):

```bash :toolbar="true";
until docker exec polls-postgres pg_isready -U polls -h 127.0.0.1; do sleep 1; done
```

> [!NOTE]
> Docker is the only thing this page assumes besides the installer (on Linux, your user must be in the `docker` group, or prefix the two commands with `sudo`). Already have a PostgreSQL server? Skip the container and point the project at it with environment variables when you start it: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASS` — the database config you write in a moment reads them. Bootgly's PostgreSQL driver is native: it speaks the wire protocol itself (SCRAM-SHA-256 included), so no `pgsql` or PDO extension is needed.

  </d-block-step>

  <d-block-step title="Create the project">

Create a **WPI** (web) project named `Polls` on the **Web** platform, on port 8082. On the first run this also sets the platform up (its git submodule and the shipped examples — `Demo/Blog` is the MVC reference), so it takes a moment:

```bash :toolbar="true";
php bootgly projects create Polls --platform=web --interfaces=WPI --port=8082 --yes
```

The project lands in `projects/Polls/` as a git repository of its own (the scaffold becomes its first commit once git knows your name and e-mail) — `Polls.Project.php` (the signature), a `router/` with a welcome route set, `schedule.php` and `tests/`. You will replace the signature and the router manifest, add a `Polls.routes.php` route set (delete `Welcome.routes.php` if you like); the next step creates every folder in one go. Everything goes inside `projects/Polls/`.

  </d-block-step>

  <d-block-step title="Create the folders">

Every folder the next steps write into, in one command — from here on you only create files and paste their content. Run it from the kit directory (`mkdir -p` leaves the folders the scaffold already created alone):

```bash :toolbar="true";
mkdir -p projects/Polls/Controllers \
   projects/Polls/Models \
   projects/Polls/configs/database \
   projects/Polls/database/migrations \
   projects/Polls/database/seeders \
   projects/Polls/router/routes \
   projects/Polls/statics \
   projects/Polls/tests/project \
   projects/Polls/views/errors \
   projects/Polls/views/layouts \
   projects/Polls/views/polls
```

  </d-block-step>

  <d-block-step title="Write the project signature">

Replace the scaffolded `Polls.Project.php`. Its `boot` function builds a database handle from the project's own `database` config scope — the same file the `Database` response resource reads, so the connection settings live in one place — runs the migrations and the seeders before the server forks, then starts a `Web\App` with two workers:

**File** `projects/Polls/Polls.Project.php`

```php :filename="projects/Polls/Polls.Project.php";
<?php

use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner as Migrations;
use Bootgly\ADI\Databases\SQL\Seed\Runner as Seeds;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Environment\Configs\DatabaseConfig;
use Bootgly\API\Projects\Project;
use Web\App;
use Web\App\Configs;


return new Project(
   // # Project Metadata
   name: 'Polls',
   description: 'Polls — questions, options and one vote per visitor on the Web platform App shell (PostgreSQL, ORM, upsert)',
   version: '1.0.0',
   author: 'Cookbook',
   exportable: true,

   // # Project Boot Function
   boot: function (array $arguments = [], array $options = []): void
   {
      // @ Migrate + seed PostgreSQL before the fork — on the connection settings the Database
      //   response resource reads too: configs/database/ (DB_HOST, DB_PORT, DB_NAME, …)
      $Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
      new Migrations($Database, __DIR__ . '/database/migrations', __DIR__ . '/database/polls.migrations.lock')->up();
      new Seeds($Database, __DIR__ . '/database/seeders', __DIR__ . '/database/polls.seeders.lock')->run();

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
            port: getenv('PORT') ? (int) getenv('PORT') : 8082,
            // ! Two workers — each one keeps its own pool of PostgreSQL connections
            workers: 2
         ))
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

`Modes::Daemon` detaches the server from your terminal (`php bootgly project Polls stop` stops it); `-f` keeps it in the foreground with the logs in front of you.

  </d-block-step>

  <d-block-step title="Configure the database">

The `database` scope declares the PostgreSQL connection, every value bound to an environment variable with the container's credentials as defaults. The driver's default TLS mode is `prefer`: the container has no certificate, the server says so, and the connection carries on in plaintext — on a real server, `DB_SSLMODE=verify-full` with `DB_SSLCAFILE` makes it strict:

**File** `projects/Polls/configs/database/database.Config.php`

```php :filename="projects/Polls/configs/database/database.Config.php";
<?php

use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;


return new Config(scope: 'database')
   ->Enabled->bind(key: 'DB_ENABLED', default: true, cast: Types::Boolean)
   ->Default->bind(key: 'DB_CONNECTION', default: 'pgsql')
   ->Connections
      ->PostgreSQL
         ->Driver->bind(key: '', default: 'pgsql')
         ->Host->bind(key: 'DB_HOST', default: '127.0.0.1')
         ->Port->bind(key: 'DB_PORT', default: 5432, cast: Types::Integer)
         ->Database->bind(key: 'DB_NAME', default: 'polls')
         ->Username->bind(key: 'DB_USER', default: 'polls')
         ->Password->bind(key: 'DB_PASS', default: 'secret')
         ->up()
      ->up();
```

  </d-block-step>

  <d-block-step title="Write the migration">

One migration, four statements: the three tables and the unique index over `(poll_id, voter)` that makes "one vote per visitor per poll" a rule the database enforces. `reference()` declares the foreign keys; `Timestamptz` is PostgreSQL's `TIMESTAMPTZ`, an instant that hydrates as a `DateTimeImmutable`; the runner applies the list in one transaction:

**File** `projects/Polls/database/migrations/20260922000000_create_polls.php`

```php :filename="projects/Polls/database/migrations/20260922000000_create_polls.php";
<?php

use Bootgly\ADI\Databases\SQL\Builder\Expression;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;


return new Migration(
   Up: function (Migrating $Schema) {
      // : Three tables and one index — the runner applies them in order, in one transaction
      return [
         $Schema->create('polls', function (Blueprint $Table): void {
            $Table->add('id', Types::BigInteger)
               ->generate()
               ->constrain(Keys::Primary);
            $Table->add('question', Types::String)
               ->limit(200);
            // ! TIMESTAMPTZ — an instant, not a wall-clock reading; hydrates as DateTimeImmutable
            $Table->add('created_at', Types::Timestamptz)->default = new Expression('CURRENT_TIMESTAMP');
         }),
         $Schema->create('options', function (Blueprint $Table): void {
            $Table->add('id', Types::BigInteger)
               ->generate()
               ->constrain(Keys::Primary);
            $Table->add('poll_id', Types::BigInteger)
               ->reference('polls');
            $Table->add('label', Types::String)
               ->limit(120);
            $Table->add('position', Types::Integer)->default = 0;
         }),
         $Schema->create('votes', function (Blueprint $Table): void {
            $Table->add('id', Types::BigInteger)
               ->generate()
               ->constrain(Keys::Primary);
            $Table->add('poll_id', Types::BigInteger)
               ->reference('polls');
            $Table->add('option_id', Types::BigInteger)
               ->reference('options');
            $Table->add('voter', Types::String)
               ->limit(64);
            $Table->add('created_at', Types::Timestamptz)->default = new Expression('CURRENT_TIMESTAMP');
         }),
         // ! One vote per visitor per poll — the upsert in Polls::vote conflicts on exactly this index
         $Schema->index('votes', ['poll_id', 'voter'], unique: true)
      ];
   },
   Down: function (Migrating $Schema) {
      return [
         $Schema->drop('votes'),
         $Schema->drop('options'),
         $Schema->drop('polls')
      ];
   }
);
```

  </d-block-step>

  <d-block-step title="Write the seeder">

Seeders live in `database/seeders/` and run on **every** start — the runner keeps no ledger of applied seeders (its lock file only stops two runs from overlapping), which is why the two multi-row `INSERT`s use `upsert()` on the id: the second start updates the rows instead of failing on them. The two raw statements at the end matter on PostgreSQL: an identity column does not advance its sequence when you insert explicit ids, so the next poll created through the form would collide with id 1 — `setval()` moves the sequences past the seeds:

**File** `projects/Polls/database/seeders/polls.php`

```php :filename="projects/Polls/database/seeders/polls.php";
<?php

use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;


return new Seeder(
   Run: function (SQL $Database, Seed $Seed): array {
      // : Two polls with three options each — `upsert(id)` makes the seeder safe to run
      //   again (ON CONFLICT DO UPDATE on PostgreSQL)
      return [
         $Database->table(new Identifier('polls'))
            ->insert()
            ->set(new Identifier('id'), 1, 2)
            ->set(new Identifier('question'), 'Which editor do you write PHP in?', 'Tabs or spaces?')
            ->upsert(new Identifier('id')),
         $Database->table(new Identifier('options'))
            ->insert()
            ->set(new Identifier('id'), 1, 2, 3, 4, 5, 6)
            ->set(new Identifier('poll_id'), 1, 1, 1, 2, 2, 2)
            ->set(new Identifier('label'), 'VS Code', 'PhpStorm', 'Vim or Neovim', 'Tabs', 'Spaces', 'Both, it depends')
            ->set(new Identifier('position'), 1, 2, 3, 1, 2, 3)
            ->upsert(new Identifier('id')),
         // ! Explicit ids do not advance PostgreSQL's identity sequences — move them past the
         //   seeds, or the first poll created through the form would collide with id 1
         "SELECT setval(pg_get_serial_sequence('polls', 'id'), (SELECT MAX(id) FROM polls))",
         "SELECT setval(pg_get_serial_sequence('options', 'id'), (SELECT MAX(id) FROM options))"
      ];
   }
);
```

  </d-block-step>

  <d-block-step title="Write the models">

An ORM model is a plain class with attributes: `#[Table]` names the table, `#[Key]` the generated primary key, `#[Column]` maps a property (with the column name when it differs) and `#[Relation]` declares how two models connect — `HasMany` from the poll's `id` to the option's `poll` property. `Vote` is read through the ORM on the poll page and written with the Query Builder when someone votes:

**File** `projects/Polls/Models/Poll.php`

```php :filename="projects/Polls/Models/Poll.php";
<?php

namespace Polls\Models;


use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Model\Table;


#[Table('polls')]
class Poll
{
   // * Data
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $question = '';

   // ! Set by the database (CURRENT_TIMESTAMP) — never written by the model
   #[Column('created_at', insert: false, update: false)]
   public null|DateTimeImmutable $created = null;

   // # Relations
   // ! HasMany: options.poll_id → polls.id (local property, foreign property)
   /** @var array<int,Option> */
   #[Relation(Relations::HasMany, Option::class, 'id', 'poll')]
   public array $Options = [];
}
```

**File** `projects/Polls/Models/Option.php`

```php :filename="projects/Polls/Models/Option.php";
<?php

namespace Polls\Models;


use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;


#[Table('options')]
class Option
{
   // * Data
   #[Key]
   public null|int $id = null;

   #[Column('poll_id')]
   public int $poll = 0;

   #[Column]
   public string $label = '';

   #[Column]
   public int $position = 0;
}
```

**File** `projects/Polls/Models/Vote.php`

```php :filename="projects/Polls/Models/Vote.php";
<?php

namespace Polls\Models;


use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;


#[Table('votes')]
class Vote
{
   // * Data
   #[Key]
   public null|int $id = null;

   #[Column('poll_id')]
   public int $poll = 0;

   #[Column('option_id')]
   public int $option = 0;

   #[Column]
   public string $voter = '';

   #[Column('created_at', insert: false, update: false)]
   public null|DateTimeImmutable $created = null;
}
```

`namespace Polls\Models;` mirrors the folder — that is how Bootgly autoloads your classes.

  </d-block-step>

  <d-block-step title="Write the controller">

One controller, four actions. `list` paginates the polls (the view shows the page it gets — ten by default; `?page=2` reaches the rest, and the `Link` header says so). `create` validates the form and writes the poll and its options inside `transact()` — `output()` is `RETURNING`, so the new id comes back with the `INSERT` and the options can point at it. `show` loads the poll with its options through the ORM, counts the votes with raw SQL (PostgreSQL's placeholders are `$1`, `$2`, …; `COUNT(v.id)` over a `LEFT JOIN` keeps the options nobody picked at zero) and reads the visitor's own vote through the `Vote` model. `vote` is a single `INSERT … ON CONFLICT (poll_id, voter) DO UPDATE`: the first vote inserts, a second one changes it — no read-then-write, no race. The visitor is an anonymous token minted once and kept in the session:

**File** `projects/Polls/Controllers/Polls.php`

```php :filename="projects/Polls/Controllers/Polls.php";
<?php

namespace Polls\Controllers;


use function array_fill;
use function bin2hex;
use function count;
use function is_string;
use function mb_strlen;
use function random_bytes;
use function range;
use function trim;
use function usort;

use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Transaction;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CSRF;
use Polls\Models\Option;
use Polls\Models\Poll;
use Polls\Models\Vote;
use Web\App\Controller;


class Polls extends Controller
{
   public function list (Request $Request, Response $Response): Response
   {
      // @ Newest first, paginated by the core (`?page` / `?limit`)
      $Repository = $Response->Database->map(Poll::class);
      $Selection = $Repository->select()
         ->order(Orders::Desc, new Identifier('id'));
      $page = $Response->Database->paginate($Repository, $Selection);

      return $this->render('polls/list', [
         'Polls' => $page['items'],
         'flash' => $Request->Session->pull('flash')
      ]);
   }

   public function create (Request $Request, Response $Response): Response
   {
      // ?: GET — the form
      if ($Request->method === 'GET') {
         return $this->render('polls/create', [
            'flash' => $Request->Session->pull('flash'),
            'token' => CSRF::mask((string) $Request->Session->get('_csrf_token', ''))
         ]);
      }

      // @ POST — validate: a question and at least two options
      $question = trim((string) ($Request->fields['question'] ?? ''));
      $labels = [];
      foreach (['option1', 'option2', 'option3'] as $field) {
         $label = trim((string) ($Request->fields[$field] ?? ''));

         if ($label !== '' && mb_strlen($label) <= 120) {
            $labels[] = $label;
         }
      }

      // ?
      if ($question === '' || mb_strlen($question) > 200 || count($labels) < 2) {
         $Request->Session->set('flash', 'A question (up to 200 characters) and at least two options (up to 120 each) are required.');

         return $this->redirect('/polls/create', 303);
      }

      // @ The poll and its options in one transaction — RETURNING hands the new id back
      $id = $Response->Database->transact(function (Transaction $Transaction, Database $Database) use ($question, $labels): int {
         $poll = (int) $Database->fetch(
            $Database->table(new Identifier('polls'))
               ->insert()
               ->set(new Identifier('question'), $question)
               ->output(new Identifier('id'))
         )->row['id'];

         // @ The options — one multi-row INSERT: every set() carries one value per row
         $Database->fetch(
            $Database->table(new Identifier('options'))
               ->insert()
               ->set(new Identifier('poll_id'), ...array_fill(0, count($labels), $poll))
               ->set(new Identifier('label'), ...$labels)
               ->set(new Identifier('position'), ...range(1, count($labels)))
         );

         // : The new poll id — transact() commits when the callback returns
         return $poll;
      });

      $Request->Session->set('flash', 'Your poll is live — share the link and vote!');

      // : POST → 303 See Other
      return $this->redirect("/polls/{$id}", 303);
   }

   public function show (Request $Request, Response $Response): Response
   {
      $id = (int) $this->Route->Params->id;

      // @ The poll with its options — `load('Options')` is one extra query for the relation
      $Repository = $Response->Database->map(Poll::class);
      $Selection = $Repository->select()
         ->filter(new Identifier('id'), Operators::Equal, $id)
         ->load('Options');
      $Poll = $Repository->hydrate($Response->Database->await($Repository->fetch($Selection)))->entity;

      // ?
      if ($Poll === null) {
         $Response->View->render('errors/404');

         return $Response->code(404);
      }

      usort($Poll->Options, fn (Option $A, Option $B): int => $A->position <=> $B->position);

      // @ The results — raw SQL with PostgreSQL's $1 placeholders: one COUNT per option, zero included
      $Result = $Response->Database->fetch(
         'SELECT o.id, COUNT(v.id) AS votes FROM options o LEFT JOIN votes v ON v.option_id = o.id WHERE o.poll_id = $1 GROUP BY o.id',
         [$id]
      );
      $votes = [];
      $total = 0;
      foreach ($Result->rows as $row) {
         $votes[$row['id']] = (int) $row['votes'];
         $total += (int) $row['votes'];
      }

      // @ The visitor's own vote, through the Vote model — null until they vote
      $Votes = $Response->Database->map(Vote::class);
      $Mine = $Votes->hydrate($Response->Database->await($Votes->fetch(
         $Votes->select()
            ->filter(new Identifier('poll_id'), Operators::Equal, $id)
            ->filter(new Identifier('voter'), Operators::Equal, $this->identify($Request))
      )))->entity;

      return $this->render('polls/show', [
         'Poll' => $Poll,
         'votes' => $votes,
         'total' => $total,
         'mine' => $Mine?->option,
         'flash' => $Request->Session->pull('flash'),
         'token' => CSRF::mask((string) $Request->Session->get('_csrf_token', ''))
      ]);
   }

   public function vote (Request $Request, Response $Response): Response
   {
      $id = (int) $this->Route->Params->id;
      $option = (int) ($Request->fields['option'] ?? 0);

      // ? The option must belong to this poll
      $Result = $Response->Database->fetch(
         $Response->Database->table(new Identifier('options'))
            ->select(new Identifier('id'))
            ->filter(new Identifier('id'), Operators::Equal, $option)
            ->filter(new Identifier('poll_id'), Operators::Equal, $id)
      );

      if ($Result->empty === true) {
         $Request->Session->set('flash', 'Pick one of the options.');

         return $this->redirect("/polls/{$id}", 303);
      }

      // @ One vote per visitor per poll: INSERT … ON CONFLICT (poll_id, voter) DO UPDATE —
      //   the unique index from the migration is what makes the second vote a change of mind
      $Response->Database->fetch(
         $Response->Database->table(new Identifier('votes'))
            ->insert()
            ->set(new Identifier('poll_id'), $id)
            ->set(new Identifier('option_id'), $option)
            ->set(new Identifier('voter'), $this->identify($Request))
            ->upsert(new Identifier('poll_id'), new Identifier('voter'))
      );

      $Request->Session->set('flash', 'Your vote counts — you can change it any time.');

      // : POST → 303 See Other
      return $this->redirect("/polls/{$id}", 303);
   }

   // ---

   /**
    * Identify the visitor — an anonymous token minted once and kept in the session.
    */
   private function identify (Request $Request): string
   {
      $voter = $Request->Session->get('voter');

      // ?
      if (is_string($voter) === false) {
         $voter = bin2hex(random_bytes(16));
         $Request->Session->set('voter', $voter);
      }

      // :
      return $voter;
   }
}
```

  </d-block-step>

  <d-block-step title="Write the routes">

The router manifest names the active route sets. `Controllers::map()` expands the resource routes — `list`, `create` and `show` — and the vote is one more `POST` on the poll, mapped with `Action`, the same dispatcher `map()` uses (`:id<int>` only matches digits):

**File** `projects/Polls/router/router.index.php`

```php :filename="projects/Polls/router/router.index.php";
<?php

return [
   'Polls'
];
```

**File** `projects/Polls/router/routes/Polls.routes.php`

```php :filename="projects/Polls/router/routes/Polls.routes.php";
<?php

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Web\API\Action;
use Web\App\Controllers;
use Web\App\Statics;

use Polls\Controllers\Polls;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   // * Polls — GET /polls (list), GET /polls/create + POST /polls (create), GET /polls/:id (show)
   yield from Controllers::map($Router, '/polls', Polls::class, only: ['list', 'create', 'show']);

   // * Votes — POST /polls/:id/vote (CSRF-checked, like every POST)
   yield $Router->route('/polls/:id<int>/vote', new Action(Polls::class, 'vote'), POST);

   // * Commons
   yield $Router->route('/', function (Request $Request, Response $Response) {
      return $Response->redirect('/polls', 307);
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

Views are PHP templates in `views/`; `views/layouts/main.template.php` wraps every render and `@yield content;` is where the view goes. The poll page is a form of radio buttons — the visitor's current vote pre-checked — followed by the results, one `<meter>` per option:

**File** `projects/Polls/views/layouts/main.template.php`

```php :filename="projects/Polls/views/layouts/main.template.php";
<!DOCTYPE html>
<html lang="en">
<head>
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <title>Polls</title>
   <link rel="stylesheet" href="/statics/polls.css">
</head>
<body>
   <header>
      <strong>Polls</strong>
      <nav>
         <a href="/polls">Polls</a>
         <a href="/polls/create">Ask a question</a>
      </nav>
   </header>
   <main>
      @yield content;
   </main>
   <footer>Powered by the Bootgly Web platform</footer>
</body>
</html>
```

**File** `projects/Polls/views/polls/list.template.php`

```php :filename="projects/Polls/views/polls/list.template.php";
<h1>Polls</h1>

<?php if ($flash !== null): ?>
<p class="flash"><?= htmlspecialchars((string) $flash) ?></p>
<?php endif; ?>

<?php foreach ($Polls as $Poll): ?>
<article>
   <h2><a href="/polls/<?= $Poll->id ?>"><?= htmlspecialchars($Poll->question) ?></a></h2>
   <p class="meta">asked <?= $Poll->created?->format('Y-m-d H:i P') ?></p>
</article>
<?php endforeach; ?>

<?php if ($Polls === []): ?>
<p class="empty">No polls yet — <a href="/polls/create">ask the first question</a>.</p>
<?php endif; ?>
```

**File** `projects/Polls/views/polls/create.template.php`

```php :filename="projects/Polls/views/polls/create.template.php";
<h1>Ask a question</h1>

<?php if ($flash !== null): ?>
<p class="flash"><?= htmlspecialchars((string) $flash) ?></p>
<?php endif; ?>

<form method="post" action="/polls">
   <input type="hidden" name="_token" value="<?= htmlspecialchars((string) $token) ?>">
   <label>
      Question
      <input type="text" name="question" maxlength="200" required>
   </label>
   <label>
      Option 1
      <input type="text" name="option1" maxlength="120" required>
   </label>
   <label>
      Option 2
      <input type="text" name="option2" maxlength="120" required>
   </label>
   <label>
      Option 3 (optional)
      <input type="text" name="option3" maxlength="120">
   </label>
   <button type="submit">Publish the poll</button>
</form>
```

**File** `projects/Polls/views/polls/show.template.php`

```php :filename="projects/Polls/views/polls/show.template.php";
<h1><?= htmlspecialchars($Poll->question) ?></h1>

<?php if ($flash !== null): ?>
<p class="flash"><?= htmlspecialchars((string) $flash) ?></p>
<?php endif; ?>

<form method="post" action="/polls/<?= $Poll->id ?>/vote">
   <input type="hidden" name="_token" value="<?= htmlspecialchars((string) $token) ?>">
   <?php foreach ($Poll->Options as $Option): ?>
   <label class="option">
      <input type="radio" name="option" value="<?= $Option->id ?>"<?= $Option->id === $mine ? ' checked' : '' ?> required>
      <?= htmlspecialchars($Option->label) ?>
   </label>
   <?php endforeach; ?>
   <button type="submit"><?= $mine === null ? 'Vote' : 'Change my vote' ?></button>
</form>

<h2><?= $total ?> vote(s)</h2>

<?php foreach ($Poll->Options as $Option): ?>
<?php $count = $votes[$Option->id] ?? 0; $percent = $total > 0 ? (int) round($count * 100 / $total) : 0; ?>
<div class="result">
   <span class="label"><?= htmlspecialchars($Option->label) ?></span>
   <meter value="<?= $percent ?>" min="0" max="100"></meter>
   <span class="count"><?= $count ?> (<?= $percent ?>%)</span>
</div>
<?php endforeach; ?>

<p class="meta">asked <?= $Poll->created?->format('Y-m-d H:i P') ?> · <a href="/polls">all polls</a></p>
```

**File** `projects/Polls/views/errors/404.template.php`

```php :filename="projects/Polls/views/errors/404.template.php";
<h1>404</h1>
<p>There is nothing here. <a href="/polls">Back to the polls</a>.</p>
```

**File** `projects/Polls/statics/polls.css`

```css :filename="projects/Polls/statics/polls.css";
:root {
   color-scheme: light dark;
   --accent: #7c3aed;
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
   margin-left: 1rem;
}

main {
   min-height: 60vh;
   padding: 2rem 0;
}

article {
   padding: 1rem 0;
   border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent);
}

article h2 {
   margin: 0;
   font-size: 1.1rem;
}

article a {
   color: inherit;
}

.meta {
   font-size: .9rem;
   opacity: .75;
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

label.option {
   grid-template-columns: auto 1fr;
   align-items: center;
   gap: .5rem;
}

input {
   font: inherit;
   padding: .4rem;
}

button {
   justify-self: start;
   padding: .5rem 1.25rem;
   background: var(--accent);
   color: white;
   border: 0;
   border-radius: .25rem;
   cursor: pointer;
   font: inherit;
}

.result {
   display: grid;
   grid-template-columns: 1fr 2fr auto;
   gap: .75rem;
   align-items: center;
   padding: .35rem 0;
}

meter {
   width: 100%;
   height: 1.1rem;
}

.count {
   font-variant-numeric: tabular-nums;
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

Start the server from the kit directory — the boot function migrates and seeds the database first, so two polls are waiting on the first request — and open <http://localhost:8082>: vote, change your vote, ask a question of your own:

```bash :toolbar="true";
php bootgly project Polls start
```

Port 8082 already taken? `PORT=8083 php bootgly project Polls start` — the boot function reads `PORT`; use that port in the `curl` lines below too. PostgreSQL somewhere else? `DB_HOST=… DB_PORT=… php bootgly project Polls start`.

The server is detached, so follow its log in a second terminal — every request, and the exception report when something goes wrong (the files live in `storage/logs/`):

```bash :toolbar="true";
php bootgly project Polls logs -f
```

From a terminal, the same flow with `curl` and a cookie jar: the list, a new poll through the form, a vote for its first option, a change of mind for the second — and the results, which count one vote, on the second option:

```bash :toolbar="true";
curl -s -c cookies.txt -D - -o /dev/null http://localhost:8082/polls | grep X-Total-Count
curl -s -b cookies.txt -c cookies.txt http://localhost:8082/polls/create -o page.html
token=$(grep -o 'name="_token" value="[^"]*"' page.html | head -1 | cut -d'"' -f4)
curl -s -b cookies.txt -c cookies.txt -i -X POST http://localhost:8082/polls --data-urlencode "_token=$token" --data-urlencode "question=Coffee or tea?" --data-urlencode "option1=Coffee" --data-urlencode "option2=Tea" | grep -E "^HTTP|^Location"
curl -s -b cookies.txt -c cookies.txt -o /dev/null -X POST http://localhost:8082/polls/3/vote --data-urlencode "_token=$token" --data-urlencode "option=7"
curl -s -b cookies.txt -c cookies.txt -i -X POST http://localhost:8082/polls/3/vote --data-urlencode "_token=$token" --data-urlencode "option=8" | grep -E "^HTTP|^Location"
curl -s -b cookies.txt http://localhost:8082/polls/3 | grep -E "flash|checked|<h2|count"
```

```text
X-Total-Count: 2
HTTP/1.1 303 See Other
Location: /polls/3
HTTP/1.1 303 See Other
Location: /polls/3
<p class="flash">Your vote counts — you can change it any time.</p>
      <input type="radio" name="option" value="8" checked required>
<h2>1 vote(s)</h2>
   <span class="count">0 (0%)</span>
   <span class="count">1 (100%)</span>
```

Two votes, one row: the second `INSERT` hit the unique index and became an `UPDATE`. A POST without the token is refused with `403`, an option that belongs to another poll is refused with a flash, and an unknown poll renders the 404 view. Stop the server when you are done; the container keeps the data (`docker stop polls-postgres` pauses it, `docker start polls-postgres` brings it back) — or remove it:

```bash :toolbar="true";
php bootgly project Polls stop
docker rm -f polls-postgres
```

  </d-block-step>

  <d-block-step title="Test it">

A project carries its own suites. Replace the scaffolded registry so it lists a `Project` suite with two tests — the signature contract and the models' mapping as the ORM reads it, a pure unit test that needs no server and no database:

**File** `projects/Polls/tests/autoboot.php`

```php :filename="projects/Polls/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/project/',
   ]
);
```

**File** `projects/Polls/tests/project/autoboot.php`

```php :filename="projects/Polls/tests/project/autoboot.php";
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
      '1.2-models',
   ]
);
```

**File** `projects/Polls/tests/project/1.1-signature.Test.php`

```php :filename="projects/Polls/tests/project/1.1-signature.Test.php";
<?php

use Bootgly\ACI\Tests\Suite\Test;
use Bootgly\API\Projects\Project;


return new Test(
   description: 'Project signature: metadata contract',
   test: function () {
      $Project = include __DIR__ . '/../../Polls.Project.php';

      yield assert(
         assertion: $Project instanceof Project,
         description: 'the signature file returns a Project'
      );
      yield assert(
         assertion: $Project->name === 'Polls',
         description: 'name'
      );
      yield assert(
         assertion: $Project->exportable === true,
         description: 'exportable — listed by the import picker'
      );
   }
);
```

**File** `projects/Polls/tests/project/1.2-models.Test.php`

```php :filename="projects/Polls/tests/project/1.2-models.Test.php";
<?php

use Bootgly\ACI\Tests\Suite\Test;
use Bootgly\ADI\Databases\SQL\Model;
use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;

use Polls\Models\Option;
use Polls\Models\Poll;
use Polls\Models\Vote;


return new Test(
   description: 'Models: tables, columns and the relation, as the ORM reads them',
   test: function () {
      // ! Reflection only — the same metadata the repository compiles, no database needed
      $Model = Model::reflect(Poll::class);
      $Relation = $Model->relations['Options'] ?? null;

      yield assert(
         assertion: $Model->table === 'polls' && $Model->key === 'id' && $Model->generated === true,
         description: 'Poll maps the polls table with a generated id'
      );
      yield assert(
         assertion: $Relation !== null
            && $Relation->Type === Relations::HasMany
            && $Relation->target === Option::class
            && $Relation->local === 'id'
            && $Relation->foreign === 'poll',
         description: 'Poll has many Options: polls.id → the option\'s poll property (options.poll_id)'
      );

      $Model = Model::reflect(Option::class);

      yield assert(
         assertion: $Model->columns === ['id' => 'id', 'poll_id' => 'poll', 'label' => 'label', 'position' => 'position'],
         description: 'Option maps poll_id to its poll property — the column the relation joins on'
      );

      $Model = Model::reflect(Vote::class);

      yield assert(
         assertion: $Model->columns === [
            'id' => 'id',
            'poll_id' => 'poll',
            'option_id' => 'option',
            'voter' => 'voter',
            'created_at' => 'created'
         ],
         description: 'Vote maps every column to its property'
      );
      yield assert(
         assertion: isset($Model->insertions['created_at']) === false && isset($Model->insertions['id']) === false,
         description: 'neither the id nor created_at is ever inserted by the model — the database fills them'
      );
   }
);
```

Run the project's suites from inside the project directory — the launcher is two levels up, in the kit root:

```bash :toolbar="true";
cd projects/Polls && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Next steps

- Close a poll: a `closed_at` `Timestamptz` column, an `update()` through the Builder, and `vote` refusing once it is set.
- Show who leads in the list: one `LEFT JOIN … GROUP BY` per page is cheap — or a `#[Relation(Relations::HasMany, Vote::class, 'id', 'poll', lazy: true)]` on `Poll`, loaded on access.
- Let the results stream: the [Guestbook](/cookbook/web/guestbook/overview/) shows the plain form flow; the Web platform's `SSE` response resource can push each new count to open pages.
- Switch the database: `DB_CONNECTION=mysql` with a `Connections->MySQL` block moves the migrations and the ORM over untouched — the dialect-specific spots are `output(new Identifier('id'))` in `create` (MySQL has no `RETURNING`; read `Result->inserted` instead), the `$1` placeholders in `show` (`?` on MySQL) and the two `setval()` statements in the seeder, which MySQL does not need. The [Shop](/cookbook/web/shop/overview/) page shows the MySQL side (mind its note on TLS).

## Reference

- [Web App](/manual/Web/App/overview/) — `App`, `Configs`, `Controller`, `Controllers`, `Statics`, `Views`.
- [Database DBAL](/guide/database-dbal/overview/) — the `database` config scope, drivers, the `Database` response resource.
- [PostgreSQL driver](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/) — native protocol, `$1` placeholders, `RETURNING`, TLS modes.
- [Query Builder](/manual/ADI/Databases/SQL/Builder/overview/) — `table()`, `select()`, `filter()`, `output()`, `upsert()` and the enums.
- [Database ORM](/guide/database-orm/overview/) — `#[Table]`, `#[Key]`, `#[Column]`, `#[Relation]`, repositories, `load()`.
- [Database transactions](/guide/database-transactions/overview/) — `transact()`, savepoints, what rolls back and what commits.
- [Database migrations](/guide/database-migrations/overview/) — `Migration`, `Blueprint`, `reference()`, `index()`, types and the runner.
- [Database seeders](/guide/database-seeders/overview/) — `Seeder`, the runner and the lock.
- [Router](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/) — route sets, parameters, the middlewares (CSRF among them).
- [Testing](/testing/about/testing/overview/) — suites, the Basic and Advanced assertion APIs and `bootgly test`.
