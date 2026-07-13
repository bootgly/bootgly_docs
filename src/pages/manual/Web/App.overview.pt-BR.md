# Web App

`Web\App` é o shell de aplicação MVC: um boot opinativo do `HTTP_Server_CLI` canônico com uma stack de middlewares padrão, dispatch de controllers, resource routing, convenções de views e assets estáticos inline.

## Um app mínimo

A closure `boot` do projeto constrói e inicia o App:

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Web\App;


return new Project(
   name: 'Blog',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $App = new App(Mode: Modes::Daemon);

      $App
         ->configure(port: 8080, workers: 1)
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

`load()` lê a pasta de router padrão (`router/router.index.php` + `router/routes/<Name>.php`) — a mesma convenção de qualquer projeto WPI. `start()` conecta os eventos, aplica as convenções de views e inicializa o servidor.

Toda rota recebe a **stack de middlewares padrão**: `SecureHeaders`, `RequestId`, `BodyParser` e `CSRF`. Substitua-a por inteiro quando o projeto precisar de outra (uma API REST dispensa o CSRF, por exemplo):

```php
$App->configure(
   port: 8090,
   middlewares: [
      new SecureHeaders,
      new RequestId,
      new BodyParser,
      new Problems  // fronteira de erros problem+json (Web\API)
   ]
);
```

Quando o projeto inclui `configs/database/` (ou `configs/kv/`), o response resource **Database** (ou **KV**) é provido automaticamente — controllers apenas usam `$Response->Database`.

## Controllers

Um controller é um substantivo plural do seu recurso; as ações são verbos de uma palavra recebendo `(Request, Response)` — a mesma convenção de chamada dos handlers em closure:

```php
namespace Blog\Controllers;

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Web\App\Controller;


class Posts extends Controller
{
   public function list (Request $Request, Response $Response): Response
   {
      $body = $Response->Database->paginate(Post::class);

      return $this->render('posts/list', ['posts' => $body['items']]);
   }

   public function show (Request $Request, Response $Response): Response
   {
      $id = $this->Route->Params->id;
      // ...

      return $this->render('posts/show', ['post' => $post]);
   }
}
```

Uma **instância nova do controller é construída a cada request** — o servidor é preforked e de longa duração, então nenhum estado de request sobrevive na instância. A rota casada é lida ao vivo pelo hook `$Route`.

## Resource routing

`Controllers::map()` expande uma declaração no conjunto de rotas orientado a formulários HTML, dentro de um arquivo de route set:

```php
use Web\App\Controllers;

use Blog\Controllers\Posts;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   yield from Controllers::map($Router, '/posts', Posts::class);
};
```

| Rota               | Métodos          | Ação     | Notas               |
|--------------------|------------------|----------|---------------------|
| `/posts`           | GET              | `list`   |                     |
| `/posts/create`    | GET              | `create` | renderiza o form    |
| `/posts`           | POST             | `create` | persiste            |
| `/posts/:id`       | GET              | `show`   |                     |
| `/posts/:id/edit`  | GET              | `edit`   | renderiza o form    |
| `/posts/:id`       | POST, PUT, PATCH | `update` | POST = forms HTML   |
| `/posts/:id/delete`| POST             | `delete` | forms HTML          |
| `/posts/:id`       | DELETE           | `delete` |                     |

`create` é a única ação de dupla face: GET renderiza o form em branco e POST persiste — ramifique por `$Request->method` dentro da ação. Filtre o conjunto com `only:` / `except:`, e ajuste a constraint do `:id` com `constraint:` (`'int'` por padrão).

## Views

Views vivem no diretório `views/` do projeto e renderizam pelo View resource do core. A convenção da plataforma: um layout padrão em `views/layouts/main.template.php` envolve toda renderização (a saída solta da view vira a seção `content` do layout):

```php
<!-- views/layouts/main.template.php -->
<main>
   @yield content;
</main>
```

Mude a convenção por `$App->Views` antes do `start()`:

```php
$App->Views->layout = 'layouts/site';
$App->Views->share(['app' => 'Blog']);
```

## Assets estáticos

`Statics` serve os assets do projeto **inline com o media type correto** — `Response->upload()` tem semântica de download (`Content-Disposition: attachment`), que browsers rejeitam para stylesheets e scripts sob `nosniff`:

```php
use Web\App\Statics;

yield $Router->route('/statics/:file*', new Statics, GET);
```

Os arquivos resolvem dentro da jail `statics/` do projeto (caminho normalizado e contido na base); extensões desconhecidas permanecem `application/octet-stream`.

## Logs

`start()` registra um sink global de arquivo: relatórios de exceção e loggers opted-in persistem em `storage/logs/<channel>.log` em todos os modos. No modo **Daemon** os workers se desconectam do terminal — o arquivo de log é onde os erros aparecem.

---

## Reference

### Web\App

```php
public function __construct (Modes $Mode = Modes::Daemon)
```

Cria o shell: um `HTTP_Server_CLI` no modo dado, as convenções `Views` e a stack de middlewares padrão (`SecureHeaders`, `RequestId`, `BodyParser`, `CSRF`).

```php
public function configure (string $host = '0.0.0.0', int $port = 8080, int $workers = 2, null|array $middlewares = null, null|array $secure = null, null|array $resources = null): self
```

Configura o HTTP Server subjacente. `middlewares:` substitui a stack padrão por inteiro; `secure:` recebe as opções de contexto TLS; `resources:` adiciona response resources (nome => provider) — Database/KV são providos automaticamente quando o projeto inclui suas configs.

```php
public function load (string $path): self
```

Carrega a pasta de router do projeto (`router.index.php` + `routes/*.php`) e guarda o handler para o `start()`.

```php
public function start (): void
```

Registra o sink global de logs, conecta os eventos da plataforma (convenções de views + stack global de middlewares no drain do primeiro request, banners de start/stop) e inicia o servidor. Lança quando nenhum router foi carregado.

### Web\App\Controller

```php
public Route $Route { get }
```

A rota casada atual, lida ao vivo do servidor (params via `$this->Route->Params`).

```php
protected function render (string $view, null|array $data = null, null|string|false $layout = null): Response
```

Renderiza uma view do projeto pelo View resource da Response. `layout:` sobrescreve o padrão configurado (false/'' renderiza sem layout).

```php
protected function redirect (string $URI, null|int $code = null): Response
```

Redireciona pela Response. Um code null deriva do método do request (POST → 303, senão 307).

### Web\App\Controllers

```php
public static function map (Router $Router, string $path, string $controller, null|array $only = null, null|array $except = null, array $middlewares = [], null|string $constraint = 'int'): Generator
```

Expande uma declaração de recurso MVC na tabela de rotas acima. Nomes de ação desconhecidos em `only`/`except` lançam no momento do registro; `middlewares:` aplica a toda rota expandida.

### Web\App\Statics

```php
public function __construct (string $path = 'statics', string $param = 'file', string $cache = 'public, max-age=3600')
```

Handler invocável de arquivos estáticos para uma rota de param catch-all (`/statics/:file*`). Serve inline com o media type mapeado da extensão do arquivo e o `Cache-Control` dado.

### Web\App\Views

```php
public function share (array $variables): self
```

Mescla variáveis exportadas a toda renderização (valores posteriores vencem).

```php
public function apply (Response $Response): void
```

Aplica o layout + exports compartilhados no View resource da Response — chamado pelo `App->start()` no drain do primeiro request de cada worker.
