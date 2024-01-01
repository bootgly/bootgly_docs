# Roteador do Servidor HTTP

O Roteador para Servidores HTTP oferece um sistema de roteamento web flexível e poderoso.
O método `route` é utilizado para definir rotas, com o esquema a seguir:

```php
route (string $route, callable $handler, null|string|array $methods = null) : false|object
```

- `$route` é o padrão da URL a corresponder que aceita parâmetros.
- `$handler` é o callback a ser executado quando a rota for correspondida.
- `$methods` é o(s) método(s) HTTP que essa rota deve atender.

Argumentos de `$handler`:

- `$Request` é a Solicitação do Servidor HTTP
- `$Response` é a Resposta do Servidor HTTP
- `$Route` é a Rota do Servidor HTTP correspondida (apenas quando o manipulador não é uma Closure)

## Uso Básico

### Servidor HTTP (com SAPI externa: Apache, NGinx, LiteSpeed, etc.)

```php
use Bootgly\WPI\Nodes\HTTP\Server\Bridge\Request;
use Bootgly\WPI\Nodes\HTTP\Server\Bridge\Response;

// ...

$Router->route('/', function (Request $Request, Response $Response) {
  $Route = $this;
  // $Params = $Route->Params;
  // ...

  return $Response(body: 'Olá Mundo!');
}, GET);
```

### Servidor HTTP CLI

```php
use Bootgly\WPI\Nodes\HTTP\Server\CLI\Request;
use Bootgly\WPI\Nodes\HTTP\Server\CLI\Response;

// ...

yield $Router->route('/', function (Request $Request, Response $Response) {
  $Route = $this;
  // $Params = $Route->Params;
  // ...

  return $Response(body: 'Olá Mundo!');
}, GET);
```

> Você deve usar `yield` (Gerador) se definir mais de uma rota. Isso garante consistência e desempenho nas Respostas HTTP por debaixo dos panos.

## Callbacks de Rota

### Passando Closures como manipulador

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
function falar (Request $Request, Response $Response, Route $Route) {
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
  public static function resposta (Request $Request, Response $Response, Route $Route)
  {
    return $Response(body: 'Olá Mundo!!!');
  }
}
```

```php
yield $Router->route('/ola', 'Mundo::falar', GET);
```

```php
yield $Router->route('/ola', __NAMESPACE__ . '\Mundo::resposta', GET);
```

```php
yield $Router->route('/ola', [Mundo::class, 'resposta'], GET);
```

## Rota com Parâmetros de Rota

```php
yield $Router->route('/usuario/:id', function ($Request, $Response) {
  return $Response(body: 'ID do Usuário: ' . $this->Params->id);
}, GET);
```

```php
$Route->Params->id = '[0-9]+'; // Define o padrão Regex para o parâmetro

yield $Router->route('/parametro6/:id/parametro7/:id', function ($Request, $Response) {
  return $Response(body: <<<HTML
  Parâmetros nomeados iguais com Regex:<br>
  Parâmetro 1: {$this->Params->id[0]}<br>
  Parâmetro 2: {$this->Params->id[1]}
  HTML);
}, GET);
```

## Rota com múltiplos métodos HTTP

```php
yield $Router->route('/dados', function ($Request, $Response) {
  return $Response(body: 'Dados!');
}, [GET, POST]);
```

## Rotas Aninhadas

```php
yield $Router->route('/perfil/:*', function ($Request, $Response)
  use ($Router) {
  // ...

  yield $Router->route('padrao', function ($Request, $Response) {
      return $Response(body: 'Padrão do Usuário!');
  });
  yield $Router->route('usuario/:id', function ($Request, $Response) {
      return $Response(body: 'ID do Usuário: ' . $this->Params->id);
  });
}, GET);
```

## Rota de Captura Total

```php
yield $Router->route('/*', function ($Request, $Response) {
  return $Response(code: 404, body: 'páginas/404');
});
```
