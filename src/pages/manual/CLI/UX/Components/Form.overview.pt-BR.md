# Componente Form

O componente `Form` pergunta uma lista declarativa de campos, um por vez. Em terminais interativos, cada campo é editado dentro de um **quadro fieldset** — o label como legend na borda superior, o editor dentro: um editor de linha raw para campos `Text`/`Secret` (o quadro repinta por tecla, sempre completo) e uma lista radio para campos `Select`/`Confirm`. Campos respondidos assentam como quadros esmaecidos que ficam na tela. Permite voltar ao campo anterior (`↑` + Enter) e termina com um resumo em [Fieldset](/manual/CLI/UI/Components/Fieldset/overview) mais um Menu de confirmação — qualquer campo pode ser editado antes de submeter. Em entrada não interativa (pipes, CI), lê exatamente uma linha do stdin por campo, deterministicamente — editores planos, sem quadros.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UX/Components/Form/showcase).

## Instância

Para usar o componente, é necessário criar uma instância passando como parâmetros as instâncias dos componentes `Input` e `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Form;

$Terminal = CLI->Terminal;

$Form = new Form($Terminal->Input, $Terminal->Output);
$Form->title = 'New project';
```

O `title` nomeia o quadro de resumo renderizado ao final.

## Declarando campos

Chame `add()` uma vez por campo — o label também é a chave no array de respostas. Os campos são perguntados na ordem de declaração:

```php
use Bootgly\CLI\UX\Components\Form\Controls;

$Form->add('Name', required: true);
$Form->add('Platform', Controls::Select, default: 'Console', options: ['Console', 'Web', 'Both']);
$Form->add('Git', Controls::Confirm, default: 'yes');

$answers = $Form->ask();
// ['Name' => '...', 'Platform' => '...', 'Git' => 'yes'|'no']
```

Cada campo renderiza como um quadro fieldset em terminais interativos — o campo ativo carrega uma legend ciano; campos respondidos assentam esmaecidos, mantendo a resposta gravada visível:

```text
┌ Name ────────────────────────────────┐
│ MyApp                                │
└──────────────────────────────────────┘

┌ Platform ────────────────────────────┐
│ › ● Console                          │
│   ○ Web                              │
│   ○ Both                             │
└──────────────────────────────────────┘
```

Campos `Select` miram com `↑`/`↓` e selecionam com Enter. Campos `Confirm` são um radio Yes/No com hotkeys `y`/`n`. Defaults de texto renderizam como um placeholder esmaecido `[default]` até você digitar.

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

Enquanto responde um campo `Text`/`Secret`, pressione `↑` e depois Enter para voltar um campo. O quadro assentado do campo anterior é apagado e o campo reabre com a resposta anterior como placeholder esmaecido `[MyApp]` — Enter a aceita de novo. Campos `Select` e `Confirm` usam `↑` para mirar, então o revert está disponível apenas em campos `Text`/`Secret`.

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

```bash :toolbar="true";
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

O controle do campo — decide o editor dentro do quadro: `Text`/`Secret` → editor de linha raw (echo mascarado no `Secret`), `Select` → lista radio, `Confirm` → radio Yes/No com hotkeys `y`/`n`. Em entrada não interativa todos os controles leem uma linha do stdin (`Text`/`Secret` via Question, `Confirm` via `Question->confirm()`).

### Propriedades do Form

```php
public string $title
```

Config. O título do Fieldset de resumo. Default: `''` (renderiza como `Summary`).

```php
public int $attempts
```

Config. Tentativas por campo repassadas aos editores de campo — `0` significa ilimitado. Default: `0`.

```php
public null|int $width
```

Config. A largura do quadro de campo, em colunas — `null` segue a largura do terminal (80 em streams sem uma). Default: `null`.

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
