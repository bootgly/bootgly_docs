# Form Component

The `Form` component asks a declarative list of fields, one at a time. On interactive terminals every field is edited inside a **fieldset frame** — the label as the legend on the top border, the editor inside: a raw line editor for `Text`/`Secret` fields (the frame repaints per keystroke, always complete) and a radio list for `Select`/`Confirm` fields. Answered fields settle as dim frames that stay on screen. It supports going back to the previous field (`↑` + Enter) and ends with a [Fieldset](/manual/CLI/UI/Base/Fieldset/overview) summary plus a confirm Menu — any field can be edited before submitting. On non-interactive input (pipes, CI) it reads exactly one stdin line per field, deterministically — plain editors, no frames.

A live demo is available in the [showcase](/manual/CLI/UX/Components/Form/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameters the instances of the `Input` and `Output` components:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Form;

$Terminal = CLI->Terminal;

$Form = new Form($Terminal->Input, $Terminal->Output);
$Form->title = 'New project';
```

The `title` names the summary frame rendered at the end.

## Declaring fields

Call `add()` once per field — the label is also the key in the answers array. Fields are asked in the declaration order:

```php
use Bootgly\CLI\UX\Components\Form\Controls;

$Form->add('Name', required: true);
$Form->add('Platform', Controls::Select, default: 'Console', options: ['Console', 'Web', 'Both']);
$Form->add('Git', Controls::Confirm, default: 'yes');

$answers = $Form->ask();
// ['Name' => '...', 'Platform' => '...', 'Git' => 'yes'|'no']
```

Each field renders as a fieldset frame on interactive terminals — the active field carries a cyan legend; answered fields settle dim, keeping the recorded answer visible:

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

`Select` fields aim with `↑`/`↓` and select with Enter. `Confirm` fields are a Yes/No radio with `y`/`n` hotkeys. Text defaults render as a dim `[default]` placeholder until you type.

## Validating fields

Text fields accept a Validator — a Closure receiving the candidate answer and returning `true` or an error message. Validation behaves like an HTML form: the error alert renders **below** the fieldset frame and dismisses as soon as you type again, and the fieldset line turns **green** while the typed value passes the Validator — both live and on the settled frame:

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

While answering a `Text`/`Secret` field, press `↑` then Enter to go back one field. The settled frame of the previous field is erased and the field re-opens with the previous answer as a dim `[MyApp]` placeholder — Enter re-accepts it. `Select` and `Confirm` fields use `↑` to aim, so revert is available on `Text`/`Secret` fields only.

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

The field control — decides the editor inside the frame: `Text`/`Secret` → raw line editor (masked echo on `Secret`), `Select` → radio list, `Confirm` → Yes/No radio with `y`/`n` hotkeys. On non-interactive input all controls read one stdin line (`Text`/`Secret` via Question, `Confirm` via `Question->confirm()`).

### Form properties

```php
public string $title
```

Config. The summary Fieldset title. Default: `''` (renders as `Summary`).

```php
public int $attempts
```

Config. Per-field attempts forwarded to the field editors — `0` means unlimited. Default: `0`.

```php
public null|int $width
```

Config. The field frame width, in columns — `null` follows the terminal width (80 on streams without one). Default: `null`.

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
