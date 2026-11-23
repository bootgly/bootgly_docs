# HTTP Server CLI — Router

O Router fornece um sistema de roteamento flexível e poderoso para o HTTP Server CLI.
Ele possui **cache automático de rotas** para alta performance, **tipos de restrição de parâmetros** para validação de entrada e um **pipeline de middlewares** para aspectos transversais.

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
function falar (Request $Request, Response $Response): Response
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
   public static function ola (Request $Request, Response $Response): Response
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

`serve()` registra uma rota que sempre responde com a mesma string — não há handler. É a forma mais curta e mais rápida de publicar uma resposta constante, como um health check ou uma página fixa:

```php
yield $Router->serve('/health', 'OK', GET);
yield $Router->serve('/sobre', '<h1>Sobre nós</h1>', GET);
```

Ela se comporta como um `route()` com um handler que retorna `$Response(body: $body)`:

- A resposta é `200 OK` com `$body` como corpo. Ela não define headers próprios.
- `$methods`, parâmetros de rota, grupos e catch-all funcionam exatamente como em `route()`. Quando a mesma rota é registrada com `route()` e com `serve()`, uma rota estática e o catch-all respondem com o registro mais recente, uma rota com parâmetros com o mais antigo (veja [Um log de registro](#um-log-de-registro)).
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
novamente e renova a entrada.

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
- **O handler faz defer** — uma resposta respondida por `$Response->defer()`
  nunca é armazenada, espere o trabalho ou termine de imediato: a rota executa
  o handler em toda requisição.

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

`intercept()` aplica middlewares a todas as rotas definidas após a chamada dentro do escopo de roteamento atual. Um Router já aquecido ignora a chamada — nenhuma rota é registrada depois do warmup:

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

O inventário de rotas — todo caminho, método e padrão de parâmetro da aplicação — não é informação pública: proteja a rota que o publica como qualquer rota privada (veja [Authentication](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/overview/)).

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Bearer;

$Admin = new Authentication(new Authenticating(
   new Bearer(function (string $token, Request $Request): bool {
      return hash_equals((string) getenv('ROUTES_TOKEN'), $token);
   })
));

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
}, GET, middlewares: [$Admin]);
```

A lista está completa quando `$Router->cached` é `true`. Um handler de rota sempre a vê completa — handlers de rota rodam depois do warmup —, incluindo as rotas registradas depois da dele. O próprio handler de requisição e um handler de grupo rodam durante o warmup: eles veem a lista até onde ela já chegou, com `$Router->cached` ainda `false`. Um handler de requisição que registra com chamadas diretas também roda de novo depois do warmup, em uma requisição que nenhuma rota responde: aí ele vê a lista completa. As rotas de um grupo vêm depois das de nível superior: um grupo registra suas rotas quando é expandido, no fim do warmup.

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
- **Uma rota dinâmica guarda um nome de método vazio como foi escrito.** Seu `methods` lista `''` — `['']`, `['GET', '']` — embora nenhuma requisição tenha esse método: a rota responde só aos outros métodos da sua lista, e `['']` a nenhum.
- **Nem tudo deixa uma linha.** Um grupo (`/admin/:*`) não é uma rota — suas filhas são. Um registro feito com o Router pausado, depois do warmup, ou um que lançou uma exceção não armazenou nada.
- **Um warmup que lança uma exceção** deixa `$Router->cached` em `false` e o Router como o warmup o encontrou — a lista e as tabelas de busca —, então a próxima requisição registra todas as rotas de novo. A exceção é um conjunto de rotas que aqueceu o Router por conta própria (uma chamada a `warm()` dele mesmo) antes de lançar: o Router então continua aquecido, com as rotas armazenadas até aquela chamada.
- **Um conjunto de rotas que roda mais de uma vez é listado uma vez só.** Um handler que registra com chamadas diretas a `$Router->route()` roda de novo a cada requisição até o Router estar aquecido, e o Router continua frio enquanto esse handler responde ele mesmo à requisição ou lança. O servidor rebobina o Router antes de cada uma dessas execuções: a primeira rota que uma execução registra parte do que o Router tinha antes da primeira execução, então a lista e as tabelas de busca guardam uma cópia de cada rota. Uma execução que não registra nada não muda nada. Fora do servidor, chame `rewind()` antes de cada execução de um handler desses.
- **As rotas de uma execução são inteiras, ou nada.** Assim que uma execução registra uma rota, as rotas que uma execução anterior registrou e esta não repete deixam de existir: não proteja parte das rotas para rodar uma vez só (uma flag `static`, um `require_once`) enquanto o resto roda a cada requisição.
- **Os middlewares de `intercept()` acompanham o registro, e nunca diminuem.** Em um handler que registra com chamadas diretas, um registro que uma execução anterior também fez — mesmos métodos e caminho, a mesma vez na execução (um registro recusado não conta) — é armazenado com os middlewares que esta execução interceptou por conta própria até ali, na ordem deles, mais cada um que tinha então e que esta execução não interceptou, mantido no seu lugar. Um middleware construído de novo do mesmo jeito a cada execução — a mesma classe com os mesmos valores de propriedade, os objetos e closures que ele guarda comparados do mesmo jeito — é o mesmo middleware e fica uma vez; um com outra configuração é outro middleware, então os dois rodam. O que não dá para comparar conta como outro: um objeto de uma classe que o PHP define, ou de uma que a estende (`stdClass` e os objetos que `json_decode()` devolve, `PDO`, `DateTime`, `SplObjectStorage`, um `WeakMap` — logo o `AccessLog` que vem no framework também), um objeto lazy ainda não inicializado, uma closure declarada numa linha que declara outra função (`fn ($role) => new Gate(fn () => …)`: ponha a closure de dentro numa linha só dela), uma closure vinda de `eval()` ou declarada num arquivo PHP maior que 256 KiB, `NAN` e o que estiver aninhado a mais de 16 níveis — assim como um middleware construído a partir do que muda a cada execução (a requisição, a hora). Um middleware assim fica uma vez por execução enquanto o Router está frio, e depois roda uma vez por execução dessas a cada requisição: construa-o uma vez só, antes da primeira requisição ou fora do handler. Um middleware é comparado como está quando a rota é registrada: o que ele guarda em outro lugar (um `WeakMap` ou uma tabela estática com ele como chave) ou o que muda nele depois não é visto, então um middleware cuja decisão de acesso dependa disso não deve ser interceptado numa execução só. Um registro novo leva os middlewares em vigor naquele ponto: até o primeiro `intercept()` da execução, os que a execução anterior tinha ao terminar; depois dele, os interceptados antes da primeira requisição mais os desta execução. Assim, uma rota fica atrás de um middleware interceptado só na primeira execução — ao lado de outras chamadas a `intercept()` que rodam toda vez, ou não — ou só em uma execução posterior, um middleware construído do mesmo jeito em toda execução roda uma vez, e uma rota pública registrada antes do `intercept()` em toda execução continua pública. Dois formatos ainda perdem um middleware interceptado só na primeira execução, então evite-os: uma rota que só uma execução posterior registra, depois de um `intercept()` dessa execução, quando ela pula o da primeira execução; e um caminho que uma execução registra menos vezes que a anterior, quando um registro anterior dele ficava antes do `intercept()` da primeira execução. Um conjunto de rotas que entrega suas rotas com `yield` não herda nada de uma execução anterior — o warmup o registra por conta própria, começando sem middleware —, então não proteja nada dele, muito menos um `intercept()`.

## Objeto Route

`Route` é o **match atual**: o estado da rota que o Router casou para a requisição em atendimento — o `$this` dentro de um handler Closure. Não é uma rota registrada; para isso, leia uma linha da [lista de rotas](#lista-de-rotas).

O Router mantém um único `Route` durante a vida do worker, e o `$this` de todo handler é esse objeto. Um handler alcançado a partir de trabalho deferred — atrás de um middleware que fez defer antes do `$next`, ou roteado por um Router cujas rotas foram registradas dentro de um deferral — continua lendo o `path` e os `Params` da própria requisição: cada trecho de trabalho deferred instala o match da sua requisição nesse `Route` enquanto roda, e mantém o que roteou através de `wait()` e de um `defer()` aninhado. Trate o `Route` como somente leitura num handler. Uma entrada que um handler escreve em `$this->Params` vale só para a sua requisição: ela se mantém através de um `wait()`, e o Router esvazia `Params` antes de rotear a próxima requisição, então o handler de nenhuma requisição seguinte — inclusive a de outro cliente — a lê. O código que roda fora de um handler roteado — um middleware global, ou uma resposta servida pelo [cache de resposta de rota](#cache-de-resposta-de-rota) — ainda vê o mapa da última requisição roteada. Dentro de trabalho deferred, leia os parâmetros por `$this->Params`, nunca por um objeto `Params` capturado antes do `defer()`: esse objeto é o do worker, e a próxima requisição o esvazia. Uma propriedade inteira substituída a partir de trabalho deferred (`$this->path = …`) pode se perder no próximo `wait()`.

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
route (string $route, callable $handler, null|string|array $methods = null, array $middlewares = [], null|array $cache = null) : false
```

Registra uma rota e retorna `false`; um Router pausado ou já aquecido ignora a chamada. `$route` é o padrão da URL a corresponder — parâmetros, restrições e catch-all incluídos. `$handler` roda quando uma requisição corresponde: ele recebe o `Request` e o `Response`, e dentro de uma Closure `$this` é o `Route` correspondido. `$methods` é o método HTTP, ou os métodos, que a rota atende — qualquer método quando `null`. `$middlewares` guarda os middlewares só desta rota, e `$cache` as opções do [cache de resposta da rota](#cache-de-resposta-de-rota): `['TTL' => <segundos>]`.

```php
serve (string $route, string $body, null|string|array $methods = null, array $middlewares = []) : false
```

Registra uma rota que sempre responde `200 OK` com `$body` (veja [Rotas de corpo fixo](#rotas-de-corpo-fixo)) e retorna `false`. `$route`, `$methods` e `$middlewares` funcionam como em `route()`; um Router pausado ou já aquecido ignora a chamada.

```php
intercept (Middleware ...$Middlewares) : void
```

Aplica `$Middlewares` a toda rota registrada depois da chamada no escopo de roteamento atual (veja [Middlewares de Grupo de Rotas](#middlewares-de-grupo-de-rotas-intercept)). Um Router já aquecido ignora a chamada.

```php
public private(set) array $Routes
```

A lista de rotas: `array<int,Registration>`, uma linha por rota armazenada, na ordem de registro. Completa quando `$cached` é `true`. Pode ser lida de qualquer lugar; só o Router escreve nela.

```php
warm (null|Generator $Routes = null) : void
```

Aquece o cache de rotas sem uma requisição: itera `$Routes` (o Generator que um conjunto de rotas retorna) e depois expande os grupos de rotas. Passe `null` quando as rotas foram registradas com chamadas diretas a `$Router->route()`. Não faz nada em um Router já aquecido. Se um conjunto de rotas ou um registro lançar, a exceção é relançada e o Router continua frio, como `warm()` o encontrou: as rotas registradas antes da chamada ficam, com seus grupos pendentes de novo — a menos que o conjunto de rotas tenha aquecido o Router por conta própria antes de lançar, o que o deixa aquecido com as rotas armazenadas até ali.

```php
rewind () : void
```

Marca o início de uma tentativa de registro em um Router frio. A primeira chamada guarda o que o Router tem. Depois de cada chamada seguinte a primeira rota registrada coloca o estado guardado de volta antes de ser armazenada — as tabelas de busca, os grupos pendentes e a lista de rotas — e o primeiro `intercept()` parte de novo dos middlewares guardados. Rotas registradas antes da primeira chamada ficam, e uma tentativa que não registra nada mantém o que a anterior deixou; uma que registra uma rota mantém só as rotas que ela mesma registra. Um registro que uma tentativa anterior também fez é armazenado com os middlewares que esta tentativa interceptou por conta própria até ali, mais cada um com que foi armazenado então e que falta neles, no seu lugar; um novo leva os que estão em vigor quando é feito (veja [Um log de registro](#um-log-de-registro)). Não faz nada em um Router já aquecido. O servidor chama `rewind()` antes de cada execução do handler de requisição enquanto o Router está frio; chame você mesmo só para rodar mais de uma vez, fora do servidor, um handler que registra com chamadas diretas a `$Router->route()`.

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
