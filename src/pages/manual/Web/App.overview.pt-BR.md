# Web App

`Web\App` é o shell de aplicação MVC: um boot opinativo do `HTTP_Server_CLI` canônico com uma stack de middlewares padrão, dispatch de controllers, resource routing, convenções de views, assets estáticos inline e hospedagem de single-page apps.

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

`configure()` recebe **Configs** — os mesmos value objects tipados que todo node WPI recebe. Um `Web\App\Configs` carrega toda opção do `HTTP_Server_CLI\Configs` subjacente (endereço de bind, workers, TLS ou Auto-TLS, privilege dropping, HTTP/2, endpoint de health, limites de conexão, headroom do selector, timeout de ociosidade, orçamento de memória do worker, reciclagem de workers) com os defaults da plataforma preenchidos — `host: '0.0.0.0'`, `port: 8080`, `workers: 2`, `health: '/health'` — mais os três concerns do shell, `Middlewares`, `Resources` e `deferredTimeout`. Nada é obrigatório: `$App->configure()` sozinho inicializa com os defaults. Apenas named arguments — um `new Configs('0.0.0.0', 8080)` posicional levanta um `TypeError`.

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
   new RequestConfigs(maxBodySize: 12 * 1024 * 1024)  // 12 MB — dois corpos assim cabem ao mesmo tempo no orçamento de memória padrão do worker
);
```

## Reciclagem de workers

As opções do servidor que limitam um worker viajam no mesmo `Web\App\Configs`. Para limitar o que um worker de vida longa junta — um vazamento numa biblioteca, um cache sem descarte, um heap fragmentado —, deixe o servidor substituir workers por conta própria:

```php
// php.ini: memory_limit = 1G — o maxMemory precisa ficar abaixo dele
$App->configure(new Configs(
   port: 8080,
   maxRequests: 10_000,  // recicla um worker após cerca de 10 000 requisições...
   jitter: 0.1,          // ...cada worker no seu próprio limite, dentro de ±10% (o padrão)
   maxMemory: '512M'     // ...ou assim que sua memória real passar de 512 MiB
));
```

Um worker que atinge o seu limite responde a requisição em mãos e termina o que está em andamento, enquanto o master cria o substituto por fork na hora — o slot nunca fica sem worker. O `maxMemory` aceita bytes ou um tamanho como `'512M'`, e precisa ficar entre a memória com que um worker sobe e o `memory_limit` do PHP: senão o `start()` se recusa a subir, então aumente o `memory_limit` no `php.ini` antes. Um valor negativo, um `jitter` fora de `0`–`1` ou um tamanho que não é interpretável lança `InvalidArgumentException` no `new Configs`.

Mais dois limites do worker viajam do mesmo jeito: o `headroom` (`32` por padrão) mantém essa quantidade de entradas do selector de cada worker livre para as esperas do próprio worker por banco, KV e cliente HTTP, e o `maxWorkerPendingBytes` (64 MiB por padrão) é o orçamento de memória que corpos de requisição inacabados, o cache de rotas e a saída pendente compartilham em cada worker. A semântica completa deles está na página do HTTP Server: [Reciclagem de workers](/manual/WPI/HTTP/HTTP_Server_CLI/#reciclagem-de-workers), [Limites de conexão](/manual/WPI/HTTP/HTTP_Server_CLI/#limites-de-conexão) e [Orçamento de memória](/manual/WPI/HTTP/HTTP_Server_CLI/#orçamento-de-memória).

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

yield $Router->route('/statics/:file*', new Statics, [GET, HEAD]);
```

Os arquivos resolvem dentro da jail `statics/` do projeto: o nome pedido é percent-decodificado uma vez (`/statics/a%20b.png` serve `a b.png`; um `+` continua sendo um sinal de mais), tem o caminho normalizado e fica contido na base. Antes da 1.1 o `Statics` não decodificava nada, então um arquivo guardado com um `%XX` literal no nome (`a%20b.png`) agora é alcançado como `/statics/a%2520b.png` — renomeie esses arquivos. Extensões desconhecidas permanecem `application/octet-stream`. Todo arquivo é enviado com `Cache-Control: public, max-age=3600`, a menos que o `cache:` do construtor diga outra coisa. Registrar `HEAD` ao lado de `GET` responde o `HEAD` com os mesmos headers e sem body.

Uma pasta pública nunca entrega código do servidor nem segredos — estes respondem `404` mesmo quando o arquivo existe:

- dotfiles e dot-diretórios: `/statics/.env`, `/statics/.git/config`, codificados ou não;
- fontes PHP: `.php`, `.phtml`, `.pht`, `.phar` e `.php<N>`/`.phps`, em qualquer caixa — um symlink é julgado pelo arquivo para o qual aponta, então `notes.txt -> config.php` também é recusado, e um symlink para fora da pasta responde `404` como `../`;
- nomes que o `File` do core completaria para `<nome>.php` ou `<nome>/index.php` (`/statics/config` com um `config.php` ao lado).

O único dot-diretório público é o `.well-known/` ([RFC 8615](https://www.rfc-editor.org/rfc/rfc8615)), só como primeiro segmento: `/statics/.well-known/security.txt` e `/statics/.well-known/assetlinks.json` são servidos, enquanto um dotfile abaixo dele (`/.well-known/.env`) e um `a/.well-known/` aninhado continuam recusados. Outras sobras do lado do servidor — includes `.inc`, cópias `.bak`, arquivos de swap de editor — são servidas como qualquer outra extensão desconhecida: mantê-las fora da pasta pública é decisão de quem faz o deploy.

O `Statics` lê o arquivo inteiro para a memória a cada requisição — certo para stylesheets, scripts, imagens e fontes, errado para vídeo ou downloads de vários megabytes (use `Response->upload()` ou um CDN). Adicione `middlewares: [new ETag, new Compression]` para revalidação com `304` e gzip; a seção [Arquivos Estáticos](/manual/WPI/HTTP/HTTP_Server_CLI/#arquivos-estáticos) do manual do HTTP Server CLI percorre a configuração e as trocas em produção.

## Single-page apps

Um build de React, Vue ou Svelte é um `index.html` mais assets com fingerprint, e o router do lado do browser é dono dos caminhos: um reload em `/settings/profile` precisa responder o `index.html`, enquanto `/assets/index-4f9a2c1e.js` precisa responder o script. O `SPA` faz as duas coisas — o fallback da history API — a partir de uma rota catch-all.

### Servir um build com history routing

Copie a saída do build (o `dist/` do Vite) para a pasta `statics/` do projeto:

```text
projects/Shop/
├── router/
│   ├── router.index.php
│   └── routes/Shop.routes.php
└── statics/
    ├── index.html
    ├── favicon.svg
    └── assets/
        ├── index-4f9a2c1e.js
        └── index-7b3d8e05.css
```

Registre a API primeiro e o SPA por último, na raiz e num catch-all:

```php
<?php

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\ETag;
use Web\App\SPA;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   // * API
   yield $Router->route('/api/health', function (Request $Request, Response $Response) {
      return $Response->JSON->send(['status' => 'ok']);
   }, GET);

   // * Interface — todos os outros caminhos
   $SPA = new SPA(excludes: ['api']);

   yield $Router->route('/', $SPA, [GET, HEAD], middlewares: [new ETag]);
   yield $Router->route('/:file*', $SPA, [GET, HEAD], middlewares: [new ETag]);
};
```

O que cada request recebe:

| Request | Resposta | `Cache-Control` |
|---|---|---|
| `/`, `/settings/profile` (sem extensão) | `200`, o `index.html` | `no-cache` |
| `/assets/index-4f9a2c1e.js` | `200`, o arquivo | `public, max-age=31536000, immutable` |
| `/favicon.svg` | `200`, o arquivo | `public, max-age=3600` |
| `/assets/missing.js` (uma extensão, nenhum arquivo) | `404` | — |
| `/api/unknown` (um primeiro segmento excluído) | `404` | — |
| `/.env`, `/.git/config`, `/index.php` | `404` | — |
| `/LICENSE` (sem extensão, um arquivo regular do build) | `200`, o arquivo | `public, max-age=3600` |
| `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association` | `200`, o arquivo | `public, max-age=3600` |
| `/.well-known/missing` | `404` | — |
| uma rota do cliente enquanto `statics/index.html` não existe | `503`, `Service Unavailable` | `no-store` |

Um nome com extensão é um arquivo; também é um nome sob `.well-known/` e um nome sem extensão que é um arquivo regular do build (`LICENSE`, `.well-known/apple-app-site-association`). Qualquer outro nome sem extensão é uma rota do cliente — então mantenha pontos fora do último segmento das suas rotas do cliente (`/users/jane.doe` é procurado como arquivo e responde `404`), e não dê a uma rota do cliente o nome de um arquivo que o build entrega. O fallback é só para rotas, então um bot sondando `/wp-login.php` ou `/.env` recebe `404`, não `200` com o seu HTML, e uma chamada `/api/...` sem rota recebe `404` em vez de uma página que o cliente dela não consegue interpretar. Os arquivos resolvem exatamente como no `Statics` (uma rotina `Files` compartilhada): a mesma jail, decodificação, media types e recusas.

### Revalidar com ETag

O `ETag` nas rotas do SPA marca toda resposta — o `index.html` incluído — e responde `304` com body vazio quando o browser devolve a tag no `If-None-Match`. O `no-cache` no index faz o browser revalidá-lo a cada visita, então um deploy novo é percebido na hora, enquanto visitas sem mudança custam um `304`:

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8
Cache-Control: no-cache
ETag: W/"5b49ea7eb15657d8"

HTTP/1.1 304 Not Modified
ETag: W/"5b49ea7eb15657d8"
```

O mesmo middleware funciona numa rota do `Statics`: `middlewares: [new ETag]`.

### Robots, favicons e o prefixo da API

```php
$SPA = new SPA(
   excludes: ['api', 'auth'],
   robots: "User-agent: *\nDisallow: /\n",
   aliases: ['favicon.ico' => 'favicon.svg']
);
```

- `excludes` — primeiros segmentos do caminho que nunca recebem o index: comparações exatas e sensíveis a maiúsculas (`'api'` exclui `/api/x`, não `/API/x` nem `/apis/x`).
- `robots` — o body de `/robots.txt`, respondido a partir da configuração (útil para manter um deploy de staging fora dos buscadores); `null` serve o `robots.txt` do próprio build.
- `aliases` — nomes que browsers pedem por conta própria, mapeados para o arquivo que o build entrega.

### Vários builds sob prefixos de caminho

Um projeto pode servir mais de um build — uma loja e um painel administrativo, por exemplo —, cada um da sua própria pasta, sob o seu próprio prefixo de URL. Faça o build de cada um com o `base` do Vite apontando para o seu prefixo, para que as URLs de assets escritas no `index.html` o carreguem, e dê ao router do cliente a mesma base (o `basename="/admin"` do React Router, o `createWebHistory('/admin/')` do Vue Router):

```js
// frontends/admin/vite.config.js — o build vai para builds/admin/ do projeto
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/admin/',
  build: {
    outDir: '../../builds/admin',
    emptyOutDir: true
  }
});
```

Depois monte um `SPA` por build, no prefixo e num catch-all abaixo dele:

```php
<?php

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\ETag;
use Web\API\Problem;
use Web\App\SPA;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   // * API — as rotas dela primeiro, depois um 404 problem+json para qualquer outro caminho da API
   yield $Router->route('/api/health', function (Request $Request, Response $Response) {
      return $Response->JSON->send(['status' => 'ok']);
   }, GET);

   $Unknown = function (Request $Request, Response $Response) {
      return new Problem(404, detail: 'No API route matches this path.')->render($Response);
   };
   yield $Router->route('/api', $Unknown);
   yield $Router->route('/api/:path*', $Unknown);

   // * Interfaces — um SPA por build, cada um no seu próprio prefixo
   foreach (['admin', 'store'] as $name) {
      $SPA = new SPA(path: "builds/{$name}");

      yield $Router->route("/{$name}", $SPA, [GET, HEAD], middlewares: [new ETag]);
      yield $Router->route("/{$name}/:file*", $SPA, [GET, HEAD], middlewares: [new ETag]);
   }
};
```

O router descarta a barra final, então `/admin` e `/admin/` chegam os dois à rota do prefixo e respondem o index, assim como uma rota do cliente como `/admin/orders/42`; `/admin/assets/index-4f9a2c1e.js` é o arquivo `builds/admin/assets/index-4f9a2c1e.js`, cacheado como imutável — o param da rota, e com ele o `immutable`, os `aliases` e todo nome que o handler serve, é relativo à pasta do build, não à URL. Uma chamada `/api/...` sem rota recebe um problem `404` do `$Unknown`, que renderiza o `Problem` em vez de lançá-lo, então nenhum middleware `Problems` é necessário na stack. Tudo o que fica fora dos prefixos — `/` incluído — precisa de rotas próprias. O exemplo `Demo/SPA` serve um build React e um build Vue desse jeito.

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

```php
public array $Middlewares
```

A stack global de middlewares, aplicada a toda rota, em ordem: a stack padrão (`SecureHeaders`, `RequestId`, `BodyParser`, `CSRF`) até que um `configure()` cujo `Configs` carregue `Middlewares:` a substitua por inteiro — uma chamada sem ele a deixa como está. O `start()` a lê uma vez, então altere-a antes.

```php
public HTTP_Server_CLI $Server
```

O node `HTTP_Server_CLI` que o shell configura e inicia, no modo do construtor — o caminho para o que o shell não embrulha. O `start()` registra `Events::RequestReceived`, `Events::ServerAdvertised` e `Events::ServerStopped` por conta própria, e um evento aceita um único callback, então o `Events::ServerStarted` é o que sobra para o `$App->Server->on()` (setup do lado do master: timers, schedulers); registrar qualquer um dos outros três faz o `start()` lançar `InvalidArgumentException`.

```php
public Views $Views
```

As convenções de views — layout padrão e variáveis compartilhadas — que o `start()` aplica ao View resource de cada worker. Altere-as antes do `start()`.

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
   null|int $headroom = null,
   null|int $connectionIdleTimeout = null,
   null|int $maxWorkerPendingBytes = null,
   int $maxRequests = 0,
   float $jitter = 0.1,
   int|string $maxMemory = 0,
   null|array $Middlewares = null,
   null|array $Resources = null,
   null|int|float $deferredTimeout = null
)
```

Estende `HTTP_Server_CLI\Configs` e carrega todas as opções dele — o orçamento de memória do worker e a reciclagem de workers incluídos — com os defaults da plataforma Web preenchidos (`host`, `port` e `workers` têm fallback em vez de serem obrigatórios), mais os três concerns do shell; o `App->configure()` repassa todas ao servidor. Apenas named arguments — o primeiro slot é o guard `Bootgly\ABI\Argument`, então uma chamada posicional levanta um `TypeError`. Lança `InvalidArgumentException` no `new` quando `secure` e `AutoTLS` são dados juntos, em uma opção de reciclagem fora da faixa (um `maxRequests` ou `maxMemory` negativo, um `jitter` fora de `0`–`1`, um tamanho de `maxMemory` que não é interpretável), em uma entrada de `Middlewares` que não é um `Middleware`, ou em um valor de `Resources` que não é uma Closure indexada por nome.

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
| `headroom` | `null\|int` | `null` (= `32`) | Entradas do selector que cada worker mantém livres para o I/O das suas próprias dependências — esperas deferred por banco, KV e cliente HTTP —, descartando clientes mais cedo; `0` o desativa. |
| `connectionIdleTimeout` | `null\|int` | `null` (= `15`) | Segundos de silêncio antes de uma conexão ociosa ser fechada; `0` desabilita o reaper. |
| `maxWorkerPendingBytes` | `null\|int` | `null` (= 64 MiB) | Orçamento de memória do worker, compartilhado por corpos de requisição inacabados, o cache de rotas e a saída pendente, medidos pelo que o alocador gasta. Reduzido à metade do `memory_limit` no start, com um aviso, quando não cabe. |
| `maxRequests` | `int` | `0` | Requisições que um worker despacha antes de reciclar — o substituto é criado por fork na hora enquanto ele drena; `0` nunca recicla. |
| `jitter` | `float` | `0.1` | Dispersão do limite próprio de cada worker em torno de `maxRequests` (`0.1` = ±10%), para que os workers não reciclem juntos; de `0` a `1`. |
| `maxMemory` | `int\|string` | `0` | Memória real (`memory_get_usage(true)`) acima da qual um worker recicla — bytes, ou um tamanho como `'512M'`. Precisa ficar entre a memória com que um worker sobe e o `memory_limit`, senão o `start()` se recusa a subir; `0` o mantém desligado. |
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

Redireciona pela Response — apenas para um destino relativo, começando por `/`. Ele chama `$Response->redirect($URI, $code)` sem `allowExternal`, então a proteção contra open redirect do core envia `/` no lugar de uma URL absoluta (`https://example.com/`), de um `//example.com` relativo ao protocolo ou de qualquer outro destino que não comece com `/` — e, externo ou não, no lugar de um destino com caractere de controle, barra invertida ou esquema executável (`javascript:`, `data:`, `vbscript:`, `file:`). Para um destino externo, chame a Response a partir da ação: `return $Response->redirect($URI, $code, allowExternal: true);` — depois de conferir o `$URI` contra os hosts que você permite, nunca com input do usuário sem checagem. Um code null deriva do método do request (POST → 303, senão 307), e o mesmo vale para um code que não seja 300–303, 307 ou 308.

### Web\App\Controllers

```php
public static function map (Router $Router, string $path, string $controller, null|array $only = null, null|array $except = null, array $middlewares = [], null|string $constraint = 'int'): Generator
```

Expande uma declaração de recurso MVC na tabela de rotas acima. Nomes de ação desconhecidos em `only`/`except` lançam no momento do registro; `middlewares:` aplica a toda rota expandida.

### Web\App\Files

A rotina de arquivos que `SPA` e `Statics` compartilham. Use-a diretamente para servir arquivos a partir de um handler seu.

```php
public function __construct (string $path = 'statics')
```

Prende todo nome sob o diretório de projeto `path` (relativo à raiz do projeto).

```php
public function resolve (string $file): null|string
```

Transforma um nome pedido — o param catch-all da rota exatamente como o router o entrega, ainda percent-encoded — num nome limpo relativo à jail: decodificado uma vez (`rawurldecode()`: `+` continua sendo um sinal de mais), separadores unificados, `.`/`..` colapsados. Retorna `null` para um nome vazio, um byte nulo, um caminho absoluto, um nome que normaliza para a própria jail (`./`, `a/../`) ou qualquer segmento dotfile do nome normalizado — exceto um primeiro segmento `.well-known` (RFC 8615).

```php
public function serve (string $file, Response $Response, string $cache): false|Response
```

Envia um nome resolvido inline com o media type da extensão do seu alvo real (um symlink é tipado e julgado pelo arquivo para o qual aponta) e o `Cache-Control` dado, lendo o arquivo inteiro para a memória. O nome não é decodificado de novo. Retorna `false`, sem escrever nada, quando o arquivo é um fonte PHP (`.php`, `.php<N>`, `.phps`, `.phtml`, `.pht`, `.phar`), não existe, é um diretório, não é legível ou está fora da jail — a conversão do `File` do core para `<nome>.php` / `<nome>/index.php` fica desligada.

```php
public private(set) string $path
```

O diretório da jail, relativo à raiz do projeto, como o construtor o recebeu (`'statics'` por padrão). Somente leitura.

```php
public string $base { get }
```

O diretório absoluto da jail (o path do projeto mais `path`), com barra no final. Somente leitura.

```php
public const array TYPES
```

Media type por extensão em minúsculas (26 entradas: CSS, JavaScript, JSON e source maps, HTML, SVG, o web manifest e os formatos usuais de imagem, fonte, vídeo, PDF e WebAssembly). Tipos de texto levam `charset=UTF-8`; JSON não (a RFC 8259 não define parâmetro charset). Uma extensão fora da lista é enviada como `application/octet-stream`.

### Web\App\SPA

```php
public function __construct (
   string $path = 'statics',
   string $index = 'index.html',
   string $param = 'file',
   array $excludes = [],
   string $immutable = 'assets/',
   string $cache = 'public, max-age=3600',
   null|string $robots = null,
   array $aliases = []
)
```

Handler invocável de single-page app para a rota raiz e uma rota de param catch-all (`/:file*`) — ou para um prefixo e o catch-all sob ele (`/admin`, `/admin/:file*`). Cada argumento fica guardado na propriedade somente leitura de mesmo nome abaixo; `path` é lido do seu `Files`.

```php
public function __invoke (object $Request, object $Response): object
```

Responde um request. Lê o nome pedido do param de rota `param` (vazio na rota raiz) e serve os arquivos do build pelo `Files` — um nome com extensão, um nome sob `.well-known/` ou um arquivo regular sem extensão do build — e o index a todo outro caminho. Um nome recusado ou excluído responde `404`, assim como um nome de arquivo ausente, ilegível ou fonte PHP; um fallback enquanto o index falta responde `503`. Retorna a Response.

```php
public string $path { get }
```

Diretório do projeto (relativo à raiz do projeto) que guarda o build — `'statics'` por padrão, lido do `$Files->path`.

```php
public private(set) string $index
```

O documento para o qual toda rota do cliente cai (`'index.html'` por padrão), enviado com `Cache-Control: no-cache` — também quando pedido pelo nome. Se faltar, todo fallback responde `503` com o body neutro `Service Unavailable` e `Cache-Control: no-store`.

```php
public private(set) string $param
```

Param da rota que carrega o caminho pedido (`'file'` por padrão); vazio na rota raiz.

```php
public private(set) array $excludes
```

Primeiros segmentos do caminho (`['api']`) respondidos com `404`, nunca com o index — nenhum por padrão. Comparações exatas e sensíveis a maiúsculas do primeiro segmento, feitas depois da decodificação e da normalização: `/%61pi/x` e `/./api/x` também ficam excluídos, `/API/x` e `/apis/x` não.

```php
public private(set) string $immutable
```

Prefixo de caminho da saída com fingerprint do build (`'assets/'` por padrão), relativo à pasta do build, enviada com `Cache-Control: public, max-age=31536000, immutable`. `''` desliga.

```php
public private(set) string $cache
```

`Cache-Control` de todo outro arquivo servido (`'public, max-age=3600'` por padrão).

```php
public private(set) null|string $robots
```

Body de `/robots.txt`, enviado como `text/plain; charset=UTF-8` com `Cache-Control: public, max-age=86400`. `null` (o padrão) serve o arquivo do próprio build.

```php
public private(set) array $aliases
```

Nome pedido => nome servido (`['favicon.ico' => 'favicon.svg']`; nenhum por padrão); o arquivo servido mantém o próprio media type.

```php
public private(set) Files $Files
```

O servidor de arquivos com jail sobre `path` — a mesma rotina `Files` pela qual o `Statics` serve.

### Web\App\Statics

```php
public function __construct (string $path = 'statics', string $param = 'file', string $cache = 'public, max-age=3600')
```

Handler invocável de arquivos estáticos para uma rota de param catch-all (`/statics/:file*`). Cada argumento fica guardado na propriedade somente leitura de mesmo nome abaixo; `path` é lido do seu `Files`.

```php
public function __invoke (object $Request, object $Response): object
```

Serve o arquivo que o param de rota `param` nomeia pelo `Files` — inline, com o media type mapeado da extensão do arquivo e o header `cache` — e responde `404` a um nome recusado, ausente ou fonte PHP. O nome pedido é percent-decodificado uma vez (novo na 1.1). Retorna a Response.

```php
public string $path { get }
```

Diretório do projeto (relativo à raiz do projeto) que serve de jail para os assets — `'statics'` por padrão, lido do `$Files->path`.

```php
public private(set) string $param
```

Param da rota que carrega o arquivo pedido (`'file'` por padrão).

```php
public private(set) string $cache
```

`Cache-Control` de todo asset servido (`'public, max-age=3600'` por padrão).

```php
public private(set) Files $Files
```

O servidor de arquivos com jail sobre `path`.

### Web\App\Views

```php
public string $layout = 'layouts/main'
```

O layout padrão que envolve toda renderização que não declara `@extends` — `views/layouts/main.template.php`. Vazio o desliga; o argumento `layout:` da própria renderização o sobrescreve.

```php
public array $shared = []
```

Variáveis exportadas a toda renderização, por nome — onde o `share()` mescla.

```php
public function share (array $variables): self
```

Mescla variáveis exportadas a toda renderização (valores posteriores vencem).

```php
public function apply (Response $Response): void
```

Aplica o layout + exports compartilhados no View resource da Response — chamado pelo `App->start()` no drain do primeiro request de cada worker.
