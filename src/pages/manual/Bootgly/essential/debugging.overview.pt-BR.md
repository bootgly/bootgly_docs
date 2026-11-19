# Debugando

A camada de debugging do Bootgly vive em `Bootgly\ABI\Debugging` — a **primeira** camada do framework, então todas as outras camadas e qualquer aplicação alcançam ela sem criar dependência. Não há partes de terceiros: o dumper de valores, o report de throwables, a página de debug de desenvolvimento e o leitor de backtrace são todos código do framework.

A camada inteira é construída sobre um contrato — um único método estático `debug()` — e sobre um dispatcher que decide qual implementação desse contrato deve responder pelo valor que você entregou. Na maior parte do tempo você não toca em nenhum dos dois: você chama o global `dump()`.

## A camada em um relance

| Entidade | Pelo que responde | Documentada em |
|---|---|---|
| `Debugging` | O contrato — `debug()` mais os render targets `TARGET_CLI` / `TARGET_HTML` | esta página |
| `Debugging\Data` | O dispatcher — roteia cada valor para o destino que serve pra ele | esta página |
| `Debugging\Backtrace` | "Quem me chamou?" — a call stack como objetos e como string renderizada | [Backtrace](#backtrace) |
| `Debugging\Data\Vars` | Dumps de valores — o engine por trás de `dump()`, `dd()` e do dumper de terminal | [Dumper](/manual/CLI/UI/Atoms/Dumper/overview/) |
| `Debugging\Data\Vars\Redactable` | Segredos fora dos dumps — o trait e seu atributo `#[Secret]` | [Redação](#redação) |
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

> [!TIP]
> Um dump imprime o que o objeto guarda — senhas e tokens incluídos. Uma classe que guarda um segredo o mantém fora de todo dump com o trait `Redactable` e uma marca `#[Secret]`; veja [Redação](#redação).

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

## Backtrace

`Bootgly\ABI\Debugging\Backtrace` responde uma pergunta: **quem me chamou?** Construí-lo tira um snapshot da call stack do PHP naquele ponto, descarta o frame que fez a construção e expõe o que sobrou em duas formas — uma lista de objetos `Call` que você percorre e uma listagem `file:line` renderizada e relativa ao projeto que você imprime.

É a peça sobre a qual o resto da camada se apoia: o trace acima de todo `dump()`, o arquivo que um snapshot de teste usa para se nomear, a localização carimbada em um registro de benchmark. Ele não implementa o contrato `Debugging` — produz uma string, não é um destino.

### Quem me chamou

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

### Renderizando a stack

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

Leia de cima para baixo: `audit()` foi chamado na linha 14, dentro de `validate()`, que foi chamado na linha 9, dentro de `charge()`, chamado na linha 34 por `pay()`, chamado na linha 40 por `checkout()`, chamado na linha 43.

Frames que o PHP não consegue atribuir a um arquivo — uma closure invocada pelo engine, um callback rodado por `array_map()` — contribuem com uma linha vazia em vez de uma referência, e o ordinal continua contando eles, então a numeração pula. Quando o frame *mais próximo* é um desses, `dump()` desiste e retorna uma string vazia.

### Percorrendo os frames

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

### Capturando argumentos

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

### Ajustando o render

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

### Coletando as linhas renderizadas

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

## Redação

Um dump é o jeito mais rápido de olhar dentro de um objeto — e o jeito mais rápido de imprimir uma senha, uma chave de API ou um token num terminal, num log ou num relato de bug. `Bootgly\ABI\Debugging\Data\Vars\Redactable` mantém esses valores fora dos dumps de debug: uma classe que guarda um segredo usa o trait e marca a propriedade com `#[Secret]`, e `var_dump()`, `print_r()`, `debug_zval_dump()` e o [Dumper](/manual/CLI/UI/Atoms/Dumper/overview/) (`dump()` / `dd()`) mostram `[redacted]` no lugar dele.

Três ferramentas cobrem os três lugares por onde um segredo passa:

| Um segredo em… | Use | Para que |
|---|---|---|
| uma propriedade | `use Redactable;` + `#[Secret]` | dumps de debug do objeto o mostrem mascarado |
| um parâmetro | o `#[SensitiveParameter]` do PHP | stack traces mostrem um `SensitiveParameterValue` no lugar |
| uma URL num texto | `URI::redact()` | o userinfo (`user:password@`) saia antes de ser exibido |

### Marque uma classe que guarda um segredo

Use o trait na classe e coloque `#[Secret]` em cada propriedade que **guarda** um segredo:

```php :filename="app/Gateway.php";
<?php

use Bootgly\ABI\Debugging\Data\Vars\Redactable;
use Bootgly\ABI\Debugging\Data\Vars\Redactable\Secret;

final class Gateway
{
   use Redactable;

   public string $merchant;
   #[Secret]
   private string $key;
   #[Secret(['password', 'token'])]
   public array $options;
   #[Secret(URI: true)]
   public string $webhook;

   public function __construct (string $merchant, string $key, array $options, string $webhook)
   {
      $this->merchant = $merchant;
      $this->key = $key;
      $this->options = $options;
      $this->webhook = $webhook;
   }
}

$Gateway = new Gateway(
   merchant: 'Shop',
   key: 'SYNTH-KEY',
   options: [
      'region' => 'eu',
      'Password' => 'SYNTH-PASSWORD',
      'retry' => ['token' => 'SYNTH-TOKEN', 'times' => 3]
   ],
   webhook: 'https://shop:SYNTH-PASS@hooks.example.com/paid'
);

print_r($Gateway);
```

Sem o `use Redactable;` os atributos não fazem nada, e o dump carrega todos os segredos:

```text :toolbar="false";
Gateway Object
(
    [merchant] => Shop
    [key:Gateway:private] => SYNTH-KEY
    [options] => Array
        (
            [region] => eu
            [Password] => SYNTH-PASSWORD
            [retry] => Array
                (
                    [token] => SYNTH-TOKEN
                    [times] => 3
                )

        )

    [webhook] => https://shop:SYNTH-PASS@hooks.example.com/paid
)
```

Com ele, a mesma chamada imprime:

```text :toolbar="false";
Gateway Object
(
    [merchant] => Shop
    [key:Gateway:private] => [redacted]
    [options] => Array
        (
            [region] => eu
            [Password] => [redacted]
            [retry] => Array
                (
                    [token] => [redacted]
                    [times] => 3
                )

        )

    [webhook] => https://hooks.example.com/paid
)
```

As três formas do atributo:

- `#[Secret]` mascara o **valor inteiro** — `key` vira `[redacted]`.
- `#[Secret(['password', 'token'])]` mascara só as **entradas sob essas chaves** de um valor array, em qualquer caixa de letra e em qualquer profundidade — `Password` e o `token` aninhado somem, `region` e `times` ficam.
- `#[Secret(URI: true)]` mantém o valor e remove o **userinfo de toda URL** numa string (ou em cada string dentro de um array), via [`URI::redact()`](/manual/ABI/Data/URI/overview/) — o webhook mantém host e path.

Todo o resto aparece como o PHP mostraria: cada propriedade inicializada sob sua visibilidade, na sua ordem. `var_dump()` e `debug_zval_dump()` imprimem os mesmos valores mascarados.

#### Em `dump()` e `dd()`

O Dumper renderiza um objeto `Redactable` como qualquer outro objeto — sigilos de visibilidade, marcas `readonly`, as linhas sem valor das propriedades não inicializadas e virtuais — com os valores mascarados:

```php :filename="app/Mailer.php";
<?php

use Bootgly\ABI\Debugging\Data\Vars\Redactable;
use Bootgly\ABI\Debugging\Data\Vars\Redactable\Secret;

final class Mailer
{
   use Redactable;

   public string $host = 'smtp.example.com';
   #[Secret]
   protected string $password = 'SYNTH-PASSWORD';
   #[Secret]
   public null|string $token = null;
   public int $port;
   public string $sender {
      get => "orders@{$this->host}";
   }
}

dump(new Mailer);
```

```text :toolbar="false";
 in call number: 1
 1 app/Mailer.php:21
Mailer {
   +host: 'smtp.example.com'
   #password: '[redacted]'
   +token: null
   +port: uninitialized
   +sender: virtual
}
```

`token` está marcado mas mostra `null`: `null` e `''` nunca são mascarados, então um dump ainda distingue um segredo *não configurado* de um configurado.

Nada roda até o objeto ser dumpado, e o dump não muda nada: nenhum get hook de propriedade roda (um hook pode criar um diretório ou montar uma chave), os valores são copiados, e uma propriedade que guarda uma referência mantém seu valor vivo.

### Marque os parâmetros que carregam um segredo

Uma propriedade não é o único lugar onde um segredo fica. Enquanto uma chamada está na stack, os argumentos dela também estão, e um stack trace pode mostrá-los — o trace de uma exceção quando `zend.exception_ignore_args` é `0`, a página de debug de desenvolvimento, um `Backtrace` que captura argumentos. O atributo `#[SensitiveParameter]` do próprio PHP troca esse argumento por um objeto `SensitiveParameterValue` em todo trace.

Marque o parâmetro em **todo** frame por onde o segredo passa. O atributo pertence só àquela função: uma função para a qual o valor é repassado, ou um método que sobrescreve outro com um parâmetro marcado, volta a mostrá-lo a menos que também seja marcado. Isso inclui as closures que você entrega ao framework — um resolver de autenticação recebe a senha que o cliente enviou:

```php :filename="app/Login.php";
<?php

namespace Shop;


use SensitiveParameter;

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Basic;


function verify (string $username, #[SensitiveParameter] string $password): bool
{
   // ... busque o usuário e confira o hash da senha
}

$Guard = new Basic(
   function (string $username, #[SensitiveParameter] string $password, Request $Request): bool {
      return verify($username, $password);
   },
   realm: 'Shop'
);
```

Se `verify()` lançar, os dois frames do trace mostram `SensitiveParameterValue` no lugar da senha. Tire o atributo de `verify()` e o frame dela mostra a senha em claro, mesmo que o frame da closure não mostre.

> [!NOTE]
> Importe o atributo (`use SensitiveParameter;`) num arquivo com namespace. Sem o import, `#[SensitiveParameter]` dentro de `namespace Shop;` nomeia `Shop\SensitiveParameter`, uma classe que o PHP não conhece: nenhum erro é lançado, e o argumento aparece em claro.

### Mostre URLs via `URI::redact()`

Uma connection string ou um remote git muitas vezes carrega suas credenciais na URL (`redis://:password@host:6379/0`). Guarde a URL original para conectar; sempre que uma — ou qualquer texto que possa conter uma, como uma mensagem de erro — for exibida, gravada em log ou impressa num relatório, passe-a por `URI::redact()`:

```php
use Bootgly\ABI\Data\URI;

echo URI::redact('redis://:SYNTH-PASSWORD@127.0.0.1:6379/0');
// redis://127.0.0.1:6379/0
```

`#[Secret(URI: true)]` aplica o mesmo método a uma propriedade. As regras que ele segue (toda URL de um texto, o último `@` da autoridade, URLs `file:`) estão no manual de [URI](/manual/ABI/Data/URI/overview/#ocultar-credenciais).

### O que é mascarado, e o que não é

`Redactable` funciona via `__debugInfo()`, o hook que os dumps de debug do PHP chamam. Os canais que o chamam estão cobertos; os que não chamam, não:

| Canal | Valor `#[Secret]` |
|---|---|
| `var_dump()` | mascarado |
| `print_r()` | mascarado |
| `debug_zval_dump()` | mascarado |
| `dump()` / `dd()` / o Dumper | mascarado |
| `var_export()` | **exibido** |
| cast `(array)`, `get_object_vars()` | **exibido** |
| `json_encode()`, `serialize()` | **exibido** |
| `$Object->property` (uma propriedade pública lida diretamente) | **exibido** |

Até a 2.0, as quatro últimas linhas ficam como estão: o atributo protege o que é dumpado para um humano, não o que é convertido, serializado ou lido por código. Não entregue um objeto que guarda um segredo ao `json_encode()` ou ao `var_export()` para exibir — monte o array que você quer mostrar.

As classes do próprio framework que guardam segredos usam o trait, então um dump delas já sai mascarado:

- as configurações de banco de dados, cache, filas, e-mail e storage (senhas, tokens, o `secret` de um disk), e as passphrases TLS de servidores e clientes;
- as configs de ambiente: os valores do `.env` que um loader guarda e todo valor ligado numa árvore de config;
- segredos e chaves JWT, tokens de refresh e de remember, e o material da chave de criptografia;
- os campos de header de credencial de requisições e respostas — no servidor, no cliente HTTP e no cliente WebSocket — com os blocos raw de headers, os cookies, as linhas `Set-Cookie`, o password Basic, o token Bearer e o id de sessão;
- os buffers de rede de uma conexão — servidor e cliente TCP, cliente UDP, os bytes de resposta e a sessão HTTP/2 do cliente HTTP, o decodificador HTTP/2 do servidor e sua tabela HPACK: o que ela leu, o que está escrevendo e o que guarda para a próxima leitura ou escrita.

Os campos de header de credencial são os nomes em `HTTP::SECRET_HEADERS`: `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-csrf-token`, `x-api-key` e `x-auth-token`. Uma credencial sob outro nome de header é sua para mascarar. Corpos de requisição e resposta, dados de sessão e contextos de log guardam dados da aplicação e não são mascarados: mantenha um segredo fora deles, ou fora do dump deles. Os campos de header decodificados de um stream HTTP/2 aberto também não são mascarados.

### Regras práticas

- **Marque a propriedade que guarda o valor.** Uma propriedade virtual (um hook `get` sem armazenamento) não faz parte de um dump; marcá-la não mascara nada, e a propriedade por trás dela é impressa em claro. Coloque `#[Secret]` na propriedade de backing.
- **`null` e `''` continuam visíveis.** De propósito — "sem senha" e "uma senha" precisam ser distinguíveis num dump.
- **Seu próprio `__debugInfo()` substitui a redação.** O método do trait é declarado sem tipo de retorno, então uma subclasse ainda pode declarar o seu (sem tipo, `: array` ou `: null|array`) — mas aí esse corpo é o que todo dump mostra, e as marcas `#[Secret]` deixam de valer. Mascare os segredos nele você mesmo.
- **Enums não podem usá-lo.** O PHP proíbe `__debugInfo()` num enum.
- **O Dumper não mascara nada sozinho.** Ele renderiza o que o `__debugInfo()` do objeto retorna; um objeto sem `Redactable` é dumpado por inteiro.

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

### Redactable

```php
public function __debugInfo ()
```

Retorna as propriedades do objeto como o cast `(array)` do PHP as lista — nomes mangled para as privadas e protegidas, valores copiados — com cada propriedade `#[Secret]` passada por `Secret::redact()`. Propriedades privadas e protegidas são cobertas, e também as propriedades privadas dos ancestrais. Nenhum get hook roda, e propriedades não inicializadas e virtuais ficam de fora, como de qualquer cast `(array)`. Declarado sem tipo de retorno, então uma subclasse ainda pode declarar o seu próprio `__debugInfo()`, que então substitui este.

### Redactable\Secret

```php
public const string MASK = '[redacted]';
```

O que um dump mostra no lugar de um segredo.

```php
public function __construct (array $keys = [], bool $URI = false)
```

O atributo (`#[Attribute(Attribute::TARGET_PROPERTY)]`). Sem argumentos, o valor inteiro é mascarado. `$keys` lista as chaves de array a mascarar dentro do valor — casadas em qualquer caixa de letra, em qualquer profundidade. `$URI: true` remove o userinfo das URLs de um valor string (ou de cada string dentro de um array) em vez de mascará-lo. Os dois ficam expostos como propriedades somente leitura: `keys` (em minúsculas) e `URI`.

```php
public function redact (mixed $value): mixed
```

Redige um valor para um dump e nunca o escreve: arrays são reconstruídos, então uma referência guardada dentro de um mantém seu valor vivo. Retorna `null` e `''` como estão; uma string via `URI::redact()` quando `URI` está ligado; `Secret::MASK` quando nenhuma chave é dada; um array com suas entradas chaveadas mascaradas (uma entrada sob uma chave que guarda `null` ou `''` também fica como está); qualquer outro valor sem mudança — uma string sob um `#[Secret]` chaveado não carrega chaves, então volta inteira.
