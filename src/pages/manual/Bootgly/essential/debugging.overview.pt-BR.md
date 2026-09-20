# Debugando

A camada de debugging do Bootgly vive em `Bootgly\ABI\Debugging` — a **primeira** camada do framework, então todas as outras camadas e qualquer aplicação alcançam ela sem criar dependência. Não há partes de terceiros: o dumper de valores, o report de throwables, a página de debug de desenvolvimento e o leitor de backtrace são todos código do framework.

A camada inteira é construída sobre um contrato — um único método estático `debug()` — e sobre um dispatcher que decide qual implementação desse contrato deve responder pelo valor que você entregou. Na maior parte do tempo você não toca em nenhum dos dois: você chama o global `dump()`.

## A camada em um relance

| Entidade | Pelo que responde | Documentada em |
|---|---|---|
| `Debugging` | O contrato — `debug()` mais os render targets `TARGET_CLI` / `TARGET_HTML` | esta página |
| `Debugging\Data` | O dispatcher — roteia cada valor para o destino que serve pra ele | esta página |
| `Debugging\Backtrace` | "Quem me chamou?" — a call stack como objetos e como string renderizada | [Backtrace](/manual/Bootgly/essential/debugging/backtrace/overview/) |
| `Debugging\Data\Vars` | Dumps de valores — o engine por trás de `dump()`, `dd()` e do dumper de terminal | [Dumper](/manual/CLI/UI/Atoms/Dumper/overview/) |
| `Debugging\Data\Throwables` (e `Errors`, `Exceptions`) | Reports de throwables, o seam de reporters, a política de saída | [Tratamento de erros](/guide/error-handling/overview/) |
| `Debugging\Page` | A página de debug de desenvolvimento, auto-contida | [Tratamento de erros](/guide/error-handling/overview/) |
| `Debugging\Shutdown` | Erros fatais, que passam por cima de todo handler do PHP | [Tratamento de erros](/guide/error-handling/overview/) |

> [!NOTE]
> `Backtrace` e `Page` são as duas entidades da camada que **não** implementam `Debugging` — elas produzem uma string para outro imprimir, em vez de serem um destino para onde valores são enviados.

## Dump de um valor

`dump()` e `dd()` são funções globais registradas pelo autoboot do ABI. Não há nada para importar nem configurar — elas existem assim que o Bootgly é bootado:

```php :filename="app/Orders.php";
<?php

function place (array $order): void
{
   dump($order);
}

function checkout (array $cart): void
{
   place($cart);
}

function handle (): void
{
   checkout(['sku' => 'BG-1', 'qty' => 2]);
}

handle();
```

```text :toolbar="false";
 in call number: 1
 1 app/Orders.php:5
 2 app/Orders.php:10
 3 app/Orders.php:15
 4 app/Orders.php:18
array:2 [
   'sku' => 'BG-1'
   'qty' => 2
]
```

Todo dump é prefixado pelo **call site** — a linha que chamou `dump()` primeiro, depois os frames acima dela, cada um relativo ao diretório do projeto. Em um terminal os números e as referências de linha são colorizados; os blocos desta página mostram a mesma saída sem as sequências de escape.

`dd()` ("dump and die") imprime a mesma coisa e então termina o processo — nada depois da chamada roda. Use para parar uma request ou um comando exatamente onde está o valor interessante.

A árvore abaixo do trace — `array:2 [ … ]`, literais tipados, sigilos de visibilidade, caps — é produzida pelo dumper; veja a página do [Dumper](/manual/CLI/UI/Atoms/Dumper/overview/) para suas regras de renderização, caps e temas.

## Roteando por tipo

Os globais vão **direto para o dumper**: `dump($Throwable)` renderiza o grafo de objeto do throwable — message, code, o array `trace` raw — como qualquer outro objeto.

`Data::debug()` é o ponto de entrada consciente de tipo. Ele aceita qualquer quantidade de valores, inspeciona cada um independentemente e envia para o destino que sabe renderizá-lo:

| Valor | Destino |
|---|---|
| um `Error` | `Errors::debug()` |
| uma `Exception` | `Exceptions::debug()` |
| qualquer outro `Throwable` | `Throwables::debug()` |
| qualquer outra coisa | `Vars::debug()` |

Uma chamada sem argumentos retorna imediatamente, então `Data::debug(...$optional)` é seguro quando `$optional` pode estar vazio.

Como cada argumento é roteado por conta própria, uma chamada pode misturar tipos — `Data::debug($order, $Throwable)` dumpa o array e reporta o throwable.

## Seu próprio ponto de entrada

`dump()` é uma função de duas linhas, e vale copiá-la quando você quer um ponto de entrada específico do projeto (um dump com tag, um dump que só dispara para uma request, um dump que reporta throwables em vez de dumpá-los).

A parte que importa é o **seam de atribuição**: `Vars::$Backtrace`. Um `Backtrace` reporta de onde a função que o construiu foi chamada, então construir um dentro do seu wrapper faz o dump apontar para a linha que chamou o wrapper — e não para código do framework:

```php :filename="app/Tracing.php";
<?php

use Bootgly\ABI\Debugging\Backtrace;
use Bootgly\ABI\Debugging\Data;
use Bootgly\ABI\Debugging\Data\Vars;

function trace (mixed ...$data): void
{
   Vars::$Backtrace = new Backtrace;

   Data::debug(...$data);
}

function place (array $order): void
{
   trace($order);
}

function checkout (array $cart): void
{
   place($cart);
}

function handle (): void
{
   checkout(['sku' => 'BG-1', 'qty' => 2]);
}

handle();
```

```text :toolbar="false";
 in call number: 1
 1 app/Tracing.php:16
 2 app/Tracing.php:21
 3 app/Tracing.php:26
 4 app/Tracing.php:29
array:2 [
   'sku' => 'BG-1'
   'qty' => 2
]
```

O frame `1` é a linha 16 — `trace($order);` dentro de `place()` — exatamente como se `trace()` fosse `dump()`. Remova a linha que semeia o `Backtrace` e o primeiro frame passa a ser o próprio `Debugging/Data.php`, porque aí o dumper constrói o `Backtrace` dele de dentro do framework.

Esse wrapper também é um upgrade sobre o global: como ele passa por `Data::debug()`, um throwable entregue a `trace()` é *reportado* em vez de dumpado como objeto.

## Seu próprio destino

Implementar `Debugging` é como uma classe entra na camada: um `debug()` estático e variádico, sem retorno. A interface também é a portadora dos render targets, então implementadores herdam `TARGET_CLI` e `TARGET_HTML`:

```php :filename="app/Telemetry.php";
<?php

use Bootgly\ABI\Debugging;

final class Telemetry implements Debugging
{
   public static function debug (mixed ...$data): void
   {
      foreach ($data as $datum) {
         echo '[telemetry] ', get_debug_type($datum), ' ', json_encode($datum), "\n";
      }
   }
}

Telemetry::debug(1200, 'BRL', ['sku' => 'BG-1']);
```

```text :toolbar="false";
[telemetry] int 1200
[telemetry] string "BRL"
[telemetry] array {"sku":"BG-1"}
```

O contrato é deliberadamente mínimo — ele existe para a camada identificar um destino de debugging por `instanceof`, não para impor um modelo de renderização. Sua implementação decide se imprime, retorna, bufferiza ou envia para fora.

> [!TIP]
> Para mandar *throwables* para algum lugar (ingestão tipo Sentry, um event bus, um contador de métricas) não implemente um novo destino — faça push de uma closure em `Throwables::$reporters`, documentado em [Tratamento de erros](/guide/error-handling/overview/).

## Referência

### Debugging

```php
public const int TARGET_CLI = 1;
```

Render target para saída ANSI de terminal. Consumido por `Throwables::render()` — veja [Tratamento de erros](/guide/error-handling/overview/).

```php
public const int TARGET_HTML = 2;
```

Render target para saída HTML escapada. Consumido por `Throwables::render()` — veja [Tratamento de erros](/guide/error-handling/overview/).

```php
public static function debug (mixed ...$data): void
```

O contrato da camada. Todo destino de debugging (`Data`, `Vars`, `Throwables`, `Errors`, `Exceptions`, `Shutdown`) o implementa; implementá-lo é o que torna uma classe um destino de debugging.

### Debugging\Data

```php
public static function debug (mixed ...$x): void
```

O dispatcher. Roteia cada argumento independentemente: `Error` para `Errors`, `Exception` para `Exceptions`, qualquer outro `Throwable` para `Throwables`, todo o resto para `Vars`. Retorna imediatamente quando chamado sem argumentos.

### Debugging\Shutdown

```php
public static bool $debug = true;
```

Config. Chave mestra do hook de shutdown. Com `false`, um erro fatal não é sintetizado em `ErrorException` nem reportado — os throwables bufferizados também não são descarregados. `Shutdown::collect()` está documentado em [Tratamento de erros](/guide/error-handling/overview/).

### Globais

```php
function dump (mixed ...$vars): void
```

Semeia `Vars::$Backtrace` com um `Backtrace` novo (para o trace apontar para o chamador) e entrega cada valor a `Vars::debug()` — o dumper direto, não o dispatcher `Data`, então um throwable é dumpado como objeto em vez de reportado. Registrada pelo autoboot do ABI apenas quando nenhum `dump()` já existe.

```php
function dd (mixed ...$vars): void
```

O mesmo que `dump()`, mais `Vars::$exit = true` e `Vars::$debug = true` — o processo termina depois do dump. Registrada pelo autoboot do ABI apenas quando nenhum `dd()` já existe.
