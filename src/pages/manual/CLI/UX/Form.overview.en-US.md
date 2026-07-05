# Form Component

The `Form` component asks a declarative list of fields, one at a time, reusing [Question](/manual/CLI/UI/Components/Question/overview) and [Menu](/manual/CLI/UI/Components/Menu/overview) as field editors. On interactive terminals it supports going back to the previous field (`↑` + Enter) and ends with a [Fieldset](/manual/CLI/UI/Components/Fieldset/overview) summary plus a confirm Menu — any field can be edited before submitting. On non-interactive input (pipes, CI) it reads exactly one stdin line per field, deterministically.

A live demo is available in the [showcase](/manual/CLI/UX/Form/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameters the instances of the `Input` and `Output` components:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Form;

$Terminal = CLI->Terminal;

$Form = new Form($Terminal->Input, $Terminal->Output);
$Form->title = 'New project';
```

The `title` names the summary frame rendered at the end.

## Declaring fields

Call `add()` once per field — the label is also the key in the answers array. Fields are asked in the declaration order:

```php
use Bootgly\CLI\UX\Form\Controls;

$Form->add('Name', required: true);
$Form->add('Platform', Controls::Select, default: 'Console', options: ['Console', 'Web', 'Both']);
$Form->add('Git', Controls::Confirm, default: 'yes');

$answers = $Form->ask();
// ['Name' => '...', 'Platform' => '...', 'Git' => 'yes'|'no']
```

Each field control maps to its editor: `Text` and `Secret` use Question, `Select` uses a unique-selection Menu and `Confirm` uses `Question->confirm()`.

## Validating fields

Text fields accept the same Validator contract as Question — a Closure receiving the candidate answer and returning `true` or an error message. Invalid answers re-ask the field:

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

## Secret fields

`Controls::Secret` fields mask the typed characters with `•` (or a custom `mask`). The value never appears on screen — not even in the summary, which renders `•••`:

```php
$Form->add('Password', Controls::Secret);
$Form->add('PIN', Controls::Secret, mask: '*');
```

## Going back

While answering, type `↑` then Enter to go back one field. The previous answer becomes the default of the re-asked field, so Enter re-accepts it:

```text
Name: MyApp
Platform: (↑ + Enter)   ← goes back
Name [MyApp]:           ← previous answer as default
```

## Summary and confirm

After the last field, the Form renders the answers in a Fieldset frame and offers a Menu with `Confirm` plus one `Edit <field>` option per field. Choosing a field re-asks only that field and re-renders the summary — the Form only returns after `Confirm`:

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

## Non-interactive input

On pipes and CI there is no revert and no summary loop — each field consumes exactly one stdin line, so scripts stay deterministic. `Select` fields accept the option index, the exact option label or an empty line for the default:

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

The field control — decides which editor asks the field: `Text`/`Secret` → Question, `Select` → Menu (unique selection), `Confirm` → Question (yes/no).

### Form properties

```php
public string $title
```

Config. The summary Fieldset title. Default: `''` (renders as `Summary`).

```php
public int $attempts
```

Config. Per-field attempts forwarded to Question — `0` means unlimited. Default: `0`.

```php
public Fields $Fields
```

Data. The registered `Field` collection (`$Fields->Fields` array, `$Fields->count`).

```php
public private(set) array $answers
```

Metadata (read-only). The answers keyed by field label, filled by `ask()`.

```php
public private(set) bool $confirmed
```

Metadata (read-only). `true` after the summary is confirmed (interactive) or all lines were read (non-interactive).

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

Registers a declarative field and returns it. `options` lists the choices of a `Select` field; `mask` overrides the `Secret` mask (default `•`). The returned `Field` exposes `public private(set) string $answer` and `public private(set) bool $answered`.

### ask()

```php
public function ask (): array
```

Asks all fields sequentially and returns the answers keyed by field label. Interactive terminals support `↑` + Enter to go back one field and end with the summary + confirm loop; non-interactive input reads one stdin line per field with no revert and no summary. Also fills `$answers` and `$confirmed`.
