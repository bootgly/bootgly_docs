# Guestbook

Construa o **Guestbook**, um pequeno app web em que visitantes assinam um livro: um formulário e a lista de entradas em uma página, guardados em SQLite, protegidos por CSRF, dentro de um layout com a própria folha de estilo. O shell **App** da plataforma Web traz o servidor HTTP, a pilha de middlewares (cabeçalhos seguros, ids de requisição, parsing do corpo, CSRF), sessões, controllers, views e arquivos estáticos; você escreve o app.

Você vai escrever 11 arquivos curtos (uns 30 minutos) e aprender como um `Web\App` inicia, como uma migration cria o banco, como um controller lista e cria registros, como views e layouts renderizam, como o token CSRF viaja por um formulário e como um projeto é testado com `bootgly test`.

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
  <d-block-step title="Instale o Bootgly">

Um comando instala tudo no Linux (ou WSL2): ele verifica **git** e **PHP 8.4+** (com as extensões que os recursos embutidos do Bootgly usam — o driver SQLite entre eles), oferece instalar o que faltar pelo seu gerenciador de pacotes e clona o Bootgly Kit em `./bootgly.kit`. `--no-wizard` pula o wizard interativo de projetos — o próximo passo cria o projeto com um comando explícito.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash -s -- --no-wizard
cd bootgly.kit
```

> [!TIP]
> O instalador também pergunta se deve instalar o comando `bootgly` globalmente — qualquer resposta serve, todas as páginas aqui usam `php bootgly …`. Já tem um kit? O instalador retoma o que encontrar em `./bootgly.kit` e oferece movê-lo para a release atual — aceite, estas páginas assumem a 1.0.2 ou mais nova — depois entre nele com `cd` e vá para o próximo passo. Todos os comandos abaixo rodam da pasta do kit como `php bootgly …` — se você instalou a CLI globalmente (`php bootgly setup`), `bootgly …` também funciona. O guia [Começando](/guide/getting-started/overview/) explica o instalador e a estrutura do kit.

  </d-block-step>

  <d-block-step title="Crie o projeto">

Crie um projeto **WPI** (web) chamado `Guestbook` na plataforma **Web**, na porta 8080. Na primeira execução isso também configura a plataforma (o submódulo git e os exemplos embarcados — Blog, Site, Tasks, Chat e Auth valem uma olhada depois), então leva um momento:

```bash :toolbar="true";
php bootgly projects create Guestbook --platform=web --interfaces=WPI --port=8080 --yes
```

O projeto nasce em `projects/Guestbook/` como um repositório git próprio (o scaffold vira o primeiro commit assim que o git souber seu nome e e-mail):

```text
projects/Guestbook/
├── Guestbook.Project.php     ← a assinatura do projeto: metadados + a função de boot
├── .gitignore
├── router/
│   ├── router.index.php      ← quais conjuntos de rotas estão ativos
│   └── routes/
│       └── Welcome.routes.php
├── schedule.php
└── tests/
    ├── autoboot.php          ← o registro de testes do projeto
    └── example/              ← uma suíte de exemplo (removida do registro no último passo; apague quando quiser)
```

Você vai substituir a assinatura e o manifesto do router, adicionar um conjunto de rotas `Guestbook.routes.php` (apague `Welcome.routes.php` se quiser) e criar as pastas `configs/`, `database/`, `Controllers/`, `views/` e `statics/`. Tudo vai dentro de `projects/Guestbook/`.

  </d-block-step>

  <d-block-step title="Escreva a assinatura do projeto">

Substitua o `Guestbook.Project.php` gerado. A função `boot` roda as migrations no arquivo SQLite e inicia um `Web\App` — a pilha de middlewares padrão (`SecureHeaders`, `RequestId`, `BodyParser`, `CSRF`) e o recurso de resposta `Database` vêm junto:

**Arquivo** `projects/Guestbook/Guestbook.Project.php`

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

`Modes::Daemon` desprende o servidor do seu terminal (`php bootgly project Guestbook stop` o para); `-f` o mantém em primeiro plano com os logs à sua frente.

  </d-block-step>

  <d-block-step title="Configure o banco de dados">

O recurso de resposta `Database` lê `configs/database/` — uma conexão SQLite apontando para um arquivo dentro do projeto:

**Arquivo** `projects/Guestbook/configs/database/database.Config.php`

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

  <d-block-step title="Escreva a migration">

As migrations vivem em `database/migrations/` e são executadas pela função de boot antes do servidor bifurcar, então a tabela sempre existe quando a primeira requisição chega:

**Arquivo** `projects/Guestbook/database/migrations/20260921000000_create_entries.php`

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

  <d-block-step title="Escreva o controller">

Um controller é um substantivo no plural; suas ações são verbos de uma palavra que recebem `(Request, Response)`. `list` renderiza a página com as entradas, a mensagem flash e um token CSRF mascarado para o formulário; `create` valida o POST, insere a linha, registra a mensagem flash e redireciona com `303 See Other`. Uma instância nova do controller é construída por requisição, então nada sobrevive entre visitantes:

**Arquivo** `projects/Guestbook/Controllers/Entries.php`

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

`namespace Guestbook\Controllers;` espelha a pasta — é assim que o Bootgly carrega suas classes.

  </d-block-step>

  <d-block-step title="Escreva as rotas">

O manifesto do router nomeia os conjuntos de rotas ativos; cada conjunto é um arquivo que faz `yield` das rotas. `Controllers::map()` expande uma linha nas rotas do recurso — filtradas aqui para `list` (`GET /entries`) e `create` (`GET /entries/create`, `POST /entries`) — e `Statics` serve a folha de estilo inline com o media type certo:

**Arquivo** `projects/Guestbook/router/router.index.php`

```php :filename="projects/Guestbook/router/router.index.php";
<?php

return [
   'Guestbook'
];
```

**Arquivo** `projects/Guestbook/router/routes/Guestbook.routes.php`

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

  <d-block-step title="Escreva as views e a folha de estilo">

Views são templates PHP em `views/`; `views/layouts/main.template.php` envolve toda renderização e `@yield content;` é onde a view entra. A view da página contém o formulário (com o `_token` oculto que o middleware CSRF confere) e as entradas:

**Arquivo** `projects/Guestbook/views/layouts/main.template.php`

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

**Arquivo** `projects/Guestbook/views/entries/list.template.php`

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

**Arquivo** `projects/Guestbook/views/errors/404.template.php`

```php :filename="projects/Guestbook/views/errors/404.template.php";
<h1>404</h1>
<p>There is nothing here. <a href="/entries">Back to the book</a>.</p>
```

**Arquivo** `projects/Guestbook/statics/guestbook.css`

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

  <d-block-step title="Rode">

Inicie o servidor a partir da pasta do kit e abra <http://localhost:8080> — assine o livro, veja a mensagem flash e a sua entrada no topo da lista:

```bash :toolbar="true";
php bootgly project Guestbook start
```

Porta 8080 ocupada? `PORT=8081 php bootgly project Guestbook start` — a função de boot lê `PORT`; use essa porta também nas linhas de `curl` abaixo. De um terminal, o mesmo fluxo leva três requisições — o cookie de sessão e o token mascarado do formulário são o que deixa o POST passar pelo middleware CSRF:

```bash :toolbar="true";
curl -s -c cookies.txt http://localhost:8080/entries -o page.html
token=$(grep -o 'name="_token" value="[^"]*"' page.html | cut -d'"' -f4)
curl -s -b cookies.txt -i -X POST http://localhost:8080/entries --data-urlencode "_token=$token" --data-urlencode "name=Ada" --data-urlencode "message=Hello from curl!" | head -1
curl -s -b cookies.txt http://localhost:8080/entries | grep -c "Hello from curl!"
```

Um POST sem o token é recusado com `403`, um nome ou mensagem vazios voltam com o flash de erro, e um caminho desconhecido renderiza a view 404. Pare o servidor quando terminar:

```bash :toolbar="true";
php bootgly project Guestbook stop
```

> [!NOTE]
> Erros e relatórios de exceção de um servidor desprendido caem em `storage/logs/` — `php bootgly project Guestbook logs` os acompanha.

  </d-block-step>

  <d-block-step title="Teste">

Um projeto carrega as próprias suítes. Substitua o registro gerado para que ele liste uma suíte `Project` com dois testes — o contrato da assinatura e os arquivos de router/migration:

**Arquivo** `projects/Guestbook/tests/autoboot.php`

```php :filename="projects/Guestbook/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/project/',
   ]
);
```

**Arquivo** `projects/Guestbook/tests/project/autoboot.php`

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

**Arquivo** `projects/Guestbook/tests/project/1.1-signature.Test.php`

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

**Arquivo** `projects/Guestbook/tests/project/1.2-router.Test.php`

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

Rode as suítes do projeto de dentro da pasta dele — o launcher está dois níveis acima, na raiz do kit:

```bash :toolbar="true";
cd projects/Guestbook && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Próximos passos

- Pagine o livro: `$Response->Database->paginate(Entry::class)` com um model do ORM lê `?page`/`?limit` e define os cabeçalhos `X-Total-Count`/`Link` — a API [Contacts](/cookbook/web/contacts/overview/) faz exatamente isso.
- Deixe autores apagarem as próprias entradas: `Controllers::map()` também mapeia `edit`, `update` e `delete`; guarde os ids das entradas na sessão.
- Semeie algumas entradas no boot com um arquivo em `database/seeders/` e o `Seed\Runner`, como o `Demo/Blog` embarcado faz.
- Vá de HTTPS: entregue um `AutoTLS` ao `Configs` e o servidor obtém um certificado Let's Encrypt sozinho.

## Referência

- [Web App](/manual/Web/App/overview/) — `App`, `Configs`, `Controller`, `Controllers`, `Statics`, `Views`.
- [Router](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/) — conjuntos de rotas, parâmetros, os middlewares (CSRF entre eles).
- [Migrations de banco](/guide/database-migrations/overview/) — `Migration`, `Blueprint`, tipos e o runner.
- [Templates](/guide/templates/overview/) — `@yield`, `@include`, layouts e partials.
- [Projects](/manual/Bootgly/essential/projects/overview/) — flags de `projects create`, a assinatura do projeto e os namespaces do autoloader.
- [Testes](/testing/about/testing/overview/) — suítes, as APIs de asserção Básica e Avançada e `bootgly test`.
