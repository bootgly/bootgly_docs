# Componente Form

O componente `Form` pergunta uma lista declarativa de campos, um por vez, reutilizando [Question](/manual/CLI/UI/Components/Question/overview) e [Menu](/manual/CLI/UI/Components/Menu/overview) como editores de campo. Em terminais interativos, permite voltar ao campo anterior (`↑` + Enter) e termina com um resumo em [Fieldset](/manual/CLI/UI/Components/Fieldset/overview) mais um Menu de confirmação — qualquer campo pode ser editado antes de submeter. Em entrada não interativa (pipes, CI), lê exatamente uma linha do stdin por campo, deterministicamente.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UX/Form/showcase).

## Instância

Para usar o componente, é necessário criar uma instância passando como parâmetros as instâncias dos componentes `Input` e `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Form;

$Terminal = CLI->Terminal;

$Form = new Form($Terminal->Input, $Terminal->Output);
$Form->title = 'New project';
```

O `title` nomeia o quadro de resumo renderizado ao final.

## Declarando campos

Chame `add()` uma vez por campo — o label também é a chave no array de respostas. Os campos são perguntados na ordem de declaração:

```php
use Bootgly\CLI\UX\Form\Controls;

$Form->add('Name', required: true);
$Form->add('Platform', Controls::Select, default: 'Console', options: ['Console', 'Web', 'Both']);
$Form->add('Git', Controls::Confirm, default: 'yes');

$answers = $Form->ask();
// ['Name' => '...', 'Platform' => '...', 'Git' => 'yes'|'no']
```

Cada controle de campo mapeia para seu editor: `Text` e `Secret` usam Question, `Select` usa um Menu de seleção única e `Confirm` usa `Question->confirm()`.

## Validando campos

Campos de texto aceitam o mesmo contrato de Validator do Question — uma Closure que recebe a resposta candidata e retorna `true` ou uma mensagem de erro. Respostas inválidas perguntam o campo novamente:

```php
$Form->add(
   'Name',
   required: true,
   Validator: static function (string $answer): true|string {
      if (preg_match('#^[A-Z][A-Za-z0-9_-]*$#', $answer) !== 1) {
         return 'Invalid name: start with an uppercase letter.';
      }

      return true;
   }
);
```

## Campos Secret

Campos `Controls::Secret` mascaram os caracteres digitados com `•` (ou um `mask` customizado). O valor nunca aparece na tela — nem no resumo, que renderiza `•••`:

```php
$Form->add('Password', Controls::Secret);
$Form->add('PIN', Controls::Secret, mask: '*');
```

## Voltando

Durante as respostas, digite `↑` e Enter para voltar um campo. A resposta anterior vira o default do campo reperguntado, então Enter a aceita de novo:

```text
Name: MyApp
Platform: (↑ + Enter)   ← volta
Name [MyApp]:           ← resposta anterior como default
```

## Resumo e confirmação

Depois do último campo, o Form renderiza as respostas em um quadro Fieldset e oferece um Menu com `Confirm` mais uma opção `Edit <campo>` por campo. Escolher um campo repergunta apenas aquele campo e re-renderiza o resumo — o Form só retorna após `Confirm`:

```text
┌ New project ──────────┐
│ Name: MyApp           │
│ Platform: Console     │
│ Git: yes              │
└───────────────────────┘
(↑/↓ to move, Enter to confirm)
=> [ ] Confirm
   [ ] Edit Name
   [ ] Edit Platform
   [ ] Edit Git
```

## Entrada não interativa

Em pipes e CI não há revert nem loop de resumo — cada campo consome exatamente uma linha do stdin, então scripts permanecem determinísticos. Campos `Select` aceitam o índice da opção, o label exato da opção ou uma linha vazia para o default:

```bash
printf 'MyApp\nsecret\nWeb\ny\n' | php app.php
```

## Reference

### Controls

```php
enum Bootgly\CLI\UX\Form\Controls
{
   case Text;
   case Secret;
   case Select;
   case Confirm;
}
```

O controle do campo — decide qual editor pergunta o campo: `Text`/`Secret` → Question, `Select` → Menu (seleção única), `Confirm` → Question (yes/no).

### Propriedades do Form

```php
public string $title
```

Config. O título do Fieldset de resumo. Default: `''` (renderiza como `Summary`).

```php
public int $attempts
```

Config. Tentativas por campo repassadas ao Question — `0` significa ilimitado. Default: `0`.

```php
public Fields $Fields
```

Data. A coleção de `Field` registrados (array `$Fields->Fields`, contagem `$Fields->count`).

```php
public private(set) array $answers
```

Metadata (somente leitura). As respostas chaveadas pelo label do campo, preenchidas por `ask()`.

```php
public private(set) bool $confirmed
```

Metadata (somente leitura). `true` após o resumo ser confirmado (interativo) ou todas as linhas serem lidas (não interativo).

### add()

```php
public function add (
   string $label,
   Controls $Control = Controls::Text,
   string $default = '',
   bool $required = false,
   null|Closure $Validator = null,
   array $options = [],
   null|string $mask = null
): Field
```

Registra um campo declarativo e o retorna. `options` lista as escolhas de um campo `Select`; `mask` sobrescreve a máscara do `Secret` (default `•`). O `Field` retornado expõe `public private(set) string $answer` e `public private(set) bool $answered`.

### ask()

```php
public function ask (): array
```

Pergunta todos os campos sequencialmente e retorna as respostas chaveadas pelo label do campo. Terminais interativos suportam `↑` + Enter para voltar um campo e terminam com o loop de resumo + confirmação; entrada não interativa lê uma linha do stdin por campo, sem revert e sem resumo. Também preenche `$answers` e `$confirmed`.
