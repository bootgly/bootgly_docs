# HTTP Server CLI — Router

O Router fornece um sistema de roteamento flexível e poderoso para o HTTP Server CLI.
Ele possui **cache automático de rotas** para alta performance, **tipos de restrição de parâmetros** para validação de entrada e um **pipeline de middlewares** para aspectos transversais.

## API

O método `route` é utilizado para definir rotas:

```php
route (string $route, callable $handler, null|string|array $methods = null, array $middlewares = [], null|array $cache = null) : false|object
```

- `$route` — o padrão da URL a corresponder (aceita parâmetros, restrições e catch-all).
- `$handler` — o callback a ser executado quando a rota for correspondida.
- `$methods` — o(s) método(s) HTTP que essa rota deve atender.
- `$middlewares` — um array opcional de middlewares para esta rota específica.
- `$cache` — opções do cache de resposta da rota (veja **Cache de Resposta de Rota**): `['TTL' => <segundos>]`.

Argumentos de `$handler`:

- `$Request` — a Requisição do Servidor HTTP
- `$Response` — a Resposta do Servidor HTTP
- `$Route` — o objeto Route correspondido (apenas quando o manipulador não é uma Closure; em Closures, `$this` é vinculado ao Route)

## Uso Básico

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return static function
(Request $Request, Response $Response, Router $Router): Generator
{
   yield $Router->route('/', function (Request $Request, Response $Response) {
      return $Response(body: 'Olá Mundo!');
   }, GET);

   // @ Catch-all 404
   yield $Router->route('/*', function (Request $Request, Response $Response) {
      return $Response(code: 404, body: 'Não Encontrado');
   });
};
```

> Você deve usar `yield` (Generator) se definir mais de uma rota. Isso garante consistência e desempenho nas Respostas HTTP por debaixo dos panos.

## Callbacks de Rota

### Passando Closures como manipulador

Dentro de um handler Closure, `$this` é vinculado ao objeto `Route`, dando acesso direto a `$this->Params`.

```php
yield $Router->route('/', fn (Request $Request, Response $Response) => $Response(body: 'Olá Mundo!'), GET);
```

```php
yield $Router->route('/', function (Request $Request, Response $Response) {
   return $Response(body: 'Olá Mundo!');
}, GET);
```

### Passando funções como manipulador

Suponha que você tenha a seguinte função:

```php
function falar (Request $Request, Response $Response, Route $Route): Response
{
   $queries = $Request->queries;
   $mensagem = 'Olá ' . ($queries['quem'] ?? 'Mundo!');

   return $Response(code: 200, body: $mensagem);
}
```

```php
yield $Router->route('/ola', 'falar', GET);
```

### Passando métodos como manipulador

Suponha que você tenha a seguinte classe:

```php
class Mundo
{
   public static function ola (Request $Request, Response $Response, Route $Route): Response
   {
      return $Response(body: 'Olá Mundo!!!');
   }
}
```

```php
yield $Router->route('/ola', __NAMESPACE__ . '\Mundo::ola', GET);
```

## Rota com múltiplos métodos HTTP

```php
yield $Router->route('/dados', function ($Request, $Response) {
   return $Response(body: 'Dados!');
}, [GET, POST]);
```

## Rotas de corpo fixo

```php
serve (string $route, string $body, null|string|array $methods = null, array $middlewares = []) : false
```

`serve()` registra uma rota que sempre responde com a mesma string — não há handler. É a forma mais curta e mais rápida de publicar uma resposta constante, como um health check ou uma página fixa:

```php
yield $Router->serve('/health', 'OK', GET);
yield $Router->serve('/sobre', '<h1>Sobre nós</h1>', GET);
```

Ela se comporta como um `route()` com um handler que retorna `$Response(body: $body)`:

- A resposta é `200 OK` com `$body` como corpo. Ela não define headers próprios.
- `$methods`, parâmetros de rota, grupos e catch-all funcionam exatamente como em `route()`. Registrar a mesma rota com `route()` e com `serve()` mantém o último registro.
- `$middlewares` (e os middlewares de grupo via `intercept()`) continuam rodando em toda requisição.
- Uma rota estática sem middlewares pula a chamada de handler por completo: a string armazenada é copiada direto para a resposta.

`$body` é o próprio conteúdo da resposta, fixado quando as rotas são registradas — **não** é um caminho de arquivo: `serve('/logo', 'statics/logo.png')` responde com o texto `statics/logo.png`. Para enviar um arquivo, use [`Response::upload()`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/#enviando-arquivos) (download) ou [leia-o num handler](/manual/WPI/HTTP/HTTP_Server_CLI/Response/#enviar-o-conteúdo-de-um-arquivo-inline) (inline). Para conteúdo que muda a cada requisição, use `route()`.

## Parâmetros de Rota

Parâmetros de rota são definidos com a sintaxe `:nomeDoParametro`. Dentro de handlers Closure, acesse os parâmetros via `$this->Params->nomeDoParametro`.

### Parâmetros básicos (sem restrição)

Quando nenhuma regex ou tipo de restrição é definido, o parâmetro corresponde a qualquer caractere que não seja barra:

```php
yield $Router->route('/usuario/:id', function ($Request, $Response) {
   return $Response(body: 'ID do Usuário: ' . $this->Params->id);
}, GET);
```

### Restrição regex pré-definida

Defina um padrão regex no objeto `Route->Params` antes de definir a rota:

```php
$Route->Params->id = '[0-9]+';

yield $Router->route('/usuario/:id', function ($Request, $Response) {
   return $Response(body: 'ID do Usuário: ' . $this->Params->id);
}, GET);
```

### Restrição regex inline

Defina a regex diretamente no padrão da rota usando parênteses `:nomeParam(regex)`:

```php
yield $Router->route('/pedido/:oid(\\d+)', function ($Request, $Response) {
   return $Response(body: 'ID do Pedido: ' . $this->Params->oid);
}, GET);
```

### Tipos de Restrição de Parâmetros

Use a sintaxe `<tipo>` para restrições de validação built-in. Essas são expandidas para regex em **tempo de compilação** com **custo zero em tempo de execução**:

```php
yield $Router->route('/usuario/:id<int>', function ($Request, $Response) {
   // :id só aceita inteiros (ex: /usuario/42 ✅, /usuario/abc ❌)
   return $Response(body: 'ID do Usuário: ' . $this->Params->id);
}, GET);
```

| Tipo | Padrão | Descrição | Exemplo |
|------|--------|-----------|---------|
| `int` | `[0-9]+` | Números inteiros | `42`, `123` |
| `alpha` | `[a-zA-Z]+` | Apenas caracteres alfabéticos | `books`, `Admin` |
| `alphanum` | `[a-zA-Z0-9]+` | Caracteres alfanuméricos | `abc123`, `Item5` |
| `slug` | `[a-zA-Z0-9_-]+` | Slug URL-safe (letras, números, hífen, underscore) | `hello-world_2` |
| `uuid` | Padrão UUID v4 | Formato UUID padrão | `550e8400-e29b-41d4-a716-446655440000` |

#### Exemplos

```php
// @ Restrição alpha — apenas letras
yield $Router->route('/categoria/:nome<alpha>', function ($Request, $Response) {
   return $Response(body: 'Categoria: ' . $this->Params->nome);
}, GET);

// @ Restrição slug — strings URL-friendly
yield $Router->route('/tag/:slug<slug>', function ($Request, $Response) {
   return $Response(body: 'Tag: ' . $this->Params->slug);
}, GET);

// @ Restrição UUID — formato UUID padrão
yield $Router->route('/recurso/:id<uuid>', function ($Request, $Response) {
   return $Response(body: 'UUID: ' . $this->Params->id);
}, GET);

// @ Restrição alphanum — apenas letras e números
yield $Router->route('/item/:codigo<alphanum>', function ($Request, $Response) {
   return $Response(body: 'Item: ' . $this->Params->codigo);
}, GET);
```

Quando uma restrição não corresponde, a rota é ignorada e a próxima rota é tentada (geralmente caindo no catch-all 404).

### Múltiplos parâmetros

```php
yield $Router->route('/posts/:pid/comentarios/:cid', function ($Request, $Response) {
   return $Response(body: 'Post: ' . $this->Params->pid . ', Comentário: ' . $this->Params->cid);
}, GET);
```

### Nomes de parâmetros duplicados

Quando o mesmo nome de parâmetro aparece múltiplas vezes, ele se torna um array indexado:

```php
$Route->Params->id = '[0-9]+';

yield $Router->route('/param/:id/param/:id', function ($Request, $Response) {
   return $Response(body: 'ID 1: ' . $this->Params->id[0] . ', ID 2: ' . $this->Params->id[1]);
}, GET);
```

## Rotas Aninhadas (Grupos de Rotas)

Grupos permitem organizar rotas sob um prefixo compartilhado:

```php
yield $Router->route('/perfil/:*', function () use ($Router) {
   yield $Router->route('maria', function ($Request, $Response) {
      return $Response(body: 'Olá Maria!');
   });
   yield $Router->route('bob', function ($Request, $Response) {
      return $Response(body: 'Olá Bob!');
   });
}, GET);
```

### Rotas aninhadas com parâmetros

```php
$Route->Params->id = '[0-9]+';

yield $Router->route('/pagina/:*', function () use ($Router) {
   yield $Router->route(':id', function ($Request, $Response) {
      return $Response(body: 'ID da Página: ' . $this->Params->id);
   });
}, GET);
```

## Rotas Catch-All

### Catch-all genérico (fallback 404)

Corresponde a qualquer URL que não foi correspondida pelas rotas anteriores:

```php
yield $Router->route('/*', function ($Request, $Response) {
   return $Response(code: 404, body: 'Não Encontrado');
});
```

### Catch-all parametrizado

Captura os segmentos restantes do caminho em um parâmetro nomeado. O modificador `*` após o nome do parâmetro captura tudo incluindo barras:

```php
yield $Router->route('/busca/:consulta*', function ($Request, $Response) {
   // /busca/ola        → $this->Params->consulta === 'ola'
   // /busca/ola/mundo  → $this->Params->consulta === 'ola/mundo'
   return $Response(body: 'Busca: ' . $this->Params->consulta);
});
```

> O parâmetro catch-all deve ser o **último** segmento do caminho.

## Cache de Rotas

O Router automaticamente armazena em cache todas as definições de rotas na **primeira requisição**. Requisições subsequentes resolvem rotas do cache sem re-executar o Generator.

### Como funciona

1. **Primeira requisição**: o Generator é inteiramente iterado, cada `yield $Router->route(...)` popula as tabelas de cache.
2. **Requisições subsequentes**: o método `resolve()` realiza uma busca direta:
   - **Rotas estáticas** — busca O(1) em hash-table por URL + método.
   - **Rotas dinâmicas** — índice O(1) pelo primeiro segmento + O(m) match de regex dentro do bucket do segmento.
   - **Catch-all** — fallback após todas as rotas específicas serem verificadas.
3. **Grupos aninhados** são expandidos no cache durante o warmup (ex: `/admin/:*` → `/admin/dashboard`, `/admin/settings`).

O cache é por-worker (cada processo worker aquece seu próprio cache na primeira requisição).

### Status do cache

```php
$Router->cached; // bool — true após o cache estar aquecido
```

## Cache de Resposta de Rota

Rotas podem optar por um **cache de resposta**: o servidor armazena a resposta
completamente construída (status line + headers + body) e serve requisições
repetidas diretamente desses bytes — antes do roteamento, dos middlewares, do
handler e da serialização. Uma rota com banco de dados servida do cache
responde na velocidade de rota estática (~10× de throughput no benchmark do
Bootgly: 93k → 938k req/s).

Opte por rota com a opção `cache` e um `TTL` (tempo de vida da entrada, em
segundos):

```php
yield $Router->route('/report', function ($Request, $Response) {
   return $Response->defer(function (Response $Response): void {
      $Result = $Response->Database->fetch('SELECT count(*) AS total FROM orders');

      $Response->JSON->send($Result->row);
   });
}, GET, cache: ['TTL' => 30]);
```

A primeira requisição executa o handler e armazena a resposta construída;
toda requisição nos próximos 30 segundos é respondida a partir dos bytes
armazenados. Quando o `TTL` expira, a próxima requisição executa o handler
novamente e renova a entrada. Handlers deferred (assíncronos) são cacheados
da mesma forma que os síncronos.

### O que é cacheado — e o que nunca é

As entradas usam como chave **método + path + query string** —
`/report?page=1` e `/report?page=2` são entradas distintas. Uma resposta só é
armazenada quando a troca é segura de cachear:

- `GET` sobre `HTTP/1.1`, status `200`, body simples identity (sem streaming,
  chunking ou compressão);
- a requisição **não carrega credenciais** (`Cookie` / `Authorization`) e pede
  para manter a conexão viva;
- a resposta **não define cookies** (`Set-Cookie`).

Requisições com credenciais também nunca **leem** o cache — um usuário logado
sempre alcança o handler.

### Quando o cache sai de cena

Cada um destes casos faz uma rota com `cache:` executar o handler em toda
requisição. Nenhum deles é reportado — a rota simplesmente se comporta como se
não tivesse a opção `cache`:

- **A rota tem middlewares** — os seus próprios `middlewares:` ou o
  `intercept()` de um grupo. O replay do cache pula o handler, então uma rota
  cujos middlewares precisam rodar em toda requisição nunca é armazenada.
- **O servidor tem um middleware global** — qualquer entrada em
  `SAPI::$Middlewares`, ou um listener de `Request\Events::Received` /
  `Request\Events::Handled`, desliga o cache para todas as rotas.
- **A requisição veio por um proxy** — uma requisição com `X-Forwarded-For`,
  `X-Forwarded-Proto` ou `X-Real-IP` — ou com um `header`/`relay` configurado num
  [TrustedProxy](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/#trustedproxy),
  como `CF-Connecting-IP` — é buscada em um espaço de chaves próprio e nunca
  armazena uma entrada, então atrás de um load balancer que adiciona esses
  campos o cache fica vazio.
- **A requisição pede uma resposta nova** — `Cache-Control: no-cache` pula a
  busca.
- **A resposta é grande demais** — uma entrada só é armazenada com até 1 MiB de
  bytes de wire.

Navegadores enviam os seus cookies em toda requisição ao seu site, então em um
site que usa Session o cache atende apenas clientes sem cookie. Ele serve para
respostas de API públicas buscadas por clientes sem cookies; para assets
estáticos, conte com `Cache-Control` e um CDN — veja
[Arquivos Estáticos](/manual/WPI/HTTP/HTTP_Server_CLI/#arquivos-estáticos).

### Escopo e limites

O armazenamento é **por worker** (in-process), guarda até 512 entradas (a mais
antiga é removida primeiro) e atualiza o header `Date` das respostas
armazenadas uma vez por segundo. Não há compartilhamento entre workers: cada
worker aquece a própria entrada dentro de uma janela de `TTL`. Os bytes
armazenados de um worker são limitados a 64 MiB
(`HTTP_Server_CLI\Cache::$maxBytes`, definido antes de o servidor iniciar), e as
entradas também usam o [orçamento de memória](/manual/WPI/HTTP/HTTP_Server_CLI/#orçamento-de-memória)
do worker: pelo que o alocador gasta para mantê-las, no máximo um quarto dele —
16 MiB por padrão, então 8 entradas de cerca de 1 MiB (cada uma custa um chunk
inteiro de 2 MiB) ou muitas mais, se pequenas. Um armazenamento que não cabe
despeja primeiro as entradas mais antigas; uma resposta que ainda assim não cabe
é servida sem ir para o cache.

## Middlewares de Grupo de Rotas (intercept)

```php
public function intercept (Middleware ...$middlewares): void;
```

Aplica middlewares a todas as rotas definidas após a chamada `intercept()` dentro do escopo de roteamento atual:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CORS;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;

$Router->intercept(new CORS, new RateLimit(limit: 100, window: 60, scope: 'public-api'));

yield $Router->route('/api/:*', function ($Request, $Response) use ($Router) {
   // Todas as rotas aninhadas herdam CORS + RateLimit
   yield $Router->route('users', function ($Request, $Response) {
      return $Response->JSON->send(['users' => []]);
   }, GET);
}, GET);
```

### Middlewares por rota

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RequestId;

$RequestId = new RequestId;
yield $Router->route('/protegido/dashboard', function ($Request, $Response) {
   return $Response(body: 'Dashboard Protegido');
}, GET, middlewares: [$RequestId]);
```

Quando middlewares de grupo e de rota estão presentes, eles são **mesclados** — middlewares de grupo executam primeiro, depois os de rota, formando um único pipeline onion ao redor do handler.

Veja [Middlewares](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares) para a documentação completa do pipeline de middlewares.

## Lista de Rotas

`$Router->Routes` lista as rotas que o Router armazenou — uma linha por rota, na ordem em que foram registradas. É somente leitura e não custa nada por requisição: as linhas são escritas enquanto as rotas são registradas, e o dispatcher nunca as lê.

### Lendo a lista em um handler

```php
yield $Router->route('/routes', function ($Request, $Response) use ($Router) {
   $routes = [];
   foreach ($Router->Routes as $Registration) {
      $routes[] = [
         'path' => $Registration->path,
         'methods' => $Registration->methods ?? 'any',
         'kind' => $Registration->Kind->name,
      ];
   }

   return $Response->JSON->send($routes);
}, GET);
```

A lista está completa quando `$Router->cached` é `true`. Um handler sempre a vê completa — handlers rodam depois do warmup —, incluindo as rotas registradas depois da dele. As rotas de um grupo vêm depois das de nível superior: um grupo registra suas rotas quando é expandido, no fim do warmup.

### Lendo a lista sem uma requisição

Fora do servidor — um teste, um comando, uma ferramenta — não existe primeira requisição para aquecer o Router. `warm()` faz isso: passe o Generator que o seu conjunto de rotas retorna.

Esta verificação falha quando uma rota da API foi adicionada sem uma linha na lista publicada:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;

$Router = new Router;
$Handler = $Router->load(__DIR__ . '/router'); // a pasta que o seu servidor carrega
$Router->warm($Handler(new Request, new Response, $Router));

$published = [
   'GET /api/users',
   'POST /api/users',
   'GET /api/users/:id<int>',
];

$missing = [];
foreach ($Router->Routes as $Registration) {
   if (str_starts_with($Registration->path, '/api/') === false) {
      continue;
   }

   foreach ($Registration->methods ?? ['ANY'] as $method) {
      $line = "$method {$Registration->path}";
      if (in_array($line, $published, true) === false) {
         $missing[] = $line;
      }
   }
}
// $missing — as rotas da API que ninguém publicou
```

`warm()` deixa `$Router->cached` em `true`, exatamente como a primeira requisição. Em um Router já aquecido ele não faz nada.

### O que uma linha diz

- **`path`** — o caminho como você escreveu, com o prefixo do grupo aplicado: `/api/users/:id<int>`. A raiz é `/` e o catch-all genérico é `/*`.
- **`methods`** — os métodos que o Router aceita para a rota; `null` significa qualquer método. Uma rota de grupo registrada sem métodos herda os do grupo; uma registrada com métodos fica só com os que o grupo também tem.
- **`Middlewares`** — todo middleware que roda para a rota, do mais externo para o mais interno: os de `intercept()` em vigor quando a rota foi registrada, os do grupo e, por fim, os `middlewares:` da própria rota. Uma rota registrada antes de uma chamada a `intercept()` não a carrega.
- **`handler`** — o callable que você passou para `route()`. Uma rota de `serve()` não tem handler: tem um **`body`**.
- **`parameters`** — uma entrada por `:param`, na ordem do caminho, com o `name`, o tipo de `constraint` quando você usou um (`int`, `slug`, …) e o `pattern` que o segmento precisa casar.
- **`cache`** — as opções de `cache:` como você escreveu. Uma rota com middlewares nunca é servida do cache de resposta (veja [Quando o cache sai de cena](#quando-o-cache-sai-de-cena)), então confira `Middlewares` também.
- **`Kind`** — como o Router encontra a rota: `Static`, `Dynamic`, `CatchAll`, ou `Body` para uma rota de `serve()` respondida sem chamar um handler.

### Um log de registro

A lista registra o que foi registrado, não qual rota vence uma requisição:

- **Um caminho registrado duas vezes tem duas linhas.** Para um caminho estático e para o catch-all genérico, quem responde é o registro mais recente; para um caminho dinâmico, o mais antigo.
- **Uma linha diz o que o Router faz**, quando isso difere dos argumentos:
  - o catch-all genérico `/*` responde a qualquer método, então seu `methods` é `null`, não importa o que foi passado;
  - uma rota dinâmica registrada com uma lista de métodos vazia (`[]`) responde a qualquer método — `null` também;
  - uma rota estática registrada com uma lista de métodos vazia não é armazenada: não tem linha e não casa com nada;
  - uma rota estática registrada com um nome de método vazio (`''`, sozinho ou em uma lista) responde a qualquer método — `null` também;
  - uma rota registrada como `''` dentro de um grupo cai na raiz do site — seu `path` é `/`.
- **Nem tudo deixa uma linha.** Um grupo (`/admin/:*`) não é uma rota — suas filhas são. Um registro feito com o Router pausado, depois do warmup, ou um que lançou uma exceção não armazenou nada.
- **Um warmup que lança uma exceção** deixa a lista vazia e `$Router->cached` em `false`; a próxima requisição registra todas as rotas de novo. O que a tentativa que falhou armazenou continua nas tabelas de busca do Router, então depois de uma falha dessas uma rota pode responder sem ter linha.
- **Um conjunto de rotas que roda mais de uma vez é registrado no log a cada vez.** A lista só é esvaziada quando o próprio warmup lança. Um handler que registra com chamadas diretas a `$Router->route()` e depois responde ele mesmo à requisição — ou lança — deixa o Router frio: a próxima requisição roda os registros de novo e as linhas se repetem, uma cópia a mais por requisição, até que uma requisição chegue a uma rota. Registre com um Generator (`yield $Router->route(...)`), ou retorne *antes* de registrar, e a lista guarda cada rota uma vez só.

## Objeto Route

`Route` é o **match atual**: o estado da rota que o Router casou para a requisição em atendimento — o `$this` dentro de um handler Closure. Não é uma rota registrada; para isso, leia uma linha da [lista de rotas](#lista-de-rotas).

A classe `Route` (`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Route`) expõe as seguintes propriedades:

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `path` | `string` | O caminho da requisição que casou (`/user/42`), não o padrão da rota |
| `Params` | `Params` | Container dos parâmetros da rota |
| `Middlewares` | `array<Middleware>` | A cadeia de middlewares dobrada em volta da rota casada (entradas do grupo primeiro, depois as da própria rota), presente só enquanto um dispatch com middleware roda — a cadeia que uma geração deferred mantém para suas fronteiras `Recovering` (veja [Middlewares](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares)) |
| `base` | `string` | O caminho base da requisição (property hook) |

### Objeto Params

A classe `Params` (`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Route\Params`) fornece acesso dinâmico tipado aos parâmetros da rota:

```php
$this->Params->id;       // string — valor de parâmetro único
$this->Params->id[0];    // string — primeiro valor de parâmetro duplicado
$this->Params->id[1];    // string — segundo valor de parâmetro duplicado
```

`Params` implementa `IteratorAggregate`, então você pode iterar sobre todos os parâmetros capturados:

```php
foreach ($this->Params as $nome => $valor) {
   // $nome  → 'id', 'slug', etc.
   // $valor → 'abc', ['val1', 'val2'], etc.
}
```

## Referência

### Router

```php
public private(set) array $Routes
```

A lista de rotas: `array<int,Registration>`, uma linha por rota armazenada, na ordem de registro. Completa quando `$cached` é `true`. Pode ser lida de qualquer lugar; só o Router escreve nela.

```php
warm (null|Generator $Routes = null) : void
```

Aquece o cache de rotas sem uma requisição: itera `$Routes` (o Generator que um conjunto de rotas retorna) e depois expande os grupos de rotas. Passe `null` quando as rotas foram registradas com chamadas diretas a `$Router->route()`. Não faz nada em um Router já aquecido. Se um conjunto de rotas ou um registro lançar, a exceção é relançada, o Router continua frio e a lista de rotas é esvaziada (as tabelas de busca mantêm o que essa tentativa armazenou).

### Registration

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Registration` — uma linha da lista de rotas. Todas as propriedades são somente leitura.

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `path` | `string` | O caminho registrado com o prefixo do grupo; `/` para a raiz, `/*` para o catch-all genérico |
| `methods` | `null\|array<int,string>` | Os métodos que o Router aceita; `null` quando a rota responde a qualquer método |
| `handler` | `null\|object\|array\|string` | O callable como foi registrado; `null` para uma rota de `serve()` |
| `body` | `null\|string` | O corpo fixo de uma rota de `serve()`; `null` para uma de `route()` |
| `Middlewares` | `array<int,Middleware>` | Os middlewares que rodam para a rota, do mais externo para o mais interno |
| `parameters` | `array<int,array{name: string, constraint: null\|string, pattern: string}>` | Os parâmetros na ordem do caminho; `pattern` é `[^\/]+` para um parâmetro simples e `.+` para um `:name*` |
| `cache` | `null\|array{TTL: int}` | As opções de `cache:` como registradas; `null` sem elas |
| `Kind` | `Kinds` | Como o Router encontra a rota |

### Kinds

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Registration\Kinds`

| Case | Significado |
|------|-------------|
| `Static` | Um caminho literal, encontrado com uma busca e respondido pelo seu handler |
| `Dynamic` | Um caminho com segmentos `:param` |
| `CatchAll` | O fallback genérico `/*` |
| `Body` | Um caminho literal registrado com `serve()` e sem middleware: o corpo é copiado para a resposta sem chamar um handler |
