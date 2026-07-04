# Componente Question

O componente `Question` pede entradas validadas, baseadas em linha, no terminal. Ele renderiza um prompt (com um valor padrão opcional), lê uma linha e — diferente do [`prompt()` raw do Dialog](/manual/CLI/UI/Components/Dialog/overview) — refaz a pergunta até que a resposta seja válida, a entrada termine (EOF) ou as tentativas se esgotem. Respostas vazias assumem o valor padrão, então ele também funciona com entrada via pipe e permanece determinístico em scripts e CI.

Junto com os componentes [Menu](/manual/CLI/UI/Components/Menu/overview) e [Dialog](/manual/CLI/UI/Components/Dialog/overview), o `Question` impulsiona o wizard interativo do `bootgly project create` — eles fazem parte dos componentes UX Interativos da v0.20.0-beta.

Exemplos em estilo de transcript estão disponíveis no [showcase](/manual/CLI/UI/Components/Question/showcase).

## Instância

Para utilizar o componente, é necessário criar uma instância passando como parâmetros as instâncias dos componentes `Input` e `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Question;

$Terminal = CLI->Terminal;

$Question = new Question($Terminal->Input, $Terminal->Output);
```

## Perguntando com um valor padrão

Defina o `prompt` e o `default` e então chame `ask()`:

```php
$Question->prompt = 'Server port';
$Question->default = '8080';

$port = $Question->ask(); // renderiza `Server port [8080]: `
```

Uma resposta vazia (apenas Enter) ou EOF retorna `'8080'`.

## Validando respostas

Atribua uma Closure a `$Validator` — ela recebe a resposta candidata e retorna `true` para aceitá-la ou uma string de mensagem de erro para rejeitá-la. O erro é renderizado como um [Alert](/manual/CLI/UI/Components/Alert/overview) de tipo Failure e a pergunta é feita novamente:

```php
$Question->prompt = 'Server port';
$Question->default = '8080';
$Question->Validator = static function (string $answer): true|string {
   if (preg_match('#^\d{1,5}$#', $answer) !== 1) {
      return 'Invalid port: use a number between 1 and 65535.';
   }

   return true;
};

$port = $Question->ask();
```

O valor padrão também passa pelo Validator: uma resposta vazia assume o valor padrão antes de a validação rodar.

## Exigindo uma resposta

Quando `required` é `true` e não há valor padrão, respostas vazias renderizam um Alert de Failure `An answer is required.` e a pergunta é feita novamente:

```php
$Question->prompt = 'Project path (e.g. `App` or `App/API`)';
$Question->required = true;

$path = $Question->ask();
```

É exatamente assim que o wizard do `bootgly project create` pede o caminho do projeto.

## Limitando tentativas

A propriedade `attempts` limita quantas vezes a pergunta é feita — `0` (o padrão) significa ilimitado. Quando as tentativas se esgotam, o `ask()` desiste e retorna o valor padrão:

```php
$Question->prompt = 'Access token';
$Question->attempts = 3;
$Question->Validator = static function (string $answer): true|string {
   if (strlen($answer) !== 40) {
      return 'Invalid token: 40 characters expected.';
   }

   return true;
};

$token = $Question->ask(); // retorna '' (o padrão) após 3 respostas inválidas
```

## Referência

### Propriedades

```php
public string $prompt
```

Config. A pergunta renderizada antes do sufixo ` [default]: `. Padrão: `''`.

```php
public string $default
```

Config. A resposta assumida em resposta vazia, EOF ou tentativas esgotadas. Padrão: `''`.

```php
public bool $required
```

Config. Quando `true` e `default` é vazio, respostas vazias refazem a pergunta em vez de serem aceitas. Padrão: `false`.

```php
public int $attempts
```

Config. Número máximo de vezes que a pergunta é feita — `0` significa ilimitado. Padrão: `0`.

```php
public null|Closure $Validator
```

Config. Closure opcional de validação com a assinatura `fn (string $answer): true|string`. Retornar `true` aceita a resposta; retornar uma string a rejeita e renderiza a string como um Alert de Failure. Padrão: `null`.

```php
public private(set) string $answer
```

Metadata (somente leitura). A resposta retornada pela última chamada de `ask()`.

```php
public private(set) int $attempt
```

Metadata (somente leitura). O número de tentativas consumidas pela última chamada de `ask()`.

### ask()

```php
public function ask (): string
```

Renderiza `prompt [default]: ` e lê uma linha. Respostas vazias assumem o valor padrão; quando `required` é `true` e não há valor padrão, respostas vazias refazem a pergunta; quando o `Validator` retorna uma string de erro, o erro é renderizado como um Alert de Failure e a pergunta é feita novamente. EOF ou `attempts` esgotadas retornam o valor padrão. Armazena o resultado em `$answer` e o retorna.
