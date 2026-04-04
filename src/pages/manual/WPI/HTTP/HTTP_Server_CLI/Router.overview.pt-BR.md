# HTTP Server CLI — Router

O Router fornece um sistema de roteamento flexível e poderoso para o HTTP Server CLI.
Ele possui **cache automático de rotas** para alta performance, **tipos de restrição de parâmetros** para validação de entrada e um **pipeline de middlewares** para aspectos transversais.

## API

O método `route` é utilizado para definir rotas:

```php
route (string $route, callable $handler, null|string|array $methods = null, array $middlewares = []) : false|object
```

- `$route` — o padrão da URL a corresponder (aceita parâmetros, restrições e catch-all).
- `$handler` — o callback a ser executado quando a rota for correspondida.
- `$methods` — o(s) método(s) HTTP que essa rota deve atender.
- `$middlewares` — um array opcional de middlewares para esta rota específica.

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

## Middlewares de Grupo de Rotas (intercept)

```php
public function intercept (Middleware ...$middlewares): void;
```

Aplica middlewares a todas as rotas definidas após a chamada `intercept()` dentro do escopo de roteamento atual:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CORS;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;

$Router->intercept(new CORS, new RateLimit(limit: 100, window: 60));

yield $Router->route('/api/:*', function ($Request, $Response) use ($Router) {
   // Todas as rotas aninhadas herdam CORS + RateLimit
   yield $Router->route('users', function ($Request, $Response) {
      return $Response->Json->send(['users' => []]);
   }, GET);
}, GET);
```

### Middlewares por rota

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RequestId;

$requestId = new RequestId;
yield $Router->route('/protegido/dashboard', function ($Request, $Response) {
   return $Response(body: 'Dashboard Protegido');
}, GET, middlewares: [$requestId]);
```

Quando middlewares de grupo e de rota estão presentes, eles são **mesclados** — middlewares de grupo executam primeiro, depois os de rota, formando um único pipeline onion ao redor do handler.

Veja [Middlewares](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares) para a documentação completa do pipeline de middlewares.

## Objeto Route

A classe `Route` (`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Route`) expõe as seguintes propriedades:

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `path` | `string` | O padrão do caminho da rota |
| `Params` | `Params` | Container dos parâmetros da rota |
| `base` | `string` | O caminho base da requisição (property hook) |
| `parameterized` | `bool` | Se a rota tem segmentos `:param` (property hook) |
| `nested` | `bool` | Se está dentro de um grupo de rotas |

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
