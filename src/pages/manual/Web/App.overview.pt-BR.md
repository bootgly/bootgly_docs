# Web App

`Web\App` é o shell de aplicação MVC: um boot opinativo do `HTTP_Server_CLI` canônico com uma stack de middlewares padrão, dispatch de controllers, resource routing, convenções de views e assets estáticos inline.

## Um app mínimo

A closure `boot` do projeto constrói e inicia o App:

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Web\App;
use Web\App\Configs;


return new Project(
   name: 'Blog',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $App = new App(Mode: Modes::Daemon);

      $App
         ->configure(new Configs(port: 8080, workers: 1))
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

`load()` lê a pasta de router padrão (`router/router.index.php` + `router/routes/<Name>.routes.php`) — a mesma convenção de qualquer projeto WPI. `start()` conecta os eventos, aplica as convenções de views e inicializa o servidor.

`configure()` recebe **Configs** — os mesmos value objects tipados que todo node WPI recebe. Um `Web\App\Configs` carrega toda opção do `HTTP_Server_CLI\Configs` subjacente (endereço de bind, workers, TLS ou Auto-TLS, privilege dropping, HTTP/2, endpoint de health, limites de conexão) com os defaults da plataforma preenchidos — `host: '0.0.0.0'`, `port: 8080`, `workers: 2`, `health: '/health'` — mais os três concerns do shell, `Middlewares`, `Resources` e `deferredTimeout`. Nada é obrigatório: `$App->configure()` sozinho inicializa com os defaults. Apenas named arguments — um `new Configs('0.0.0.0', 8080)` posicional levanta um `TypeError`.

> [!WARNING]
> **Breaking: os named parameters planos se foram.** `configure(port: 8080, middlewares: [...])` não existe mais, sem alias — o App segue os nodes WPI, que migraram para Configs tipados em `1.0.0-rc.1`. Embrulhe as mesmas opções em um `Web\App\Configs`: `middlewares:` vira `Middlewares:`, `resources:` vira `Resources:`, e `secure: new AutoTLS(...)` vira `AutoTLS: new AutoTLS(...)` (`secure:` fica só com o contexto TLS manual).

Toda rota recebe a **stack de middlewares padrão**: `SecureHeaders`, `RequestId`, `BodyParser` e `CSRF`. Substitua-a por inteiro quando o projeto precisar de outra (uma API REST dispensa o CSRF, por exemplo):

```php
$App->configure(new Configs(
   port: 8090,
   Middlewares: [
      new SecureHeaders,
      new RequestId,
      new BodyParser,
      new Problems  // fronteira de erros problem+json (Web\API)
   ]
));
```

Quando o projeto inclui `configs/database/` (ou `configs/kv/`), o response resource **Database** (ou **KV**) é provido automaticamente — controllers apenas usam `$Response->Database`. Resources extras vão em `Resources:` (nome => factory); uma entrada explícita `Database`/`KV` vence a automática.

Os Configs de node que o servidor recebe por conta própria viajam na mesma chamada: `Request\Configs` (limites de body e multipart) é repassado verbatim, em qualquer ordem. Um `configure()` posterior que só carrega um Configs de node desses refina por cima do `Web\App\Configs` aplicado por último — nunca volta o transporte aos defaults da plataforma. `HTTP_Server_CLI\Configs` e `Response\Configs` são compostos pelo App a partir do seu próprio Configs — entregá-los diretamente lança `InvalidArgumentException` apontando `Web\App\Configs` como o caminho. O conjunto inteiro é validado primeiro (uma classe repetida, uma não suportada), então uma chamada rejeitada não aplica nada:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Configs as RequestConfigs;

$App->configure(
   new Configs(port: 8080, workers: 1, health: null),  // health: null desliga o endpoint embutido
   new RequestConfigs(maxBodySize: 32 * 1024 * 1024)
);
```

## Controllers

Um controller é um substantivo plural do seu recurso; as ações são verbos de uma palavra recebendo `(Request, Response)` — a mesma convenção de chamada dos handlers em closure:

```php
namespace Demo\Blog\Controllers;

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Web\App\Controller;


class Posts extends Controller
{
   public function list (Request $Request, Response $Response): Response
   {
      $body = $Response->Database->paginate(Post::class);

      return $this->render('posts/list', ['Posts' => $body['items']]);
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

use Demo\Blog\Controllers\Posts;


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

Os arquivos resolvem dentro da jail `statics/` do projeto (caminho normalizado e contido na base); extensões desconhecidas permanecem `application/octet-stream`. Todo arquivo é enviado com `Cache-Control: public, max-age=3600`, a menos que o `cache:` do construtor diga outra coisa.

O `Statics` lê o arquivo inteiro para a memória a cada requisição — certo para stylesheets, scripts, imagens e fontes, errado para vídeo ou downloads de vários megabytes (use `Response->upload()` ou um CDN). Adicione `middlewares: [new ETag, new Compression]` para revalidação com `304` e gzip; a seção [Arquivos Estáticos](/manual/WPI/HTTP/HTTP_Server_CLI/#arquivos-estáticos) do manual do HTTP Server CLI percorre a configuração e as trocas em produção.

## Logs

`start()` registra um sink global de arquivo: relatórios de exceção e loggers opted-in persistem em `storage/logs/<channel>.log` em todos os modos. No modo **Daemon** os workers se desconectam do terminal — o arquivo de log é onde os erros aparecem — e esse sink toma o lugar do sink padrão que o servidor instalaria nesse path, então nenhum record é persistido duas vezes.

---

## Reference

### Web\App

```php
public function __construct (Modes $Mode = Modes::Daemon)
```

Cria o shell: um `HTTP_Server_CLI` no modo dado, as convenções `Views` e a stack de middlewares padrão (`SecureHeaders`, `RequestId`, `BodyParser`, `CSRF`).

```php
public function configure (Bootgly\ABI\Configs ...$Configs): self
```

Configura o HTTP Server subjacente: no máximo um `Web\App\Configs` (nenhum aplica os defaults da plataforma) mais os Configs de node que o servidor recebe por conta própria — `Request\Configs` é repassado verbatim, em qualquer ordem. Lança `InvalidArgumentException` em uma classe de Configs repetida, em um Configs que o App não aceita, e em `HTTP_Server_CLI\Configs` ou `Response\Configs` entregues diretamente (o App os compõe a partir do seu próprio Configs). O conjunto inteiro é validado antes de qualquer aplicação.

```php
public function load (string $path): self
```

Carrega a pasta de router do projeto (`router.index.php` + `routes/*.routes.php`) e guarda o handler para o `start()`.

```php
public function start (): void
```

Registra o sink global de logs, conecta os eventos da plataforma (convenções de views + stack global de middlewares no drain do primeiro request, o banner de inicialização em `Events::ServerAdvertised` — renderizado pelo processo que possui o terminal, então sobrevive ao detach do Daemon — e o banner de parada) e inicia o servidor. Lança quando nenhum router foi carregado.

### Web\App\Configs

```php
public function __construct (
   Argument $Named = Argument::Undefined,
   null|string $host = null,                 // '0.0.0.0'
   null|int $port = null,                    // 8080
   null|int $workers = null,                 // 2
   null|array $secure = null,
   null|string $user = null,
   null|string $group = null,
   null|AutoTLS $AutoTLS = null,
   null|bool $enableHTTP2 = null,
   null|string $health = '/health',
   null|int $maxConnections = null,
   null|int $maxConnectionsPerIP = null,
   null|int $connectionIdleTimeout = null,
   null|array $Middlewares = null,
   null|array $Resources = null,
   null|int|float $deferredTimeout = null
)
```

Estende `HTTP_Server_CLI\Configs`: toda opção do servidor, com os defaults da plataforma Web preenchidos (`host`, `port` e `workers` têm fallback em vez de serem obrigatórios), mais os três concerns do shell. Apenas named arguments — o primeiro slot é o guard `Bootgly\ABI\Argument`, então uma chamada posicional levanta um `TypeError`. Lança `InvalidArgumentException` no `new` quando `secure` e `AutoTLS` são dados juntos, em uma entrada de `Middlewares` que não é um `Middleware`, ou em um valor de `Resources` que não é uma Closure indexada por nome.

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `null\|string` | `null` (= `'0.0.0.0'`) | Endereço de bind. |
| `port` | `null\|int` | `null` (= `8080`) | Porta de escuta. |
| `workers` | `null\|int` | `null` (= `2`) | Número de processos worker forkados. |
| `secure` | `null\|array` | `null` | Opções de stream context SSL/TLS; troca o scheme para `https://`. Mutuamente exclusivo com `AutoTLS`. |
| `user` | `null\|string` | `null` | Nome de usuário POSIX para rebaixar o processo após o bind. |
| `group` | `null\|string` | `null` | Nome de grupo POSIX para rebaixar o processo após o bind. |
| `AutoTLS` | `null\|AutoTLS` | `null` | HTTPS automático via Let's Encrypt (ACME). Mutuamente exclusivo com `secure`. Veja o guia [Auto-TLS](/guide/auto-tls). |
| `enableHTTP2` | `null\|bool` | `null` (= habilitado) | `false` serve apenas HTTP/1.x. |
| `health` | `null\|string` | `'/health'` | Endpoint embutido de health-check, respondido antes de qualquer middleware. `null` desabilita. |
| `maxConnections` | `null\|int` | `null` (= `10000`) | Máximo de conexões estabelecidas por worker; `0` desabilita o limite. |
| `maxConnectionsPerIP` | `null\|int` | `null` (= `0`) | Máximo de conexões estabelecidas por IP de cliente; `0` significa ilimitado. |
| `connectionIdleTimeout` | `null\|int` | `null` (= `15`) | Segundos de silêncio antes de uma conexão ociosa ser fechada; `0` desabilita o reaper. |
| `Middlewares` | `null\|array<int,Middleware>` | `null` | Substitui a stack de middlewares padrão por inteiro; `null` a mantém. |
| `Resources` | `null\|array<string,Closure>` | `null` | Response resources extras (nome => factory), mesclados com os Database/KV automáticos — entradas explícitas vencem. |
| `deferredTimeout` | `null\|int\|float` | `null` (= default do servidor) | Segundos que uma resposta deferred pode levar antes de ser cancelada. |

As opções do servidor são as mesmas do node — a semântica completa está na página do [HTTP Server](/manual/WPI/HTTP/HTTP_Server_CLI/).

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
