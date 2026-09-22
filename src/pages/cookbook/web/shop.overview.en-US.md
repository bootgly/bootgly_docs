# Build a Web App on MySQL

Build **Shop**, a small store on MySQL: a product catalogue with pagination, a cart kept in the session, a checkout that writes the order and its items in **one transaction** — with row locks, so two shoppers cannot both buy the last unit — and an order page that loads its relations through the ORM. MySQL runs in a container you start with one command; Bootgly talks to it natively, no PHP extension involved. The Web platform's **App** shell brings the HTTP server, the middleware stack (secure headers, request ids, body parsing, CSRF), sessions, controllers, views and static files; you write the store.

You will write 26 short files (about an hour) and learn how a `Web\App` connects to MySQL, how migrations declare foreign keys and `DECIMAL` money, how a seeder upserts, how ORM models declare relations and load them, how the Query Builder, raw SQL and `transact()` fit together, how the core paginates, and how a project is tested with `bootgly test`.

```text
$ curl -s -b cookies.txt -c cookies.txt -i -X POST http://localhost:8081/orders \
     --data-urlencode "_token=$token" --data-urlencode "customer=Ada" --data-urlencode "email=ada@example.com" | grep -E "^HTTP|^Location"
HTTP/1.1 303 See Other
Location: /cart
$ curl -s -b cookies.txt http://localhost:8081/cart | grep flash
<p class="flash">Only 1 × Monitor left — adjust your cart.</p>
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

  <d-block-step title="Start MySQL">

The store needs a MySQL server. The quickest one is the official image in a container — a database `shop` owned by the user `shop`, password `secret`, on the default port:

```bash :toolbar="true";
docker run --name shop-mysql -e MYSQL_ROOT_PASSWORD=secret -e MYSQL_DATABASE=shop -e MYSQL_USER=shop -e MYSQL_PASSWORD=secret -p 3306:3306 -d mysql:8
```

MySQL takes a few seconds to initialize on its first start. This loop returns as soon as the server accepts connections on the port — run it before going on, or the project would try to migrate a database that is not there yet. It is quiet while MySQL initializes; if it keeps printing errors for more than a minute, the container did not start (`docker ps -a`, `docker logs shop-mysql` — a MySQL already on port 3306 is the usual reason):

```bash :toolbar="true";
until docker exec -e MYSQL_PWD=secret shop-mysql mysqladmin ping -h 127.0.0.1 -u shop --silent; do sleep 1; done
```

> [!NOTE]
> Docker is the only thing this page assumes besides the installer (on Linux, your user must be in the `docker` group, or prefix the two commands with `sudo`). Already have a MySQL server? Skip the container and point the project at it with environment variables when you start it: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASS` — the database config you write in a moment reads them. Bootgly's MySQL driver is native: it speaks the wire protocol itself (`caching_sha2_password` included), so no `mysqli` or PDO extension is needed.

  </d-block-step>

  <d-block-step title="Create the project">

Create a **WPI** (web) project named `Shop` on the **Web** platform, on port 8081. On the first run this also sets the platform up (its git submodule and the shipped examples — `Demo/Blog` is the MVC reference), so it takes a moment:

```bash :toolbar="true";
php bootgly projects create Shop --platform=web --interfaces=WPI --port=8081 --yes
```

The project lands in `projects/Shop/` as a git repository of its own (the scaffold becomes its first commit once git knows your name and e-mail) — `Shop.Project.php` (the signature), a `router/` with a welcome route set, `schedule.php` and `tests/`. You will replace the signature and the router manifest, add a `Shop.routes.php` route set (delete `Welcome.routes.php` if you like); the next step creates every folder in one go. Everything goes inside `projects/Shop/`.

  </d-block-step>

  <d-block-step title="Create the folders">

Every folder the next steps write into, in one command — from here on you only create files and paste their content. Run it from the kit directory (`mkdir -p` leaves the folders the scaffold already created alone):

```bash :toolbar="true";
mkdir -p projects/Shop/Controllers \
   projects/Shop/Models \
   projects/Shop/configs/database \
   projects/Shop/database/migrations \
   projects/Shop/database/seeders \
   projects/Shop/router/routes \
   projects/Shop/statics \
   projects/Shop/tests/project \
   projects/Shop/views/cart \
   projects/Shop/views/errors \
   projects/Shop/views/layouts \
   projects/Shop/views/orders \
   projects/Shop/views/products
```

  </d-block-step>

  <d-block-step title="Write the project signature">

Replace the scaffolded `Shop.Project.php`. Its `boot` function builds a database handle from the project's own `database` config scope — the same file the `Database` response resource reads, so the connection settings live in one place — runs the migrations and the seeders before the server forks, then starts a `Web\App` with two workers:

**File** `projects/Shop/Shop.Project.php`

```php :filename="projects/Shop/Shop.Project.php";
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
   name: 'Shop',
   description: 'Shop — products, a session cart and checkout on the Web platform App shell (MySQL, ORM, transactions)',
   version: '1.0.0',
   author: 'Cookbook',
   exportable: true,

   // # Project Boot Function
   boot: function (array $arguments = [], array $options = []): void
   {
      // @ Migrate + seed MySQL before the fork — on the connection settings the Database
      //   response resource reads too: configs/database/ (DB_HOST, DB_PORT, DB_NAME, …)
      $Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
      new Migrations($Database, __DIR__ . '/database/migrations', __DIR__ . '/database/shop.migrations.lock')->up();
      new Seeds($Database, __DIR__ . '/database/seeders', __DIR__ . '/database/shop.seeders.lock')->run();

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
            port: getenv('PORT') ? (int) getenv('PORT') : 8081,
            // ! Two workers — each one keeps its own pool of MySQL connections
            workers: 2
         ))
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

`Modes::Daemon` detaches the server from your terminal (`php bootgly project Shop stop` stops it); `-f` keeps it in the foreground with the logs in front of you. Each worker keeps its own pool of MySQL connections; the pool is created lazily, on the first request the worker serves.

  </d-block-step>

  <d-block-step title="Configure the database">

The `database` scope declares the MySQL connection, every value bound to an environment variable with the container's credentials as defaults:

**File** `projects/Shop/configs/database/database.Config.php`

```php :filename="projects/Shop/configs/database/database.Config.php";
<?php

use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;


return new Config(scope: 'database')
   ->Enabled->bind(key: 'DB_ENABLED', default: true, cast: Types::Boolean)
   ->Default->bind(key: 'DB_CONNECTION', default: 'mysql')
   ->Connections
      ->MySQL
         ->Driver->bind(key: '', default: 'mysql')
         ->Host->bind(key: 'DB_HOST', default: '127.0.0.1')
         ->Port->bind(key: 'DB_PORT', default: 3306, cast: Types::Integer)
         ->Database->bind(key: 'DB_NAME', default: 'shop')
         ->Username->bind(key: 'DB_USER', default: 'shop')
         ->Password->bind(key: 'DB_PASS', default: 'secret')
         // ! The MySQL image ships a self-signed certificate and the driver verifies
         //   certificates: no TLS on localhost (DB_SSLMODE=verify-full + DB_SSLCAFILE in production)
         ->Secure
            ->Mode->bind(key: 'DB_SSLMODE', default: 'disable')
            ->up()
         ->up()
      ->up();
```

> [!WARNING]
> The `Secure` block matters. The MySQL image enables TLS with a self-signed certificate, and Bootgly's driver verifies certificates even in its default `prefer` mode — so without `DB_SSLMODE=disable` the very first connection fails with `certificate verify failed`. On a real server keep TLS on: `DB_SSLMODE=verify-full` with `DB_SSLCAFILE` pointing at the server's CA certificate.

  </d-block-step>

  <d-block-step title="Write the migrations">

Migrations live in `database/migrations/` and run in file order. The first one creates `products` — `DECIMAL(10,2)` for the price, because money is never a float:

**File** `projects/Shop/database/migrations/20260922000000_create_products.php`

```php :filename="projects/Shop/database/migrations/20260922000000_create_products.php";
<?php

use Bootgly\ADI\Databases\SQL\Builder\Expression;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;


return new Migration(
   Up: function (Migrating $Schema) {
      return $Schema->create('products', function (Blueprint $Table): void {
         $Table->add('id', Types::BigInteger)
            ->generate()
            ->constrain(Keys::Primary);
         $Table->add('name', Types::String)
            ->limit(120);
         // ! DECIMAL(10,2) — money is never a float
         $Table->add('price', Types::Decimal)
            ->size(10, 2);
         $Table->add('stock', Types::Integer)->default = 0;
         $Table->add('created_at', Types::Timestamp)->default = new Expression('CURRENT_TIMESTAMP');
      });
   },
   Down: function (Migrating $Schema) {
      return $Schema->drop('products');
   }
);
```

The second creates `orders` and `order_items` together — a migration may return a list of queries, applied in order (MySQL commits DDL as it goes, so a statement that fails leaves the ones before it in place; PostgreSQL and SQLite roll the list back as one). `reference()` declares the foreign keys, and the item keeps the price it was sold at:

**File** `projects/Shop/database/migrations/20260922000001_create_orders.php`

```php :filename="projects/Shop/database/migrations/20260922000001_create_orders.php";
<?php

use Bootgly\ADI\Databases\SQL\Builder\Expression;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;


return new Migration(
   Up: function (Migrating $Schema) {
      // : Two tables in one migration — the runner applies them in order (MySQL's DDL
      //   commits as it goes: a failed second statement leaves the first table in place)
      return [
         $Schema->create('orders', function (Blueprint $Table): void {
            $Table->add('id', Types::BigInteger)
               ->generate()
               ->constrain(Keys::Primary);
            $Table->add('customer', Types::String)
               ->limit(80);
            $Table->add('email', Types::String)
               ->limit(120);
            $Table->add('total', Types::Decimal)
               ->size(10, 2);
            $Table->add('created_at', Types::Timestamp)->default = new Expression('CURRENT_TIMESTAMP');
         }),
         $Schema->create('order_items', function (Blueprint $Table): void {
            $Table->add('id', Types::BigInteger)
               ->generate()
               ->constrain(Keys::Primary);
            // ! Foreign keys — an item cannot outlive its order or point at a missing product
            $Table->add('order_id', Types::BigInteger)
               ->reference('orders');
            $Table->add('product_id', Types::BigInteger)
               ->reference('products');
            $Table->add('quantity', Types::Integer);
            // ! The price paid, frozen — the product's price may change later
            $Table->add('price', Types::Decimal)
               ->size(10, 2);
         })
      ];
   },
   Down: function (Migrating $Schema) {
      return [
         $Schema->drop('order_items'),
         $Schema->drop('orders')
      ];
   }
);
```

  </d-block-step>

  <d-block-step title="Write the seeder">

Seeders live in `database/seeders/` and run on **every** start — the runner keeps no ledger of applied seeders (its lock file only stops two runs from overlapping), which is exactly why this one uses `upsert()` on the id: one multi-row `INSERT` — every `set()` carries one value per row — that updates instead of failing when the rows exist (`ON DUPLICATE KEY UPDATE` on MySQL). A restart therefore restocks the shelves to the seed values (the orders stay). The webcam starts sold out on purpose:

**File** `projects/Shop/database/seeders/products.php`

```php :filename="projects/Shop/database/seeders/products.php";
<?php

use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;


return new Seeder(
   Run: function (SQL $Database, Seed $Seed): array {
      // : Six products in one INSERT — `upsert(id)` makes the seeder safe to run
      //   again (ON DUPLICATE KEY UPDATE on MySQL, ON CONFLICT elsewhere)
      return [
         $Database->table(new Identifier('products'))
            ->insert()
            ->set(new Identifier('id'), 1, 2, 3, 4, 5, 6)
            ->set(new Identifier('name'), 'Keyboard', 'Mouse', 'Monitor', 'Headset', 'Webcam', 'USB-C hub')
            ->set(new Identifier('price'), '49.90', '19.90', '229.00', '79.90', '59.00', '34.50')
            ->set(new Identifier('stock'), 10, 25, 3, 8, 0, 12)
            ->upsert(new Identifier('id')),
      ];
   }
);
```

  </d-block-step>

  <d-block-step title="Write the models">

An ORM model is a plain class with attributes: `#[Table]` names the table, `#[Key]` the generated primary key, `#[Column]` maps a property (with the column name when it differs) and `#[Relation]` declares how two models connect — `HasMany` from the order's `id` to the item's `order` property, `BelongsTo` from the item's `product` property to the product's `id`. `DECIMAL` columns hydrate as strings and `TIMESTAMP` columns as `DateTimeImmutable`:

**File** `projects/Shop/Models/Product.php`

```php :filename="projects/Shop/Models/Product.php";
<?php

namespace Shop\Models;


use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;


#[Table('products')]
class Product
{
   // * Data
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';

   // ! DECIMAL arrives as a string — exact, never a float
   #[Column]
   public string $price = '0.00';

   #[Column]
   public int $stock = 0;

   // ! Set by the database (CURRENT_TIMESTAMP) — never written by the model
   #[Column('created_at', insert: false, update: false)]
   public null|DateTimeImmutable $created = null;
}
```

**File** `projects/Shop/Models/Order.php`

```php :filename="projects/Shop/Models/Order.php";
<?php

namespace Shop\Models;


use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Model\Table;


#[Table('orders')]
class Order
{
   // * Data
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $customer = '';

   #[Column]
   public string $email = '';

   #[Column]
   public string $total = '0.00';

   #[Column('created_at', insert: false, update: false)]
   public null|DateTimeImmutable $created = null;

   // # Relations
   // ! HasMany: order_items.order_id → orders.id (local property, foreign property)
   /** @var array<int,OrderItem> */
   #[Relation(Relations::HasMany, OrderItem::class, 'id', 'order')]
   public array $Items = [];
}
```

**File** `projects/Shop/Models/OrderItem.php`

```php :filename="projects/Shop/Models/OrderItem.php";
<?php

namespace Shop\Models;


use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Model\Table;


#[Table('order_items')]
class OrderItem
{
   // * Data
   #[Key]
   public null|int $id = null;

   #[Column('order_id')]
   public int $order = 0;

   #[Column('product_id')]
   public int $product = 0;

   #[Column]
   public int $quantity = 0;

   #[Column]
   public string $price = '0.00';

   // # Relations
   // ! BelongsTo: order_items.product_id → products.id
   #[Relation(Relations::BelongsTo, Product::class, 'product', 'id')]
   public null|Product $Product = null;
}
```

`namespace Shop\Models;` mirrors the folder — that is how Bootgly autoloads your classes.

  </d-block-step>

  <d-block-step title="Write the cart">

The cart is a small class of its own, rebuilt from the session on every request and saved back as a plain array. Money is handled in integer cents — `parse()` and `format()` convert to and from the `DECIMAL` strings — so totals never drift:

**File** `projects/Shop/Cart.php`

```php :filename="projects/Shop/Cart.php";
<?php

namespace Shop;


use function array_sum;
use function number_format;
use function round;


/**
 * The visitor's cart — product ids and quantities, kept in the session between requests.
 */
class Cart
{
   // * Config
   /** @var array<int,int> product id → quantity */
   public private(set) array $lines = [];

   // * Metadata
   /** Items in the cart, all lines summed. */
   public int $count {
      get => array_sum($this->lines);
   }


   /**
    * @param array<int|string,int|string> $lines As the session gives them back
    */
   public function __construct (array $lines = [])
   {
      foreach ($lines as $product => $quantity) {
         $this->add((int) $product, (int) $quantity);
      }
   }

   /**
    * Add a quantity of one product — quantities of the same product merge.
    */
   public function add (int $product, int $quantity = 1): static
   {
      // ?
      if ($product < 1 || $quantity < 1) {
         return $this;
      }

      $this->lines[$product] = ($this->lines[$product] ?? 0) + $quantity;

      return $this;
   }

   /**
    * Drop one product, whatever its quantity.
    */
   public function remove (int $product): static
   {
      unset($this->lines[$product]);

      return $this;
   }

   /**
    * Drop every line.
    */
   public function clear (): static
   {
      $this->lines = [];

      return $this;
   }

   /**
    * Sum the cart in cents, given each product's price.
    *
    * @param array<int,string> $prices product id → price ("19.90")
    */
   public function sum (array $prices): int
   {
      $cents = 0;

      foreach ($this->lines as $product => $quantity) {
         $cents += self::parse($prices[$product] ?? '0') * $quantity;
      }

      return $cents;
   }

   /**
    * Parse a decimal price ("19.90") into cents (1990) — integer money, no float drift.
    */
   public static function parse (string $price): int
   {
      return (int) round((float) $price * 100);
   }

   /**
    * Format cents back into a decimal string (1990 → "19.90").
    */
   public static function format (int $cents): string
   {
      return number_format($cents / 100, 2, '.', '');
   }
}
```

  </d-block-step>

  <d-block-step title="Write the controllers">

Controllers are plural nouns; their actions are single-word verbs receiving `(Request, Response)`, and a fresh instance is built per request. `Products::list` hands a repository and an ordered selection to `paginate()`, which reads `?page` and `?limit` from the query string and sets the `X-Total-Count` and `Link` headers:

**File** `projects/Shop/Controllers/Products.php`

```php :filename="projects/Shop/Controllers/Products.php";
<?php

namespace Shop\Controllers;


use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CSRF;
use Shop\Cart;
use Shop\Models\Product;
use Web\App\Controller;


class Products extends Controller
{
   public function list (Request $Request, Response $Response): Response
   {
      // @ Paginated by the core — `?page` and `?limit` come from the query string, the
      //   rows hydrate as Product models, X-Total-Count and Link headers are set
      $Repository = $Response->Database->map(Product::class);
      $Selection = $Repository->select()
         ->order(Orders::Asc, new Identifier('name'));
      $page = $Response->Database->paginate($Repository, $Selection);

      return $this->render('products/list', [
         'Products' => $page['items'],
         'page' => $page['page'],
         'pages' => $page['pages'],
         'limit' => $page['limit'],
         'Cart' => new Cart($Request->Session->get('cart', [])),
         'flash' => $Request->Session->pull('flash'),
         // ! Per-render masked CSRF token for the "Add to cart" forms
         'token' => CSRF::mask((string) $Request->Session->get('_csrf_token', ''))
      ]);
   }
}
```

`Carts` shows the three ways to query. `show` builds a `SELECT … WHERE id IN (…)` with the Query Builder and reads plain rows; `add` runs raw SQL — on MySQL the placeholders are `?` — and every write is a POST, so the CSRF middleware checks the token:

**File** `projects/Shop/Controllers/Carts.php`

```php :filename="projects/Shop/Controllers/Carts.php";
<?php

namespace Shop\Controllers;


use function array_keys;
use function max;

use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CSRF;
use Shop\Cart;
use Web\App\Controller;


class Carts extends Controller
{
   public function show (Request $Request, Response $Response): Response
   {
      $Cart = new Cart($Request->Session->get('cart', []));
      $lines = [];
      $prices = [];

      // @ The products in the cart — one query through the Builder, rows as arrays
      if ($Cart->lines !== []) {
         $Result = $Response->Database->fetch(
            $Response->Database->table(new Identifier('products'))
               ->select(new Identifier('id'), new Identifier('name'), new Identifier('price'))
               ->filter(new Identifier('id'), Operators::In, array_keys($Cart->lines))
         );

         foreach ($Result->rows as $product) {
            $quantity = $Cart->lines[$product['id']];
            $prices[$product['id']] = $product['price'];
            $lines[] = [
               'id' => $product['id'],
               'name' => $product['name'],
               'price' => $product['price'],
               'quantity' => $quantity,
               'subtotal' => Cart::format(Cart::parse($product['price']) * $quantity)
            ];
         }
      }

      return $this->render('cart/show', [
         'lines' => $lines,
         'total' => Cart::format($Cart->sum($prices)),
         'flash' => $Request->Session->pull('flash'),
         'token' => CSRF::mask((string) $Request->Session->get('_csrf_token', ''))
      ]);
   }

   public function add (Request $Request, Response $Response): Response
   {
      $product = (int) ($Request->fields['product'] ?? 0);
      $quantity = max(1, (int) ($Request->fields['quantity'] ?? 1));

      // ? The product must exist and be in stock — raw SQL takes MySQL's `?` placeholders
      $Result = $Response->Database->fetch('SELECT name, stock FROM products WHERE id = ?', [$product]);

      if ($Result->empty === true) {
         $Request->Session->set('flash', 'That product does not exist.');

         return $this->redirect('/products', 303);
      }
      if ($Result->row['stock'] < 1) {
         $Request->Session->set('flash', "{$Result->row['name']} is sold out.");

         return $this->redirect('/products', 303);
      }

      // @ The cart lives in the session as a plain array
      $Cart = new Cart($Request->Session->get('cart', []));
      $Cart->add($product, $quantity);
      $Request->Session->set('cart', $Cart->lines);
      $Request->Session->set('flash', "{$Result->row['name']} added to your cart.");

      // : POST → 303 See Other
      return $this->redirect('/products', 303);
   }

   public function remove (Request $Request, Response $Response): Response
   {
      $Cart = new Cart($Request->Session->get('cart', []));
      $Cart->remove((int) ($Request->fields['product'] ?? 0));
      $Request->Session->set('cart', $Cart->lines);

      return $this->redirect('/cart', 303);
   }

   public function clear (Request $Request, Response $Response): Response
   {
      $Request->Session->forget('cart');

      return $this->redirect('/cart', 303);
   }
}
```

`Orders::list` paginates the same way (newest first) and the view shows the page it gets — ten orders by default; `?page=2` reaches the rest, and the `Link` header says so. `Orders::create` is the heart of the store. Everything between the stock check and the stock update happens inside `transact()`: the products are read with `FOR UPDATE`, so a concurrent checkout waits for this one to commit; throwing rolls everything back (the refusal becomes a flash message); the order's id comes from `Result->inserted` (MySQL's `LAST_INSERT_ID`); the items go in one multi-row `INSERT`. `show` loads the order with its items through the ORM, then the items' products as one explicit batch:

**File** `projects/Shop/Controllers/Orders.php`

```php :filename="projects/Shop/Controllers/Orders.php";
<?php

namespace Shop\Controllers;


use const FILTER_VALIDATE_EMAIL;
use function array_fill;
use function array_keys;
use function array_map;
use function array_values;
use function count;
use function filter_var;
use function mb_strlen;
use function trim;
use DomainException;

use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Locks;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders as Sorting;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Transaction;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CSRF;
use Shop\Cart;
use Shop\Models\Order;
use Shop\Models\OrderItem;
use Web\App\Controller;


class Orders extends Controller
{
   public function list (Request $Request, Response $Response): Response
   {
      // @ Newest first, paginated
      $Repository = $Response->Database->map(Order::class);
      $Selection = $Repository->select()
         ->order(Sorting::Desc, new Identifier('id'));
      $page = $Response->Database->paginate($Repository, $Selection);

      return $this->render('orders/list', [
         'Orders' => $page['items'],
         'flash' => $Request->Session->pull('flash')
      ]);
   }

   public function create (Request $Request, Response $Response): Response
   {
      $Cart = new Cart($Request->Session->get('cart', []));

      // ? Nothing to check out
      if ($Cart->lines === []) {
         $Request->Session->set('flash', 'Your cart is empty.');

         return $this->redirect('/products', 303);
      }

      // ?: GET — the checkout form
      if ($Request->method === 'GET') {
         return $this->render('orders/create', [
            'count' => $Cart->count,
            'flash' => $Request->Session->pull('flash'),
            'token' => CSRF::mask((string) $Request->Session->get('_csrf_token', ''))
         ]);
      }

      // @ POST — validate
      $customer = trim((string) ($Request->fields['customer'] ?? ''));
      $email = trim((string) ($Request->fields['email'] ?? ''));

      // ?
      if (
         $customer === '' || mb_strlen($customer) > 80
         || mb_strlen($email) > 120 || filter_var($email, FILTER_VALIDATE_EMAIL) === false
      ) {
         $Request->Session->set('flash', 'A name (up to 80 characters) and a valid e-mail (up to 120) are required.');

         return $this->redirect('/orders/create', 303);
      }

      try {
         // @ One transaction: lock the products, check the stock, write the order and its
         //   items, decrement the stock — all of it or none of it
         $id = $Response->Database->transact(function (Transaction $Transaction, Database $Database) use ($Cart, $customer, $email): int {
            // @ SELECT … FOR UPDATE — nobody else sells these rows until this commits
            $Result = $Database->fetch(
               $Database->table(new Identifier('products'))
                  ->select(new Identifier('id'), new Identifier('name'), new Identifier('price'), new Identifier('stock'))
                  ->filter(new Identifier('id'), Operators::In, array_keys($Cart->lines))
                  ->lock(Locks::Update)
            );

            $prices = [];
            foreach ($Result->rows as $product) {
               // ? Not enough stock — throwing rolls the transaction back
               if ($product['stock'] < $Cart->lines[$product['id']]) {
                  throw new DomainException("Only {$product['stock']} × {$product['name']} left — adjust your cart.");
               }

               $prices[$product['id']] = $product['price'];
            }
            // ? A product that no longer exists
            if (count($prices) !== count($Cart->lines)) {
               throw new DomainException('A product in your cart no longer exists.');
            }

            // @ The order — `inserted` is MySQL's LAST_INSERT_ID
            $order = (int) $Database->fetch(
               $Database->table(new Identifier('orders'))
                  ->insert()
                  ->set(new Identifier('customer'), $customer)
                  ->set(new Identifier('email'), $email)
                  ->set(new Identifier('total'), Cart::format($Cart->sum($prices)))
            )->inserted;

            // @ The items — one multi-row INSERT: every set() carries one value per line
            $products = array_keys($Cart->lines);
            $Database->fetch(
               $Database->table(new Identifier('order_items'))
                  ->insert()
                  ->set(new Identifier('order_id'), ...array_fill(0, count($products), $order))
                  ->set(new Identifier('product_id'), ...$products)
                  ->set(new Identifier('quantity'), ...array_values($Cart->lines))
                  ->set(new Identifier('price'), ...array_map(fn (int $product): string => $prices[$product], $products))
            );

            // @ The stock — the rows are still locked, so the arithmetic is safe
            foreach ($Result->rows as $product) {
               $Database->fetch(
                  $Database->table(new Identifier('products'))
                     ->update()
                     ->set(new Identifier('stock'), $product['stock'] - $Cart->lines[$product['id']])
                     ->filter(new Identifier('id'), Operators::Equal, $product['id'])
               );
            }

            // : The new order id — transact() commits when the callback returns
            return $order;
         });
      }
      catch (DomainException $Refusal) {
         $Request->Session->set('flash', $Refusal->getMessage());

         return $this->redirect('/cart', 303);
      }

      $Request->Session->forget('cart');
      $Request->Session->set('flash', "Thank you, {$customer}! Order #{$id} is on its way.");

      // : POST → 303 See Other
      return $this->redirect("/orders/{$id}", 303);
   }

   public function show (Request $Request, Response $Response): Response
   {
      $id = (int) $this->Route->Params->id;

      // @ The order with its items — `load('Items')` is one extra query for the relation
      $Repository = $Response->Database->map(Order::class);
      $Selection = $Repository->select()
         ->filter(new Identifier('id'), Operators::Equal, $id)
         ->load('Items');
      $Order = $Repository->hydrate($Response->Database->await($Repository->fetch($Selection)))->entity;

      // ?
      if ($Order === null) {
         $Response->View->render('errors/404');

         return $Response->code(404);
      }

      // @ Second level — the products behind the items, one explicit batch: load → await → attach
      $ItemRepository = $Response->Database->map(OrderItem::class);
      foreach ($ItemRepository->load($Order->Items, ['Product']) as $relation => $Batch) {
         $ItemRepository->attach($Order->Items, $relation, $Response->Database->await($Batch));
      }

      return $this->render('orders/show', [
         'Order' => $Order,
         'flash' => $Request->Session->pull('flash')
      ]);
   }
}
```

  </d-block-step>

  <d-block-step title="Write the routes">

The router manifest names the active route sets. `Controllers::map()` expands the resource routes — `list` for the products; `list`, `create` and `show` for the orders — and the cart's actions are mapped one by one with `Action`, the same dispatcher `map()` uses:

**File** `projects/Shop/router/router.index.php`

```php :filename="projects/Shop/router/router.index.php";
<?php

return [
   'Shop'
];
```

**File** `projects/Shop/router/routes/Shop.routes.php`

```php :filename="projects/Shop/router/routes/Shop.routes.php";
<?php

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Web\API\Action;
use Web\App\Controllers;
use Web\App\Statics;

use Shop\Controllers\Carts;
use Shop\Controllers\Orders;
use Shop\Controllers\Products;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   // * Products — GET /products (list)
   yield from Controllers::map($Router, '/products', Products::class, only: ['list']);

   // * Cart — one per visitor, in the session; the writes are POSTs (CSRF-checked)
   yield $Router->route('/cart', new Action(Carts::class, 'show'), GET);
   yield $Router->route('/cart/add', new Action(Carts::class, 'add'), POST);
   yield $Router->route('/cart/remove', new Action(Carts::class, 'remove'), POST);
   yield $Router->route('/cart/clear', new Action(Carts::class, 'clear'), POST);

   // * Orders — GET /orders (list), GET /orders/create + POST /orders (create), GET /orders/:id (show)
   yield from Controllers::map($Router, '/orders', Orders::class, only: ['list', 'create', 'show']);

   // * Commons
   yield $Router->route('/', function (Request $Request, Response $Response) {
      return $Response->redirect('/products', 307);
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

Views are PHP templates in `views/`; `views/layouts/main.template.php` wraps every render and `@yield content;` is where the view goes. Every form carries the hidden `_token` the CSRF middleware checks:

**File** `projects/Shop/views/layouts/main.template.php`

```php :filename="projects/Shop/views/layouts/main.template.php";
<!DOCTYPE html>
<html lang="en">
<head>
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <title>Shop</title>
   <link rel="stylesheet" href="/statics/shop.css">
</head>
<body>
   <header>
      <strong>Shop</strong>
      <nav>
         <a href="/products">Products</a>
         <a href="/cart">Cart</a>
         <a href="/orders">Orders</a>
      </nav>
   </header>
   <main>
      @yield content;
   </main>
   <footer>Powered by the Bootgly Web platform</footer>
</body>
</html>
```

**File** `projects/Shop/views/products/list.template.php`

```php :filename="projects/Shop/views/products/list.template.php";
<h1>Products</h1>

<?php if ($flash !== null): ?>
<p class="flash"><?= htmlspecialchars((string) $flash) ?></p>
<?php endif; ?>

<p class="cart"><?= $Cart->count ?> item(s) in your <a href="/cart">cart</a>.</p>

<?php foreach ($Products as $Product): ?>
<article>
   <h2><?= htmlspecialchars($Product->name) ?></h2>
   <p class="price">$<?= htmlspecialchars($Product->price) ?></p>
   <?php if ($Product->stock > 0): ?>
   <form method="post" action="/cart/add">
      <input type="hidden" name="_token" value="<?= htmlspecialchars((string) $token) ?>">
      <input type="hidden" name="product" value="<?= $Product->id ?>">
      <label>Qty <input type="number" name="quantity" value="1" min="1" max="<?= $Product->stock ?>"></label>
      <button type="submit">Add to cart</button>
   </form>
   <p class="stock"><?= $Product->stock ?> in stock</p>
   <?php else: ?>
   <p class="stock sold">Sold out</p>
   <?php endif; ?>
</article>
<?php endforeach; ?>

<?php if ($pages > 1): ?>
<nav class="pages">
   <?php for ($i = 1; $i <= $pages; $i++): ?>
   <a href="/products?page=<?= $i ?>&amp;limit=<?= $limit ?>"<?= $i === $page ? ' class="current"' : '' ?>><?= $i ?></a>
   <?php endfor; ?>
</nav>
<?php endif; ?>
```

**File** `projects/Shop/views/cart/show.template.php`

```php :filename="projects/Shop/views/cart/show.template.php";
<h1>Your cart</h1>

<?php if ($flash !== null): ?>
<p class="flash"><?= htmlspecialchars((string) $flash) ?></p>
<?php endif; ?>

<?php if ($lines === []): ?>
<p class="empty">Your cart is empty — <a href="/products">pick something</a>.</p>
<?php else: ?>
<table>
   <thead>
      <tr><th>Product</th><th>Price</th><th>Qty</th><th>Subtotal</th><th></th></tr>
   </thead>
   <tbody>
   <?php foreach ($lines as $line): ?>
      <tr>
         <td><?= htmlspecialchars($line['name']) ?></td>
         <td>$<?= htmlspecialchars($line['price']) ?></td>
         <td><?= $line['quantity'] ?></td>
         <td>$<?= $line['subtotal'] ?></td>
         <td>
            <form method="post" action="/cart/remove">
               <input type="hidden" name="_token" value="<?= htmlspecialchars((string) $token) ?>">
               <input type="hidden" name="product" value="<?= $line['id'] ?>">
               <button type="submit" class="secondary">Remove</button>
            </form>
         </td>
      </tr>
   <?php endforeach; ?>
   </tbody>
   <tfoot>
      <tr><th colspan="3">Total</th><th>$<?= $total ?></th><th></th></tr>
   </tfoot>
</table>

<div class="actions">
   <a class="button" href="/orders/create">Checkout</a>
   <form method="post" action="/cart/clear">
      <input type="hidden" name="_token" value="<?= htmlspecialchars((string) $token) ?>">
      <button type="submit" class="secondary">Empty the cart</button>
   </form>
</div>
<?php endif; ?>
```

**File** `projects/Shop/views/orders/create.template.php`

```php :filename="projects/Shop/views/orders/create.template.php";
<h1>Checkout</h1>

<?php if ($flash !== null): ?>
<p class="flash"><?= htmlspecialchars((string) $flash) ?></p>
<?php endif; ?>

<p><?= $count ?> item(s) from <a href="/cart">your cart</a>.</p>

<form method="post" action="/orders">
   <input type="hidden" name="_token" value="<?= htmlspecialchars((string) $token) ?>">
   <label>
      Name
      <input type="text" name="customer" maxlength="80" required>
   </label>
   <label>
      E-mail
      <input type="email" name="email" maxlength="120" required>
   </label>
   <button type="submit">Place the order</button>
</form>
```

**File** `projects/Shop/views/orders/show.template.php`

```php :filename="projects/Shop/views/orders/show.template.php";
<h1>Order #<?= $Order->id ?></h1>

<?php if ($flash !== null): ?>
<p class="flash"><?= htmlspecialchars((string) $flash) ?></p>
<?php endif; ?>

<p><?= htmlspecialchars($Order->customer) ?> &lt;<?= htmlspecialchars($Order->email) ?>&gt; — <?= $Order->created?->format('Y-m-d H:i') ?></p>

<table>
   <thead>
      <tr><th>Product</th><th>Price</th><th>Qty</th><th>Subtotal</th></tr>
   </thead>
   <tbody>
   <?php foreach ($Order->Items as $Item): ?>
      <tr>
         <td><?= htmlspecialchars($Item->Product?->name ?? "#{$Item->product}") ?></td>
         <td>$<?= htmlspecialchars($Item->price) ?></td>
         <td><?= $Item->quantity ?></td>
         <td>$<?= number_format((float) $Item->price * $Item->quantity, 2, '.', '') ?></td>
      </tr>
   <?php endforeach; ?>
   </tbody>
   <tfoot>
      <tr><th colspan="3">Total</th><th>$<?= htmlspecialchars($Order->total) ?></th></tr>
   </tfoot>
</table>

<p><a href="/products">Keep shopping</a> · <a href="/orders">All orders</a></p>
```

**File** `projects/Shop/views/orders/list.template.php`

```php :filename="projects/Shop/views/orders/list.template.php";
<h1>Orders</h1>

<?php if ($flash !== null): ?>
<p class="flash"><?= htmlspecialchars((string) $flash) ?></p>
<?php endif; ?>

<?php if ($Orders === []): ?>
<p class="empty">No orders yet — <a href="/products">be the first</a>.</p>
<?php else: ?>
<table>
   <thead>
      <tr><th>#</th><th>Customer</th><th>Total</th><th>Placed</th></tr>
   </thead>
   <tbody>
   <?php foreach ($Orders as $Order): ?>
      <tr>
         <td><a href="/orders/<?= $Order->id ?>">#<?= $Order->id ?></a></td>
         <td><?= htmlspecialchars($Order->customer) ?></td>
         <td>$<?= htmlspecialchars($Order->total) ?></td>
         <td><?= $Order->created?->format('Y-m-d H:i') ?></td>
      </tr>
   <?php endforeach; ?>
   </tbody>
</table>
<?php endif; ?>
```

**File** `projects/Shop/views/errors/404.template.php`

```php :filename="projects/Shop/views/errors/404.template.php";
<h1>404</h1>
<p>There is nothing here. <a href="/products">Back to the products</a>.</p>
```

**File** `projects/Shop/statics/shop.css`

```css :filename="projects/Shop/statics/shop.css";
:root {
   color-scheme: light dark;
   --accent: #16a34a;
}

body {
   font: 16px/1.6 system-ui, sans-serif;
   max-width: 44rem;
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
   display: grid;
   grid-template-columns: 1fr auto;
   gap: .25rem 1rem;
   align-items: center;
   padding: 1rem 0;
   border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent);
}

article h2 {
   margin: 0;
   font-size: 1.1rem;
}

article .price {
   margin: 0;
   font-weight: 600;
}

article form {
   grid-column: 2;
   grid-row: 1 / span 2;
   display: flex;
   gap: .5rem;
   align-items: center;
}

.stock {
   margin: 0;
   font-size: .9rem;
   opacity: .75;
}

.sold {
   grid-column: 2;
   grid-row: 1 / span 2;
   color: #dc2626;
   opacity: 1;
}

form {
   display: grid;
   gap: .75rem;
}

label {
   display: grid;
   gap: .25rem;
}

input {
   font: inherit;
   padding: .4rem;
}

input[type="number"] {
   width: 4rem;
}

button, .button {
   justify-self: start;
   padding: .5rem 1.25rem;
   background: var(--accent);
   color: white;
   border: 0;
   border-radius: .25rem;
   cursor: pointer;
   text-decoration: none;
   font: inherit;
}

button.secondary {
   background: transparent;
   color: inherit;
   border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
}

table {
   width: 100%;
   border-collapse: collapse;
   margin-bottom: 1.5rem;
}

th, td {
   text-align: left;
   padding: .5rem;
   border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
}

td form {
   display: inline;
}

.actions {
   display: flex;
   gap: 1rem;
   align-items: center;
}

.pages a {
   margin-right: .5rem;
}

.pages .current {
   font-weight: 700;
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

Start the server from the kit directory — the boot function migrates and seeds the database first, so the catalogue is full on the first request — and open <http://localhost:8081>: add a few products, look at the cart, check out, read the order:

```bash :toolbar="true";
php bootgly project Shop start
```

Port 8081 already taken? `PORT=8082 php bootgly project Shop start` — the boot function reads `PORT`; use that port in the `curl` lines below too. MySQL somewhere else? `DB_HOST=… DB_PORT=… php bootgly project Shop start`.

The server is detached, so follow its log in a second terminal — every request, and the exception report when something goes wrong (the files live in `storage/logs/`):

```bash :toolbar="true";
php bootgly project Shop logs -f
```

From a terminal, the same flow with `curl` and a cookie jar: the catalogue two pages at a time, two monitors and a mouse into the cart, the checkout, the order — then the same two monitors again, which the stock check refuses (only one is left):

```bash :toolbar="true";
curl -s -c cookies.txt -D - -o page.html "http://localhost:8081/products?limit=4" | grep -E "X-Total-Count|^Link"
token=$(grep -o 'name="_token" value="[^"]*"' page.html | head -1 | cut -d'"' -f4)
curl -s -b cookies.txt -c cookies.txt -o /dev/null -X POST http://localhost:8081/cart/add --data-urlencode "_token=$token" --data-urlencode "product=3" --data-urlencode "quantity=2"
curl -s -b cookies.txt -c cookies.txt -o /dev/null -X POST http://localhost:8081/cart/add --data-urlencode "_token=$token" --data-urlencode "product=2"
curl -s -b cookies.txt http://localhost:8081/cart | grep -E "<td>|Total"
curl -s -b cookies.txt -c cookies.txt -i -X POST http://localhost:8081/orders --data-urlencode "_token=$token" --data-urlencode "customer=Ada" --data-urlencode "email=ada@example.com" | grep -E "^HTTP|^Location"
curl -s -b cookies.txt http://localhost:8081/orders/1 | grep -E "flash|<td>|Total"
curl -s -b cookies.txt -c cookies.txt -o /dev/null -X POST http://localhost:8081/cart/add --data-urlencode "_token=$token" --data-urlencode "product=3" --data-urlencode "quantity=2"
curl -s -b cookies.txt -c cookies.txt -i -X POST http://localhost:8081/orders --data-urlencode "_token=$token" --data-urlencode "customer=Ada" --data-urlencode "email=ada@example.com" | grep -E "^HTTP|^Location"
curl -s -b cookies.txt http://localhost:8081/cart | grep flash
```

```text
X-Total-Count: 6
Link: </products?limit=4&page=2>; rel="next"
         <td>Mouse</td>
         <td>$19.90</td>
         <td>1</td>
         <td>$19.90</td>
         <td>
         <td>Monitor</td>
         <td>$229.00</td>
         <td>2</td>
         <td>$458.00</td>
         <td>
      <tr><th colspan="3">Total</th><th>$477.90</th><th></th></tr>
HTTP/1.1 303 See Other
Location: /orders/1
<p class="flash">Thank you, Ada! Order #1 is on its way.</p>
         <td>Monitor</td>
         <td>$229.00</td>
         <td>2</td>
         <td>$458.00</td>
         <td>Mouse</td>
         <td>$19.90</td>
         <td>1</td>
         <td>$19.90</td>
      <tr><th colspan="3">Total</th><th>$477.90</th></tr>
HTTP/1.1 303 See Other
Location: /cart
<p class="flash">Only 1 × Monitor left — adjust your cart.</p>
```

The refused checkout wrote nothing: the exception thrown inside `transact()` rolled the transaction back before the flash was set. Stop the server when you are done; the container keeps the data (`docker stop shop-mysql` pauses it, `docker start shop-mysql` brings it back) — or remove it:

```bash :toolbar="true";
php bootgly project Shop stop
docker rm -f shop-mysql
```

  </d-block-step>

  <d-block-step title="Test it">

A project carries its own suites. Replace the scaffolded registry so it lists a `Project` suite with two tests — the signature contract and the cart's arithmetic, a pure unit test that needs no server and no database:

**File** `projects/Shop/tests/autoboot.php`

```php :filename="projects/Shop/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/project/',
   ]
);
```

**File** `projects/Shop/tests/project/autoboot.php`

```php :filename="projects/Shop/tests/project/autoboot.php";
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
      '1.2-cart',
   ]
);
```

**File** `projects/Shop/tests/project/1.1-signature.Test.php`

```php :filename="projects/Shop/tests/project/1.1-signature.Test.php";
<?php

use Bootgly\ACI\Tests\Suite\Test;
use Bootgly\API\Projects\Project;


return new Test(
   description: 'Project signature: metadata contract',
   test: function () {
      $Project = include __DIR__ . '/../../Shop.Project.php';

      yield assert(
         assertion: $Project instanceof Project,
         description: 'the signature file returns a Project'
      );
      yield assert(
         assertion: $Project->name === 'Shop',
         description: 'name'
      );
      yield assert(
         assertion: $Project->exportable === true,
         description: 'exportable — listed by the import picker'
      );
   }
);
```

**File** `projects/Shop/tests/project/1.2-cart.Test.php`

```php :filename="projects/Shop/tests/project/1.2-cart.Test.php";
<?php

use Bootgly\ACI\Tests\Suite\Test;

use Shop\Cart;


return new Test(
   description: 'Cart: lines, count and integer money',
   test: function () {
      // ! As the session gives the lines back: string keys and values — and junk, once
      $Cart = new Cart(['3' => '2', 'abc' => 5]);
      $Cart->add(5)->add(5)->add(0)->add(7, 0);

      yield assert(
         assertion: $Cart->lines === [3 => 2, 5 => 2],
         description: 'add() merges quantities and ignores invalid ids and quantities'
      );
      yield assert(
         assertion: $Cart->count === 4,
         description: 'count is the number of items across the lines'
      );
      yield assert(
         assertion: $Cart->sum([3 => '19.90', 5 => '0.10']) === 4000,
         description: 'sum() is in cents — 2 × 19.90 + 2 × 0.10'
      );
      yield assert(
         assertion: Cart::parse('229.00') === 22900 && Cart::format(4000) === '40.00' && Cart::format(123456) === '1234.56',
         description: 'parse() and format() round-trip a decimal price — no thousands separator, DECIMAL takes it as is'
      );

      $Cart->remove(3);

      yield assert(
         assertion: $Cart->lines === [5 => 2],
         description: 'remove() drops the whole line'
      );
      yield assert(
         assertion: $Cart->clear()->lines === [] && $Cart->count === 0,
         description: 'clear() empties the cart'
      );
   }
);
```

Run the project's suites from inside the project directory — the launcher is two levels up, in the kit root:

```bash :toolbar="true";
cd projects/Shop && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Next steps

- Let the shopper change quantities in the cart: a `POST /cart/update` action on `Carts` that rewrites the line — the `max` attribute on the quantity input already knows the stock.
- Read the stock from the models too: `$Response->Database->map(Product::class)->find($id)` returns an operation; `hydrate()` it into a `Product` like `Orders::show` does with the order.
- Switch the database: `DB_CONNECTION=pgsql` with a `Connections->PostgreSQL` block moves the Builder, the migrations and the ORM over untouched — the two dialect-specific spots are the raw `?` placeholders in `Carts::add` and `Result->inserted` in `Orders::create`, which become `$1` and `output(new Identifier('id'))` on PostgreSQL, as the [Polls](/cookbook/web/polls/overview/) page shows.
- Go HTTPS: hand an `AutoTLS` to the `Configs` and the server obtains a Let's Encrypt certificate on its own.

## Reference

- [Web App](/manual/Web/App/overview/) — `App`, `Configs`, `Controller`, `Controllers`, `Statics`, `Views`.
- [Database DBAL](/guide/database-dbal/overview/) — the `database` config scope, drivers, the `Database` response resource.
- [MySQL driver](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/) — native protocol, `?` placeholders, `Result->inserted`, TLS modes.
- [Query Builder](/manual/ADI/Databases/SQL/Builder/overview/) — `table()`, `select()`, `filter()`, `lock()`, `upsert()` and the enums.
- [Database ORM](/guide/database-orm/overview/) — `#[Table]`, `#[Key]`, `#[Column]`, `#[Relation]`, repositories, `load()`/`attach()`.
- [Database transactions](/guide/database-transactions/overview/) — `transact()`, savepoints, what rolls back and what commits.
- [Database migrations](/guide/database-migrations/overview/) — `Migration`, `Blueprint`, `reference()`, types and the runner.
- [Database seeders](/guide/database-seeders/overview/) — `Seeder`, the runner and the lock.
- [Router](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/) — route sets, parameters, the middlewares (CSRF among them).
- [Testing](/testing/about/testing/overview/) — suites, the Basic and Advanced assertion APIs and `bootgly test`.
