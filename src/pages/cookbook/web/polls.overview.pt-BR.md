# Construa um Web App de votação em PostgreSQL

Construa o **Polls**, um pequeno app de votação em PostgreSQL: qualquer um faz uma pergunta com duas ou três opções, cada um vota uma vez por enquete — e pode mudar de ideia, porque o voto é um **upsert** sobre um índice único — e os resultados mostram as contagens ao vivo. A enquete e suas opções são gravadas em uma transação com `RETURNING`, os timestamps são `TIMESTAMPTZ`, os models carregam as relações pelo ORM. O PostgreSQL roda em um container que você sobe com um comando; o Bootgly fala com ele nativamente, sem extensão PHP envolvida. O shell **App** da plataforma Web traz o servidor HTTP, a pilha de middlewares (cabeçalhos seguros, ids de requisição, parsing do corpo, CSRF), sessões, controllers, views e arquivos estáticos; você escreve o app.

Você vai escrever 20 arquivos curtos (uns 45 minutos) e aprender como um `Web\App` se conecta ao PostgreSQL, como uma migration declara chaves estrangeiras e um índice único composto, como um seeder mantém as sequências de identidade honestas, como models e relações do ORM funcionam, como `transact()` e `RETURNING` se encaixam, como um `INSERT … ON CONFLICT` substitui um ler-e-depois-escrever e como um projeto é testado com `bootgly test`.

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
  <d-block-step title="Instale o Bootgly">

Um comando instala tudo no Linux (ou WSL2): ele verifica **git** e **PHP 8.4+** (com as extensões que os recursos embutidos do Bootgly usam), oferece instalar o que faltar pelo seu gerenciador de pacotes e clona o Bootgly Kit em `./bootgly.kit`. `--no-wizard` pula o wizard interativo de projetos — um passo adiante cria o projeto com um comando explícito.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash -s -- --no-wizard
cd bootgly.kit
```

> [!TIP]
> O instalador também pergunta se deve instalar o comando `bootgly` globalmente — qualquer resposta serve, todas as páginas aqui usam `php bootgly …`. Já tem um kit? O instalador retoma o que encontrar em `./bootgly.kit` e oferece movê-lo para a release atual — aceite, estas páginas assumem a 1.0.2 ou mais nova — depois entre nele com `cd` e vá para o próximo passo. Todos os comandos abaixo rodam da pasta do kit como `php bootgly …` — se você instalou a CLI globalmente (`php bootgly setup`), `bootgly …` também funciona. O guia [Começando](/guide/getting-started/overview/) explica o instalador e a estrutura do kit.

  </d-block-step>

  <d-block-step title="Suba o PostgreSQL">

O app precisa de um servidor PostgreSQL. O mais rápido é a imagem oficial em um container — um banco `polls` do usuário `polls`, senha `secret`, na porta padrão:

```bash :toolbar="true";
docker run --name polls-postgres -e POSTGRES_USER=polls -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=polls -p 5432:5432 -d postgres:16
```

O PostgreSQL leva alguns segundos para inicializar na primeira subida. Este laço retorna assim que o servidor aceita conexões na porta — rode-o antes de seguir, ou o projeto tentaria migrar um banco que ainda não existe. Ele imprime `no response` enquanto o PostgreSQL inicializa; se continuar por mais de um minuto, o container não subiu (`docker ps -a`, `docker logs polls-postgres` — um PostgreSQL já na porta 5432 é o motivo usual):

```bash :toolbar="true";
until docker exec polls-postgres pg_isready -U polls -h 127.0.0.1; do sleep 1; done
```

> [!NOTE]
> O Docker é a única coisa que esta página assume além do instalador (no Linux, seu usuário precisa estar no grupo `docker`, ou prefixe os dois comandos com `sudo`). Já tem um servidor PostgreSQL? Pule o container e aponte o projeto para ele com variáveis de ambiente na hora de iniciar: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASS` — a configuração de banco que você escreve daqui a pouco as lê. O driver PostgreSQL do Bootgly é nativo: ele fala o protocolo de rede sozinho (SCRAM-SHA-256 incluído), então nenhuma extensão `pgsql` ou PDO é necessária.

  </d-block-step>

  <d-block-step title="Crie o projeto">

Crie um projeto **WPI** (web) chamado `Polls` na plataforma **Web**, na porta 8082. Na primeira execução isso também configura a plataforma (o submódulo git e os exemplos embarcados — `Demo/Blog` é a referência MVC), então leva um momento:

```bash :toolbar="true";
php bootgly projects create Polls --platform=web --interfaces=WPI --port=8082 --yes
```

O projeto nasce em `projects/Polls/` como um repositório git próprio (o scaffold vira o primeiro commit assim que o git souber seu nome e e-mail) — `Polls.Project.php` (a assinatura), um `router/` com um conjunto de rotas de boas-vindas, `schedule.php` e `tests/`. Você vai substituir a assinatura e o manifesto do router, adicionar um conjunto de rotas `Polls.routes.php` (apague `Welcome.routes.php` se quiser); o próximo passo cria todas as pastas de uma vez. Tudo vai dentro de `projects/Polls/`.

  </d-block-step>

  <d-block-step title="Crie as pastas">

Todas as pastas em que os próximos passos escrevem, em um comando — daqui em diante você só cria arquivos e cola o conteúdo deles. Rode da pasta do kit (`mkdir -p` não mexe nas pastas que o scaffold já criou):

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

  <d-block-step title="Escreva a assinatura do projeto">

Substitua o `Polls.Project.php` gerado. A função `boot` monta um handle de banco a partir do escopo de configuração `database` do próprio projeto — o mesmo arquivo que o recurso de resposta `Database` lê, então as configurações de conexão vivem em um só lugar — roda as migrations e os seeders antes de o servidor bifurcar e então inicia um `Web\App` com dois workers:

**Arquivo** `projects/Polls/Polls.Project.php`

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

`Modes::Daemon` desprende o servidor do seu terminal (`php bootgly project Polls stop` o para); `-f` o mantém em primeiro plano com os logs à sua frente.

  </d-block-step>

  <d-block-step title="Configure o banco de dados">

O escopo `database` declara a conexão PostgreSQL, cada valor vinculado a uma variável de ambiente com as credenciais do container como padrão. O modo TLS padrão do driver é `prefer`: o container não tem certificado, o servidor avisa, e a conexão segue em texto puro — em um servidor real, `DB_SSLMODE=verify-full` com `DB_SSLCAFILE` a torna estrita:

**Arquivo** `projects/Polls/configs/database/database.Config.php`

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

  <d-block-step title="Escreva a migration">

Uma migration, quatro instruções: as três tabelas e o índice único sobre `(poll_id, voter)` que transforma "um voto por visitante por enquete" em uma regra que o banco impõe. `reference()` declara as chaves estrangeiras; `Timestamptz` é o `TIMESTAMPTZ` do PostgreSQL, um instante que hidrata como `DateTimeImmutable`; o runner aplica a lista em uma transação:

**Arquivo** `projects/Polls/database/migrations/20260922000000_create_polls.php`

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

  <d-block-step title="Escreva o seeder">

Os seeders vivem em `database/seeders/` e rodam a **cada** subida — o runner não guarda um registro de seeders aplicados (o arquivo de trava só impede duas execuções simultâneas), e é por isso que os dois `INSERT`s de várias linhas usam `upsert()` no id: a segunda subida atualiza as linhas em vez de falhar nelas. As duas instruções raw no final importam no PostgreSQL: uma coluna de identidade não avança a sequência quando você insere ids explícitos, então a próxima enquete criada pelo formulário colidiria com o id 1 — `setval()` move as sequências para depois das sementes:

**Arquivo** `projects/Polls/database/seeders/polls.php`

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

  <d-block-step title="Escreva os models">

Um model do ORM é uma classe comum com atributos: `#[Table]` nomeia a tabela, `#[Key]` a chave primária gerada, `#[Column]` mapeia uma propriedade (com o nome da coluna quando difere) e `#[Relation]` declara como dois models se conectam — `HasMany` do `id` da enquete para a propriedade `poll` da opção. `Vote` é lido pelo ORM na página da enquete e escrito com o Query Builder quando alguém vota:

**Arquivo** `projects/Polls/Models/Poll.php`

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

**Arquivo** `projects/Polls/Models/Option.php`

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

**Arquivo** `projects/Polls/Models/Vote.php`

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

`namespace Polls\Models;` espelha a pasta — é assim que o Bootgly carrega suas classes.

  </d-block-step>

  <d-block-step title="Escreva o controller">

Um controller, quatro ações. `list` pagina as enquetes (a view mostra a página que recebe — dez por padrão; `?page=2` alcança o resto, e o cabeçalho `Link` diz isso). `create` valida o formulário e grava a enquete e suas opções dentro do `transact()` — `output()` é o `RETURNING`, então o novo id volta junto com o `INSERT` e as opções podem apontar para ele. `show` carrega a enquete com suas opções pelo ORM, conta os votos com SQL raw (os placeholders do PostgreSQL são `$1`, `$2`, …; `COUNT(v.id)` sobre um `LEFT JOIN` mantém em zero as opções que ninguém escolheu) e lê o voto do próprio visitante pelo model `Vote`. `vote` é um único `INSERT … ON CONFLICT (poll_id, voter) DO UPDATE`: o primeiro voto insere, um segundo o altera — sem ler-e-depois-escrever, sem corrida. O visitante é um token anônimo cunhado uma vez e guardado na sessão:

**Arquivo** `projects/Polls/Controllers/Polls.php`

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

  <d-block-step title="Escreva as rotas">

O manifesto do router nomeia os conjuntos de rotas ativos. `Controllers::map()` expande as rotas de recurso — `list`, `create` e `show` — e o voto é mais um `POST` na enquete, mapeado com `Action`, o mesmo despachante que o `map()` usa (`:id<int>` só casa com dígitos):

**Arquivo** `projects/Polls/router/router.index.php`

```php :filename="projects/Polls/router/router.index.php";
<?php

return [
   'Polls'
];
```

**Arquivo** `projects/Polls/router/routes/Polls.routes.php`

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

  <d-block-step title="Escreva as views e a folha de estilo">

Views são templates PHP em `views/`; `views/layouts/main.template.php` envolve cada renderização e `@yield content;` é onde a view entra. A página da enquete é um formulário de botões de opção — o voto atual do visitante pré-marcado — seguido dos resultados, um `<meter>` por opção:

**Arquivo** `projects/Polls/views/layouts/main.template.php`

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

**Arquivo** `projects/Polls/views/polls/list.template.php`

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

**Arquivo** `projects/Polls/views/polls/create.template.php`

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

**Arquivo** `projects/Polls/views/polls/show.template.php`

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

**Arquivo** `projects/Polls/views/errors/404.template.php`

```php :filename="projects/Polls/views/errors/404.template.php";
<h1>404</h1>
<p>There is nothing here. <a href="/polls">Back to the polls</a>.</p>
```

**Arquivo** `projects/Polls/statics/polls.css`

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

  <d-block-step title="Rode">

Inicie o servidor da pasta do kit — a função de boot migra e popula o banco primeiro, então duas enquetes já esperam na primeira requisição — e abra <http://localhost:8082>: vote, mude o voto, faça uma pergunta sua:

```bash :toolbar="true";
php bootgly project Polls start
```

A porta 8082 já está ocupada? `PORT=8083 php bootgly project Polls start` — a função de boot lê `PORT`; use essa porta também nas linhas de `curl` abaixo. PostgreSQL em outro lugar? `DB_HOST=… DB_PORT=… php bootgly project Polls start`.

O servidor está desprendido, então acompanhe o log em um segundo terminal — cada requisição, e o relatório da exceção quando algo dá errado (os arquivos vivem em `storage/logs/`):

```bash :toolbar="true";
php bootgly project Polls logs -f
```

De um terminal, o mesmo fluxo com `curl` e um pote de cookies: a lista, uma enquete nova pelo formulário, um voto na primeira opção, uma mudança de ideia para a segunda — e os resultados, que contam um voto, na segunda opção:

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

Dois votos, uma linha: o segundo `INSERT` bateu no índice único e virou um `UPDATE`. Um POST sem o token é recusado com `403`, uma opção que pertence a outra enquete é recusada com um flash, e uma enquete desconhecida renderiza a view 404. Pare o servidor quando terminar; o container guarda os dados (`docker stop polls-postgres` o pausa, `docker start polls-postgres` o traz de volta) — ou remova-o:

```bash :toolbar="true";
php bootgly project Polls stop
docker rm -f polls-postgres
```

  </d-block-step>

  <d-block-step title="Teste">

Um projeto carrega as próprias suítes. Substitua o registro gerado para que liste uma suíte `Project` com dois testes — o contrato da assinatura e o mapeamento dos models como o ORM o lê, um teste unitário puro que não precisa de servidor nem de banco:

**Arquivo** `projects/Polls/tests/autoboot.php`

```php :filename="projects/Polls/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/project/',
   ]
);
```

**Arquivo** `projects/Polls/tests/project/autoboot.php`

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

**Arquivo** `projects/Polls/tests/project/1.1-signature.Test.php`

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

**Arquivo** `projects/Polls/tests/project/1.2-models.Test.php`

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

Rode as suítes do projeto de dentro da pasta do projeto — o launcher está dois níveis acima, na raiz do kit:

```bash :toolbar="true";
cd projects/Polls && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Próximos passos

- Encerre uma enquete: uma coluna `closed_at` `Timestamptz`, um `update()` pelo Builder, e `vote` recusando assim que ela estiver definida.
- Mostre quem lidera na lista: um `LEFT JOIN … GROUP BY` por página é barato — ou um `#[Relation(Relations::HasMany, Vote::class, 'id', 'poll', lazy: true)]` em `Poll`, carregado no acesso.
- Deixe os resultados fluírem: o [Guestbook](/cookbook/web/guestbook/overview/) mostra o fluxo simples de formulário; o recurso de resposta `SSE` da plataforma Web pode empurrar cada nova contagem para as páginas abertas.
- Troque o banco: `DB_CONNECTION=mysql` com um bloco `Connections->MySQL` leva as migrations e o ORM intactos — os pontos específicos de dialeto são o `output(new Identifier('id'))` em `create` (o MySQL não tem `RETURNING`; leia `Result->inserted`), os placeholders `$1` em `show` (`?` no MySQL) e as duas instruções `setval()` do seeder, de que o MySQL não precisa. A página do [Shop](/cookbook/web/shop/overview/) mostra o lado MySQL (atenção à nota sobre TLS).

## Referência

- [Web App](/manual/Web/App/overview/) — `App`, `Configs`, `Controller`, `Controllers`, `Statics`, `Views`.
- [Database DBAL](/guide/database-dbal/overview/) — o escopo de configuração `database`, os drivers, o recurso de resposta `Database`.
- [Driver PostgreSQL](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/) — protocolo nativo, placeholders `$1`, `RETURNING`, modos TLS.
- [Query Builder](/manual/ADI/Databases/SQL/Builder/overview/) — `table()`, `select()`, `filter()`, `output()`, `upsert()` e os enums.
- [Database ORM](/guide/database-orm/overview/) — `#[Table]`, `#[Key]`, `#[Column]`, `#[Relation]`, repositórios, `load()`.
- [Database transactions](/guide/database-transactions/overview/) — `transact()`, savepoints, o que desfaz e o que confirma.
- [Database migrations](/guide/database-migrations/overview/) — `Migration`, `Blueprint`, `reference()`, `index()`, tipos e o runner.
- [Database seeders](/guide/database-seeders/overview/) — `Seeder`, o runner e a trava.
- [Router](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/) — conjuntos de rotas, parâmetros, os middlewares (CSRF entre eles).
- [Testes](/testing/about/testing/overview/) — suítes, as APIs de asserção Basic e Advanced e `bootgly test`.
