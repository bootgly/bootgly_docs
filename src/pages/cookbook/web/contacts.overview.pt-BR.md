# Construa uma Web REST API

Construa o **Contacts**, uma API REST de agenda de contatos: JSON entra, JSON sai, cinco endpoints (list, show, create, update, delete), validação com mensagens de erro claras, erros `problem+json` da RFC 9457, cabeçalhos de paginação e um arquivo SQLite — semeado com três contatos para a API responder desde a primeira requisição. O shell **API** da plataforma Web traz o roteamento de recursos, a fronteira de erros problem+json e os transformadores de entidades; você escreve o recurso.

Você vai escrever 10 arquivos curtos (uns 30 minutos) e aprender como um `Web\App` roda a pilha de middlewares REST, como uma migration e um seeder preparam o banco, como um controller pagina, valida e lança problems, como um `Resource` molda o JSON, e como um projeto é testado com `bootgly test`.

```text
$ curl -s -i http://localhost:8090/contacts | grep -E "X-Total-Count|^\{"
X-Total-Count: 3
{"items":[{"id":1,"name":"Ada Lovelace","email":"ada@example.com","phone":"+44 20 7946 0001"}, …],"page":1,"pages":1,"limit":10,"total":3}
$ curl -s -X POST http://localhost:8090/contacts -H 'Content-Type: application/json' -d '{"name":"","email":"nope"}'
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"The contact is invalid.","errors":{"name":["name is required."],"email":["email must be a valid email address."]}}
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

Crie um projeto **WPI** (web) chamado `Contacts` na plataforma **Web**, na porta 8090. Na primeira execução isso também configura a plataforma (o submódulo git e os exemplos embarcados — `Demo/Tasks` é a referência REST com JWT por cima), então leva um momento:

```bash :toolbar="true";
php bootgly projects create Contacts --platform=web --interfaces=WPI --port=8090 --yes
```

O projeto nasce em `projects/Contacts/` como um repositório git próprio (o scaffold vira o primeiro commit assim que o git souber seu nome e e-mail) — `Contacts.Project.php` (a assinatura), um `router/` com um conjunto de rotas de boas-vindas, `schedule.php` e `tests/`. Você vai substituir a assinatura e o manifesto do router, adicionar um conjunto de rotas `Contacts.routes.php` (apague `Welcome.routes.php` se quiser); o próximo passo cria todas as pastas de uma vez. Tudo vai dentro de `projects/Contacts/`.

  </d-block-step>

  <d-block-step title="Crie as pastas">

Todas as pastas em que os próximos passos escrevem, em um comando — daqui em diante você só cria arquivos e cola o conteúdo deles. Rode da pasta do kit (`mkdir -p` não mexe nas pastas que o scaffold já criou):

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

  <d-block-step title="Escreva a assinatura do projeto">

Substitua o `Contacts.Project.php` gerado. A função `boot` migra e semeia o arquivo SQLite, depois inicia um `Web\App` com a **pilha REST**: sem CSRF (não há formulários de navegador) e `Problems` como a fronteira de erros que transforma qualquer `Problem` lançado em `application/problem+json`:

**Arquivo** `projects/Contacts/Contacts.Project.php`

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

  <d-block-step title="Configure o banco de dados">

O recurso de resposta `Database` lê `configs/database/` — uma conexão SQLite apontando para um arquivo dentro do projeto:

**Arquivo** `projects/Contacts/configs/database/database.Config.php`

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

  <d-block-step title="Escreva a migration e o seeder">

A migration cria a tabela (`phone` é opcional — `nullable`); o seeder faz upsert de três contatos por id, então reiniciar o servidor nunca os duplica:

**Arquivo** `projects/Contacts/database/migrations/20260921000000_create_contacts.php`

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

**Arquivo** `projects/Contacts/database/seeders/contacts.php`

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

  <d-block-step title="Escreva o model e o resource">

O **model** mapeia a tabela para o ORM — `paginate()` hidrata as linhas nele. O **resource** é a forma pública de um contato: ele tipa os campos e descarta o que a API não deve expor (`created_at` aqui), tanto de um model quanto de um array de linha:

**Arquivo** `projects/Contacts/Models/Contact.php`

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

**Arquivo** `projects/Contacts/Resources/Contacts.php`

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

`namespace Contacts\Models;` e `namespace Contacts\Resources;` espelham as pastas — é assim que o Bootgly carrega suas classes.

  </d-block-step>

  <d-block-step title="Escreva o controller">

Cinco ações, uma por endpoint. `list` pagina pelo core (`?page`, `?limit`, `?cursor` — os cabeçalhos `X-Total-Count` e `Link` são definidos para você) e transforma os itens; `show`, `update` e `delete` buscam a linha roteada ou lançam um problem `404`; `create` e `update` validam com a `Validation` do core e lançam um problem `422` carregando as mensagens de erro:

**Arquivo** `projects/Contacts/Controllers/Contacts.php`

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

Uma instância nova do controller é construída por requisição; `$this->Route->Params->id` lê a rota casada ao vivo.

  </d-block-step>

  <d-block-step title="Escreva as rotas">

`Routes::map()` expande uma linha no conjunto de rotas REST — `GET /contacts`, `POST /contacts`, `GET|PUT|PATCH|DELETE /contacts/:id` — e o fallback também lança um problem, então até um caminho desconhecido responde em `problem+json`:

**Arquivo** `projects/Contacts/router/router.index.php`

```php :filename="projects/Contacts/router/router.index.php";
<?php

return [
   'Contacts'
];
```

**Arquivo** `projects/Contacts/router/routes/Contacts.routes.php`

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

  <d-block-step title="Rode">

Inicie o servidor a partir da pasta do kit:

```bash :toolbar="true";
php bootgly project Contacts start
```

Porta 8090 ocupada? `PORT=8091 php bootgly project Contacts start` — a função de boot lê `PORT`; use essa porta também nas linhas de `curl` abaixo.

O servidor fica desprendido, então acompanhe o log dele em um segundo terminal — toda requisição, e o relatório de exceção quando algo der errado (os arquivos ficam em `storage/logs/`):

```bash :toolbar="true";
php bootgly project Contacts logs -f
```

Depois percorra a API com `curl` — list, show, create, um create inválido, um update parcial, delete, e o 404 que vem em seguida:

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

Pare o servidor quando terminar:

```bash :toolbar="true";
php bootgly project Contacts stop
```

  </d-block-step>

  <d-block-step title="Teste">

Um projeto carrega as próprias suítes. Substitua o registro gerado para que ele liste uma suíte `Project` com dois testes — o contrato da assinatura e o transformador do resource, um teste unitário puro que não precisa de servidor:

**Arquivo** `projects/Contacts/tests/autoboot.php`

```php :filename="projects/Contacts/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/project/',
   ]
);
```

**Arquivo** `projects/Contacts/tests/project/autoboot.php`

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

**Arquivo** `projects/Contacts/tests/project/1.1-signature.Test.php`

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

**Arquivo** `projects/Contacts/tests/project/1.2-resource.Test.php`

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

Rode as suítes do projeto de dentro da pasta dele — o launcher está dois níveis acima, na raiz do kit:

```bash :toolbar="true";
cd projects/Contacts && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Próximos passos

- Proteja as mutações com um JWT: duas chamadas `Routes::map()` — `only: ['list', 'show']` pública, `except: ['list', 'show']` atrás de `new Authentication($JWTStrategy)` — como o `Demo/Tasks` embarcado faz.
- Adicione uma busca: leia `$Request->query('q')` em `list` e filtre com o `Repository` do ORM em vez da seleção padrão do `paginate()`.
- Limite a taxa da API com o middleware `RateLimit` e adicione `CORS` quando um front end de navegador for chamá-la.
- Troque os contatos semeados pelos seus dados: `php bootgly project Contacts seed run` e `migrate up` são os mesmos runners que a função de boot usa.

## Referência

- [Web API](/manual/Web/API/overview/) — `Routes`, `Action`, `Problem`, `Problems`, `Resource`.
- [Web App](/manual/Web/App/overview/) — `App`, `Configs`, `Controller` (o shell API compartilha os controllers e configs do App).
- [Validação](/guide/validation/overview/) — `Validation`, os validadores embutidos e regras customizadas.
- [Migrations de banco](/guide/database-migrations/overview/) e [seeders](/guide/database-seeders/overview/) — `Migration`, `Blueprint`, `Seeder` e os runners.
- [ORM de banco](/guide/database-orm/overview/) — models, repositories e paginação.
- [Projects](/manual/Bootgly/essential/projects/overview/) — flags de `projects create`, a assinatura do projeto e os namespaces do autoloader.
- [Testes](/testing/about/testing/overview/) — suítes, as APIs de asserção Básica e Avançada e `bootgly test`.
