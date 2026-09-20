# Backtrace

`Bootgly\ABI\Debugging\Backtrace` responde uma pergunta: **quem me chamou?** Construí-lo tira um snapshot da call stack do PHP naquele ponto, descarta o frame que fez a construção e expõe o que sobrou em duas formas — uma lista de objetos `Call` que você percorre e uma listagem `file:line` renderizada e relativa ao projeto que você imprime.

É a peça sobre a qual o resto da camada se apoia: o trace acima de todo `dump()`, o arquivo que um snapshot de teste usa para se nomear, a localização carimbada em um registro de benchmark. Ele não implementa o contrato `Debugging` — produz uma string, não é um destino.

## Quem me chamou

Construa um `Backtrace` dentro de uma função e seus `file`, `line` e `dir` descrevem **a linha que chamou essa função** — não a linha que construiu o objeto. É isso que o torna útil para wrappers, helpers e instrumentação:

```php :filename="app/Audit.php";
<?php

use Bootgly\ABI\Code\__String\Path;
use Bootgly\ABI\Debugging\Backtrace;

function audit (): void
{
   $Backtrace = new Backtrace;

   $file = Path::relativize($Backtrace->file, BOOTGLY_WORKING_DIR);

   echo "audit() was called from $file:{$Backtrace->line}\n";
}

function charge (int $cents): void
{
   audit();
}

charge(1200);
```

```text :toolbar="false";
audit() was called from app/Audit.php:17
```

A linha 17 é `audit();` dentro de `charge()`. Os três acessores são hooks somente-leitura sobre o mesmo frame: `file` é o caminho absoluto, `line` o número da linha, `dir` o `dirname()` desse caminho. Eles são absolutos — relativize você mesmo quando for imprimir para um humano, como o framework faz com `Path::relativize()` contra `BOOTGLY_WORKING_DIR`.

> [!NOTE]
> Quando a stack é curta demais para sobrar um frame — `new Backtrace(1)`, ou uma chamada no topo do arquivo de entrada — os acessores respondem com seus valores vazios (`''`, `0`) em vez de falhar.

## Renderizando a stack

`dump()` retorna a stack já formatada: um `file:line` por linha, caminhos relativos ao diretório do projeto, numerados e colorizados em um terminal:

```php :filename="app/Billing.php";
<?php

use Bootgly\ABI\Debugging\Backtrace;

final class Ledger
{
   public function charge (int $cents): void
   {
      $this->validate($cents);
   }

   private function validate (int $cents): void
   {
      $this->audit();
   }

   private function audit (): void
   {
      echo new Backtrace()->dump();
   }
}

final class Checkout
{
   public Ledger $Ledger;

   public function __construct (Ledger $Ledger)
   {
      $this->Ledger = $Ledger;
   }

   public function pay (int $cents): void
   {
      $this->Ledger->charge($cents);
   }
}

function checkout (int $cents): void
{
   new Checkout(new Ledger)->pay($cents);
}

checkout(1200);
```

```text :toolbar="false";
 1 app/Billing.php:14
 2 app/Billing.php:9
 3 app/Billing.php:34
 4 app/Billing.php:40
 5 app/Billing.php:43
```

Leia de cima para baixo: `audit()` foi chamado na linha 14, dentro de `validate()`, que foi chamado na linha 9, dentro de `charge()`, chamado na linha 34 por `pay()`, chamado na linha 40 por `checkout()`, chamado na linha 43. Os blocos desta página mostram a saída sem as sequências de escape ANSI que um terminal consome.

Frames que o PHP não consegue atribuir a um arquivo — uma closure invocada pelo engine, um callback rodado por `array_map()` — contribuem com uma linha vazia em vez de uma referência, e o ordinal continua contando eles, então a numeração pula. Quando o frame *mais próximo* é um desses, `dump()` desiste e retorna uma string vazia.

## Percorrendo os frames

`calls` é a mesma stack como dado — um array de objetos `Backtrace\Call`, ordenados do chamador mais próximo para fora. Passe um `limit` ao construtor quando você só precisa do topo da stack; é o limite do próprio `debug_backtrace()` do PHP, então ele conta também o frame descartado — `new Backtrace(3)` deixa dois para você:

```php :filename="app/Frames.php";
<?php

use Bootgly\ABI\Code\__String\Path;
use Bootgly\ABI\Debugging\Backtrace;

final class Ledger
{
   public function charge (int $cents): void
   {
      $Backtrace = new Backtrace(3);

      foreach ($Backtrace->calls as $Call) {
         $file = Path::relativize($Call->file ?? '', BOOTGLY_WORKING_DIR);

         echo $Call->class, $Call->type, $Call->function, "() at $file:{$Call->line}\n";
      }
   }
}

function checkout (int $cents): void
{
   new Ledger()->charge($cents);
}

checkout(1200);
```

```text :toolbar="false";
Ledger->charge() at app/Frames.php:22
checkout() at app/Frames.php:25
```

Um `Call` é uma visão fina e tipada de um frame do `debug_backtrace()`: `function` sempre guarda o nome da função ou método chamado, `class` e `type` (`->` ou `::`) são `null` para funções simples, e `file` e `line` são `null` para frames que o PHP não consegue atribuir a um arquivo-fonte.

> [!WARNING]
> Um `limit` negativo deixa o objeto inutilizável — o construtor retorna antes de atribuir `calls`, então lê-lo levanta *"Typed property `Backtrace::$calls` must not be accessed before initialization"*. Use `0` (o padrão) para uma stack ilimitada.

## Capturando argumentos

Os frames chegam sem argumentos: `Backtrace::$options` tem como padrão `DEBUG_BACKTRACE_IGNORE_ARGS`, o que mantém o snapshot barato e mantém segredos fora dele. Limpe essa flag — antes de construir — e `Call::$args` passa a vir preenchido com os argumentos com que cada frame foi chamado:

```php :filename="app/Args.php";
<?php

use Bootgly\ABI\Debugging\Backtrace;

Backtrace::$options = DEBUG_BACKTRACE_PROVIDE_OBJECT;

function charge (int $cents, string $currency): void
{
   $Backtrace = new Backtrace(2);

   foreach ($Backtrace->calls as $Call) {
      $args = implode(', ', array_map(json_encode(...), $Call->args ?? []));

      echo "{$Call->function}($args)\n";
   }
}

charge(1200, 'BRL');
```

```text :toolbar="false";
charge(1200, "BRL")
```

Com as opções padrão, `args` é `null` para todo frame, então proteja o acesso (`$Call->args ?? []`) em código que precisa funcionar nas duas configurações.

> [!CAUTION]
> Argumentos capturados contêm o que quer que sua aplicação passe adiante — senhas, tokens, payloads. Ligue a flag para uma investigação pontual, não como padrão, e nunca renderize esses frames para um cliente.

## Ajustando o render

Dois statics moldam o que `dump()` escreve. `$traces` é o orçamento de frames: o render para **depois** que o orçamento é ultrapassado, então ele emite `$traces + 1` linhas (o padrão `4` dá cinco). `$counter` liga e desliga o ordinal à esquerda:

```php :filename="app/Tuning.php";
<?php

use Bootgly\ABI\Debugging\Backtrace;

Backtrace::$traces = 2;
Backtrace::$counter = false;

function audit (): void
{
   echo new Backtrace()->dump();
}

function charge (int $cents): void
{
   audit();
}

function checkout (): void
{
   charge(1200);
}

checkout();
```

```text :toolbar="false";
app/Tuning.php:15
app/Tuning.php:20
app/Tuning.php:23
```

Os dois são estáticos — são configurações de processo, não de instância. O framework conta com isso: o `bootgly test` desliga `$counter` em volta da saída de assertion e o restaura depois.

> [!IMPORTANT]
> O dumper também escreve em `$traces`. Todo `dump()` / `dd()` atribui `Backtrace::$traces = Vars::$traces - 1` (ou seja, `3` por padrão), permanentemente. Se você ajusta `$traces` para as suas próprias chamadas, configure `Vars::$traces` em vez disso, ou reatribua `Backtrace::$traces` depois do dump que sobrescreveu o valor.

## Coletando as linhas renderizadas

`dump()` também guarda cada linha que renderizou em `backtraces`, para que um chamador que precisa dos frames como dado — um registro de log, um report de teste, um payload estruturado — não tenha que parsear o blob retornado:

```php :filename="app/Lines.php";
<?php

use Bootgly\ABI\Debugging\Backtrace;

function audit (): void
{
   $Backtrace = new Backtrace(3);

   $Backtrace->dump();

   var_dump($Backtrace->backtraces);
}

function charge (int $cents): void
{
   audit();
}

charge(1200);
```

```text :toolbar="false";
array(2) {
  [0]=>
  string(41) " 1 app/Lines.php:16"
  [1]=>
  string(41) " 2 app/Lines.php:19"
}
```

Cada entrada é a linha renderizada, sequências de escape incluídas — 41 bytes para 19 caracteres visíveis aqui. A propriedade é publicamente legível mas privadamente escrita (`private(set)`), e ela **acumula**: chamar `dump()` duas vezes na mesma instância anexa uma segunda cópia de cada linha. Fica vazia até o primeiro `dump()`.

## Referência

### Backtrace

```php
public static int $options = DEBUG_BACKTRACE_IGNORE_ARGS;
```

Config. As flags entregues ao `debug_backtrace()` do PHP quando uma instância é construída. Limpe `DEBUG_BACKTRACE_IGNORE_ARGS` para popular `Call::$args`. Lido no momento da construção, então atribua antes do `new Backtrace`.

```php
public static int $traces = 4;
```

Config. Orçamento de frames do `dump()`. A checagem acontece depois de um frame ser escrito, então o render emite até `$traces + 1` linhas. Sobrescrito por `Vars::debug()` com `Vars::$traces - 1` a cada `dump()` / `dd()`.

```php
public static bool $counter = true;
```

Config. Se `dump()` prefixa cada linha com seu ordinal.

```php
public array $calls;
```

Data. A stack capturada como `array<int,Backtrace\Call>`, chamador mais próximo primeiro, com o frame que construiu o `Backtrace` já removido. Fica não inicializada quando o construtor recebe um `limit` negativo.

```php
public string $dir { get; }
```

Metadata. `dirname()` do arquivo do chamador mais próximo; `''` quando não existe esse frame.

```php
public string $file { get; }
```

Metadata. Caminho absoluto do arquivo do chamador mais próximo; `''` quando não existe esse frame.

```php
public int $line { get; }
```

Metadata. Número da linha dentro desse arquivo; `0` quando não existe esse frame.

```php
public private(set) array $backtraces;
```

Metadata. As strings `file:line` produzidas por `dump()`, sequências de escape incluídas. Vazia até o primeiro `dump()`, e anexada por cada um seguinte.

```php
public function __construct (int $limit = 0)
```

Captura a stack. `$limit` é o limite do `debug_backtrace()` do PHP e conta o frame que é descartado em seguida, então `new Backtrace(3)` produz dois objetos `Call`; `0` significa ilimitado. Um `$limit` negativo retorna cedo e deixa a instância inutilizável.

```php
public function dump (): string
```

Renderiza a stack capturada como linhas `file:line` — caminhos relativizados contra `BOOTGLY_WORKING_DIR`, colorizados com ANSI sob a SAPI `cli`, envolvidos em `<small>` caso contrário — e registra cada linha em `backtraces`. Retorna `''` quando o frame mais próximo não tem arquivo ou linha.

### Backtrace\Call

```php
public null|string $file;
```

Data. Caminho absoluto do arquivo de onde a chamada foi feita; `null` quando o PHP não consegue atribuir o frame a um arquivo.

```php
public null|int $line;
```

Data. Número da linha da chamada; `null` nas mesmas condições de `file`.

```php
public string $function;
```

Data. Nome da função ou método chamado. Sempre presente.

```php
public null|string $class;
```

Data. Classe declarante do método chamado; `null` para funções simples.

```php
public null|string $type;
```

Data. `->` para uma chamada de instância, `::` para uma estática; `null` para funções simples.

```php
public null|array $args;
```

Data. Argumentos que a chamada recebeu, ou `null` enquanto `Backtrace::$options` mantiver `DEBUG_BACKTRACE_IGNORE_ARGS` (o padrão).

```php
public function __construct (array $call)
```

Envolve um frame cru do `debug_backtrace()`. Construído pelo `Backtrace` — você lê objetos `Call`, você não os cria.
