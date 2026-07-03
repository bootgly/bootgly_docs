# Commands

Comandos são a porta de entrada do console Bootgly: `bootgly <comando> [argumentos] [--opções]`. O framework traz seus próprios comandos (`demo`, `test`, `help`, ...) e o seu projeto pode registrar outros — todos passam pelo mesmo roteador, pelo mesmo parser de argumentos e pelo mesmo pipeline de middlewares.

## Criando um comando

Um comando é uma classe que estende `Bootgly\CLI\Command` e define um `$name`, uma `$description` e um método `run()`:

```php
<?php
namespace projects\commands;

use const Bootgly\CLI;
use Bootgly\CLI\Command;


class GreetCommand extends Command
{
   // * Data
   public string $name = 'greet';
   public string $description = 'Greet someone from the terminal';


   public function run (array $arguments = [], array $options = []): bool
   {
      $name = $arguments[0] ?? 'world';
      $greeting = "Hello, $name!";

      if (isSet($options['shout'])) {
         $greeting = strtoupper($greeting);
      }

      CLI->Terminal->Output->write($greeting . PHP_EOL);

      return true;
   }
}
```

O `run()` retorna `true` em caso de sucesso e `false` em caso de falha — um `false` faz o processo `bootgly` sair com status `1`.

## Registrando comandos

O boot do CLI procura um arquivo `projects/Bootgly/commands/@.php` no seu diretório de trabalho. Ele deve retornar um array de instâncias de comandos:

```php
<?php
// projects/Bootgly/commands/@.php

return [
   new \projects\commands\GreetCommand,
];
```

Só isso — o comando já está roteado:

```bash
bootgly greet Rodrigo --shout
# HELLO, RODRIGO!
```

Rodar `bootgly` sem comando (ou com um comando desconhecido) mostra a tela de help listando todos os comandos registrados com suas descrições.

## Argumentos e opções

O roteador separa a linha de comando bruta em três grupos antes de chamar o `run()`:

- **argumentos** — palavras posicionais após o nome do comando: `bootgly greet Rodrigo` → `$arguments = ['Rodrigo']`;
- **opções longas** — `--nome=valor` vira `$options['nome'] = 'valor'`; um `--flag` sem valor vira `$options['flag'] = true`;
- **opções curtas** — `-abc` é separado por letra e contado: `$options = ['a' => 1, 'b' => 1, 'c' => 1]`; repetir uma letra incrementa a contagem (`-vvv` → `['v' => 3]`).

### Verbosidade

A opção curta `v` é reservada: o roteador a consome, limita em `3` e a guarda no comando antes de executar:

```php
public function run (array $arguments = [], array $options = []): bool
{
   if ($this->verbosity >= 2) {
      // ... imprime diagnósticos extras ...
   }

   return true;
}
```

## Middlewares

Toda execução de comando passa por um pipeline de middlewares — um bom lugar para preocupações transversais como medição de tempo, logging ou rodapés de saída. Um middleware implementa `Bootgly\CLI\Commands\Middleware`:

```php
<?php
namespace projects\commands;

use Closure;
use Bootgly\CLI\Command;
use Bootgly\CLI\Commands\Middleware;


class TimerMiddleware implements Middleware
{
   public function process (Command $Command, array $arguments, array $options, Closure $next): bool
   {
      $start = microtime(true);

      $status = $next($Command, $arguments, $options);

      $elapsed = round((microtime(true) - $start) * 1000, 2);
      echo "\n({$elapsed} ms)\n";

      return $status;
   }
}
```

Registre-o no gerenciador de comandos antes do roteamento (por exemplo, no seu bootstrap `@.php`):

```php
use const Bootgly\CLI;

CLI->Commands->Middlewares->pipe(new TimerMiddleware);
```

Os middlewares envolvem o comando como uma cebola: o primeiro middleware do pipe é a camada mais externa, e chamar `$next(...)` passa o controle para a próxima camada (no fim, o `run()` do comando).

## Veja ao vivo

O comando `bootgly demo` — o que alimenta o [showcase do CLI](/manual/CLI/showcase) — é uma subclasse normal de `Command`, exatamente como as dos exemplos acima.

## Reference

O gerenciador de comandos vive em `CLI->Commands` (`Bootgly\CLI\Commands`):

```php
public function register (Command $Command, null|object $Script = null, null|object $Context = null): bool
```

Registra uma instância de comando sob um namespace de script (o framework usa isso para os próprios comandos e para os retornados pelo seu `@.php`). Quando um objeto `$Context` é passado, ele é injetado no comando.

```php
public function route (null|array $route = null, null|object $From = null): bool
```

Faz o parse da linha de comando (ou do array `$route` no estilo `argv`, para roteamento programático), encontra o comando correspondente — caindo no `help` quando o comando é desconhecido —, extrai a verbosidade e executa o comando através do pipeline de middlewares. Retorna o status booleano do comando.

```php
public function find (null|string $command, null|object $From = null, null|string $input = null): Command|null
```

Encontra um comando registrado pelo nome, opcionalmente restrito ao namespace de script `$From`. Retorna `null` quando não há correspondência.

```php
public function list (null|object $From = null): array
```

Lista os comandos registrados por `$From`, ou todos os comandos registrados agrupados por namespace de script quando chamado sem argumentos.

```php
public function autoload (string $location, null|object $Context = null, null|object $Script = null): bool
```

Carrega comandos a partir de um arquivo de mapa `commands/@.php` dentro de `$location` (relativo à raiz do Bootgly), onde cada entrada é um arquivo que retorna uma instância de `Command`. Usado para inicializar conjuntos de comandos de outras localizações sob demanda.

O pipeline de middlewares vive em `CLI->Commands->Middlewares` (`Bootgly\CLI\Commands\Middlewares`):

```php
public function pipe (Middleware ...$middlewares): self
```

Anexa um ou mais middlewares ao fim do pipeline. `prepend()` e `append()` inserem um único middleware no início ou no fim, respectivamente.

```php
public function process (Command $Command, array $arguments, array $options, Closure $handler): bool
```

Executa o comando através dos middlewares registrados, com `$handler` como a camada mais interna. Chamado pelo `route()` — raramente você o chama diretamente.
