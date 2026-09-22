# Construa um Web App em MySQL

Construa o **Shop**, uma pequena loja em MySQL: um catálogo de produtos com paginação, um carrinho guardado na sessão, um checkout que grava o pedido e seus itens em **uma transação** — com bloqueio de linhas, para que dois compradores não levem a última unidade — e uma página de pedido que carrega as relações pelo ORM. O MySQL roda em um container que você sobe com um comando; o Bootgly fala com ele nativamente, sem extensão PHP envolvida. O shell **App** da plataforma Web traz o servidor HTTP, a pilha de middlewares (cabeçalhos seguros, ids de requisição, parsing do corpo, CSRF), sessões, controllers, views e arquivos estáticos; você escreve a loja.

Você vai escrever 26 arquivos curtos (cerca de uma hora) e aprender como um `Web\App` se conecta ao MySQL, como migrations declaram chaves estrangeiras e dinheiro em `DECIMAL`, como um seeder faz upsert, como models do ORM declaram relações e as carregam, como o Query Builder, o SQL raw e o `transact()` se encaixam, como o core pagina e como um projeto é testado com `bootgly test`.

```text
$ curl -s -b cookies.txt -c cookies.txt -i -X POST http://localhost:8081/orders \
     --data-urlencode "_token=$token" --data-urlencode "customer=Ada" --data-urlencode "email=ada@example.com" | grep -E "^HTTP|^Location"
HTTP/1.1 303 See Other
Location: /cart
$ curl -s -b cookies.txt http://localhost:8081/cart | grep flash
<p class="flash">Only 1 × Monitor left — adjust your cart.</p>
```

<d-block-stepper>
  <d-block-step title="Instale o Bootgly">

Um comando instala tudo no Linux (ou WSL2): ele verifica **git** e **PHP 8.4+** (com as extensões que os recursos embutidos do Bootgly usam), oferece instalar o que faltar pelo seu gerenciador de pacotes e clona o Bootgly Kit em `./bootgly.kit`. `--no-wizard` pula o wizard interativo de projetos — um passo adiante cria o projeto com um comando explícito.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash -s -- --no-wizard
cd bootgly.kit
```

> [!TIP]
> O instalador também pergunta se deve instalar o comando `bootgly` globalmente — qualquer resposta serve, todas as páginas aqui usam `php bootgly …`. Já tem um kit? O instalador retoma o que encontrar em `./bootgly.kit` e oferece movê-lo para a release atual — aceite, estas páginas assumem a 1.0.2 ou mais nova — depois entre nele com `cd` e vá para o próximo passo. Todos os comandos abaixo rodam da pasta do kit como `php bootgly …` — se você instalou a CLI globalmente (`php bootgly setup`), `bootgly …` também funciona. O guia [Começando](/guide/getting-started/overview/) explica o instalador e a estrutura do kit.

  </d-block-step>

  <d-block-step title="Suba o MySQL">

A loja precisa de um servidor MySQL. O mais rápido é a imagem oficial em um container — um banco `shop` do usuário `shop`, senha `secret`, na porta padrão:

```bash :toolbar="true";
docker run --name shop-mysql -e MYSQL_ROOT_PASSWORD=secret -e MYSQL_DATABASE=shop -e MYSQL_USER=shop -e MYSQL_PASSWORD=secret -p 3306:3306 -d mysql:8
```

O MySQL leva alguns segundos para inicializar na primeira subida. Este laço retorna assim que o servidor aceita conexões na porta — rode-o antes de seguir, ou o projeto tentaria migrar um banco que ainda não existe. Ele fica quieto enquanto o MySQL inicializa; se continuar imprimindo erros por mais de um minuto, o container não subiu (`docker ps -a`, `docker logs shop-mysql` — um MySQL já na porta 3306 é o motivo usual):

```bash :toolbar="true";
until docker exec -e MYSQL_PWD=secret shop-mysql mysqladmin ping -h 127.0.0.1 -u shop --silent; do sleep 1; done
```

> [!NOTE]
> O Docker é a única coisa que esta página assume além do instalador (no Linux, seu usuário precisa estar no grupo `docker`, ou prefixe os dois comandos com `sudo`). Já tem um servidor MySQL? Pule o container e aponte o projeto para ele com variáveis de ambiente na hora de iniciar: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASS` — a configuração de banco que você escreve daqui a pouco as lê. O driver MySQL do Bootgly é nativo: ele fala o protocolo de rede sozinho (`caching_sha2_password` incluído), então nenhuma extensão `mysqli` ou PDO é necessária.

  </d-block-step>

  <d-block-step title="Crie o projeto">

Crie um projeto **WPI** (web) chamado `Shop` na plataforma **Web**, na porta 8081. Na primeira execução isso também configura a plataforma (o submódulo git e os exemplos embarcados — `Demo/Blog` é a referência MVC), então leva um momento:

```bash :toolbar="true";
php bootgly projects create Shop --platform=web --interfaces=WPI --port=8081 --yes
```

O projeto nasce em `projects/Shop/` como um repositório git próprio (o scaffold vira o primeiro commit assim que o git souber seu nome e e-mail) — `Shop.Project.php` (a assinatura), um `router/` com um conjunto de rotas de boas-vindas, `schedule.php` e `tests/`. Você vai substituir a assinatura e o manifesto do router, adicionar um conjunto de rotas `Shop.routes.php` (apague `Welcome.routes.php` se quiser); o próximo passo cria todas as pastas de uma vez. Tudo vai dentro de `projects/Shop/`.

  </d-block-step>

  <d-block-step title="Crie as pastas">

Todas as pastas em que os próximos passos escrevem, em um comando — daqui em diante você só cria arquivos e cola o conteúdo deles. Rode da pasta do kit (`mkdir -p` não mexe nas pastas que o scaffold já criou):

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

  <d-block-step title="Escreva a assinatura do projeto">

Substitua o `Shop.Project.php` gerado. A função `boot` monta um handle de banco a partir do escopo de configuração `database` do próprio projeto — o mesmo arquivo que o recurso de resposta `Database` lê, então as configurações de conexão vivem em um só lugar — roda as migrations e os seeders antes de o servidor bifurcar e então inicia um `Web\App` com dois workers:

**Arquivo** `projects/Shop/Shop.Project.php`

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

`Modes::Daemon` desprende o servidor do seu terminal (`php bootgly project Shop stop` o para); `-f` o mantém em primeiro plano com os logs à sua frente. Cada worker mantém o próprio pool de conexões MySQL; o pool é criado sob demanda, na primeira requisição que o worker atende.

  </d-block-step>

  <d-block-step title="Configure o banco de dados">

O escopo `database` declara a conexão MySQL, cada valor vinculado a uma variável de ambiente com as credenciais do container como padrão:

**Arquivo** `projects/Shop/configs/database/database.Config.php`

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

> [!NOTE]
> O bloco `Secure` mantém esta página funcionando em todas as releases que ela cobre. A imagem do MySQL habilita TLS com um certificado autoassinado: até a 1.0.2, o driver do Bootgly verificava certificados mesmo no modo padrão `prefer`, então sem `DB_SSLMODE=disable` a primeira conexão falhava com `certificate verify failed`. Desde a 1.0.3, o `prefer` cifra sem verificar — como no libpq e no MySQL — e o bloco é opcional. Em um servidor real mantenha o TLS ligado e verificado: `DB_SSLMODE=verify-full` com `DB_SSLCAFILE` apontando para o certificado da CA do servidor.

  </d-block-step>

  <d-block-step title="Escreva as migrations">

As migrations vivem em `database/migrations/` e rodam na ordem dos arquivos. A primeira cria `products` — `DECIMAL(10,2)` para o preço, porque dinheiro nunca é float:

**Arquivo** `projects/Shop/database/migrations/20260922000000_create_products.php`

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

A segunda cria `orders` e `order_items` juntas — uma migration pode retornar uma lista de queries, aplicadas em ordem (o MySQL confirma DDL conforme executa, então uma instrução que falha deixa as anteriores no lugar; PostgreSQL e SQLite desfazem a lista como uma só). `reference()` declara as chaves estrangeiras, e o item guarda o preço pelo qual foi vendido:

**Arquivo** `projects/Shop/database/migrations/20260922000001_create_orders.php`

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

  <d-block-step title="Escreva o seeder">

Os seeders vivem em `database/seeders/` e rodam a **cada** subida — o runner não guarda um registro de seeders aplicados (o arquivo de trava só impede duas execuções simultâneas), e é exatamente por isso que este usa `upsert()` no id: um `INSERT` de várias linhas — cada `set()` carrega um valor por linha — que atualiza em vez de falhar quando as linhas já existem (`ON DUPLICATE KEY UPDATE` no MySQL). Reiniciar, portanto, repõe as prateleiras nos valores da semente (os pedidos ficam). A webcam começa esgotada de propósito:

**Arquivo** `projects/Shop/database/seeders/products.php`

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

  <d-block-step title="Escreva os models">

Um model do ORM é uma classe comum com atributos: `#[Table]` nomeia a tabela, `#[Key]` a chave primária gerada, `#[Column]` mapeia uma propriedade (com o nome da coluna quando difere) e `#[Relation]` declara como dois models se conectam — `HasMany` do `id` do pedido para a propriedade `order` do item, `BelongsTo` da propriedade `product` do item para o `id` do produto. Colunas `DECIMAL` hidratam como strings e colunas `TIMESTAMP` como `DateTimeImmutable`:

**Arquivo** `projects/Shop/Models/Product.php`

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

**Arquivo** `projects/Shop/Models/Order.php`

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

**Arquivo** `projects/Shop/Models/OrderItem.php`

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

`namespace Shop\Models;` espelha a pasta — é assim que o Bootgly carrega suas classes.

  </d-block-step>

  <d-block-step title="Escreva o carrinho">

O carrinho é uma pequena classe própria, reconstruída a partir da sessão a cada requisição e gravada de volta como um array simples. O dinheiro é tratado em centavos inteiros — `parse()` e `format()` convertem de e para as strings `DECIMAL` — então os totais nunca desviam:

**Arquivo** `projects/Shop/Cart.php`

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

  <d-block-step title="Escreva os controllers">

Controllers são substantivos no plural; suas ações são verbos de uma palavra que recebem `(Request, Response)`, e uma instância nova é construída a cada requisição. `Products::list` entrega um repositório e uma seleção ordenada ao `paginate()`, que lê `?page` e `?limit` da query string e define os cabeçalhos `X-Total-Count` e `Link`:

**Arquivo** `projects/Shop/Controllers/Products.php`

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

`Carts` mostra as três formas de consultar. `show` monta um `SELECT … WHERE id IN (…)` com o Query Builder e lê linhas simples; `add` roda SQL raw — no MySQL os placeholders são `?` — e toda escrita é um POST, então o middleware CSRF confere o token:

**Arquivo** `projects/Shop/Controllers/Carts.php`

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

`Orders::list` pagina do mesmo jeito (mais novos primeiro) e a view mostra a página que recebe — dez pedidos por padrão; `?page=2` alcança o resto, e o cabeçalho `Link` diz isso. `Orders::create` é o coração da loja. Tudo entre a checagem e a atualização do estoque acontece dentro do `transact()`: os produtos são lidos com `FOR UPDATE`, então um checkout concorrente espera este confirmar; lançar uma exceção desfaz tudo (a recusa vira uma mensagem flash); o id do pedido vem de `Result->inserted` (o `LAST_INSERT_ID` do MySQL); os itens entram em um `INSERT` de várias linhas. `show` carrega o pedido com seus itens pelo ORM e, depois, os produtos dos itens em um lote explícito:

**Arquivo** `projects/Shop/Controllers/Orders.php`

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

  <d-block-step title="Escreva as rotas">

O manifesto do router nomeia os conjuntos de rotas ativos. `Controllers::map()` expande as rotas de recurso — `list` para os produtos; `list`, `create` e `show` para os pedidos — e as ações do carrinho são mapeadas uma a uma com `Action`, o mesmo despachante que o `map()` usa:

**Arquivo** `projects/Shop/router/router.index.php`

```php :filename="projects/Shop/router/router.index.php";
<?php

return [
   'Shop'
];
```

**Arquivo** `projects/Shop/router/routes/Shop.routes.php`

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

  <d-block-step title="Escreva as views e a folha de estilo">

Views são templates PHP em `views/`; `views/layouts/main.template.php` envolve cada renderização e `@yield content;` é onde a view entra. Todo formulário carrega o `_token` oculto que o middleware CSRF confere:

**Arquivo** `projects/Shop/views/layouts/main.template.php`

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

**Arquivo** `projects/Shop/views/products/list.template.php`

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

**Arquivo** `projects/Shop/views/cart/show.template.php`

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

**Arquivo** `projects/Shop/views/orders/create.template.php`

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

**Arquivo** `projects/Shop/views/orders/show.template.php`

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

**Arquivo** `projects/Shop/views/orders/list.template.php`

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

**Arquivo** `projects/Shop/views/errors/404.template.php`

```php :filename="projects/Shop/views/errors/404.template.php";
<h1>404</h1>
<p>There is nothing here. <a href="/products">Back to the products</a>.</p>
```

**Arquivo** `projects/Shop/statics/shop.css`

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

  <d-block-step title="Rode">

Inicie o servidor da pasta do kit — a função de boot migra e popula o banco primeiro, então o catálogo está cheio na primeira requisição — e abra <http://localhost:8081>: adicione alguns produtos, veja o carrinho, faça o checkout, leia o pedido:

```bash :toolbar="true";
php bootgly project Shop start
```

A porta 8081 já está ocupada? `PORT=8082 php bootgly project Shop start` — a função de boot lê `PORT`; use essa porta também nas linhas de `curl` abaixo. MySQL em outro lugar? `DB_HOST=… DB_PORT=… php bootgly project Shop start`.

O servidor está desprendido, então acompanhe o log em um segundo terminal — cada requisição, e o relatório da exceção quando algo dá errado (os arquivos vivem em `storage/logs/`):

```bash :toolbar="true";
php bootgly project Shop logs -f
```

De um terminal, o mesmo fluxo com `curl` e um pote de cookies: o catálogo de quatro em quatro, dois monitores e um mouse no carrinho, o checkout, o pedido — e então os mesmos dois monitores de novo, que a checagem de estoque recusa (só resta um):

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

O checkout recusado não gravou nada: a exceção lançada dentro do `transact()` desfez a transação antes de o flash ser definido. Pare o servidor quando terminar; o container guarda os dados (`docker stop shop-mysql` o pausa, `docker start shop-mysql` o traz de volta) — ou remova-o:

```bash :toolbar="true";
php bootgly project Shop stop
docker rm -f shop-mysql
```

  </d-block-step>

  <d-block-step title="Teste">

Um projeto carrega as próprias suítes. Substitua o registro gerado para que liste uma suíte `Project` com dois testes — o contrato da assinatura e a aritmética do carrinho, um teste unitário puro que não precisa de servidor nem de banco:

**Arquivo** `projects/Shop/tests/autoboot.php`

```php :filename="projects/Shop/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/project/',
   ]
);
```

**Arquivo** `projects/Shop/tests/project/autoboot.php`

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

**Arquivo** `projects/Shop/tests/project/1.1-signature.Test.php`

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

**Arquivo** `projects/Shop/tests/project/1.2-cart.Test.php`

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

Rode as suítes do projeto de dentro da pasta do projeto — o launcher está dois níveis acima, na raiz do kit:

```bash :toolbar="true";
cd projects/Shop && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Próximos passos

- Deixe o comprador alterar quantidades no carrinho: uma ação `POST /cart/update` em `Carts` que reescreve a linha — o atributo `max` do campo de quantidade já conhece o estoque.
- Leia o estoque pelos models também: `$Response->Database->map(Product::class)->find($id)` retorna uma operação; `hydrate()` a transforma em um `Product`, como `Orders::show` faz com o pedido.
- Troque o banco: `DB_CONNECTION=pgsql` com um bloco `Connections->PostgreSQL` leva o Builder, as migrations e o ORM intactos — os dois pontos específicos de dialeto são os placeholders `?` do SQL raw em `Carts::add` e o `Result->inserted` em `Orders::create`, que viram `$1` e `output(new Identifier('id'))` no PostgreSQL, como a página do [Polls](/cookbook/web/polls/overview/) mostra.
- Vá de HTTPS: entregue um `AutoTLS` ao `Configs` e o servidor obtém um certificado Let's Encrypt sozinho.

## Referência

- [Web App](/manual/Web/App/overview/) — `App`, `Configs`, `Controller`, `Controllers`, `Statics`, `Views`.
- [Database DBAL](/guide/database-dbal/overview/) — o escopo de configuração `database`, os drivers, o recurso de resposta `Database`.
- [Driver MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/) — protocolo nativo, placeholders `?`, `Result->inserted`, modos TLS.
- [Query Builder](/manual/ADI/Databases/SQL/Builder/overview/) — `table()`, `select()`, `filter()`, `lock()`, `upsert()` e os enums.
- [Database ORM](/guide/database-orm/overview/) — `#[Table]`, `#[Key]`, `#[Column]`, `#[Relation]`, repositórios, `load()`/`attach()`.
- [Database transactions](/guide/database-transactions/overview/) — `transact()`, savepoints, o que desfaz e o que confirma.
- [Database migrations](/guide/database-migrations/overview/) — `Migration`, `Blueprint`, `reference()`, tipos e o runner.
- [Database seeders](/guide/database-seeders/overview/) — `Seeder`, o runner e a trava.
- [Router](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/) — conjuntos de rotas, parâmetros, os middlewares (CSRF entre eles).
- [Testes](/testing/about/testing/overview/) — suítes, as APIs de asserção Basic e Advanced e `bootgly test`.
