# Menu Component

The `Menu` component of the Bootgly library is responsible for rendering and manipulating an interactive menu in the terminal.

## Instance

To use the component, it is necessary to create an instance passing as parameters the instances of the `Input` and `Output` components.

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Menu;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Menu = new Menu($Input, $Output);
```

## Settings

The menu settings can be defined directly on the component instance after its creation. The main settings are the menu width (`$width`) and the prompt displayed before presenting the options (`$prompt`).

### Width

```php
// Set the menu width to 80 columns
Menu::$width = 80;
```

### Prompt

The `$prompt` property of the component defines the message that should appear before the list of menu options when it is opened with the `open()` function. The message can be customized by the user according to the context in which the menu is being used.

Example:

```php
$Menu->prompt = "Choose an option:"; // Set the message "Choose an option:" as the menu prompt
```

## Usage

The use of the `Menu` component is done through the manipulation of its properties and methods. Among the main properties of the component are `->Items`, `->Items->Options`, among others.

### Items

The `$Items` property stores the configuration of the menu options. The user can add options, dividers, headers, etc.

There are two ways to define the item options: the first is by accessing the `Options` property of the `Items` object and using the `add()` method, and the second is by instantiating each item separately and adding its instance by passing it as an argument through the `push()` method of the `Items` object.

#### Adding items

```php
// > Items
$Items = $Menu->Items;

// > Items > Options
$Options = $Items->Options;

// * Config
// @ Selecting
$Options->Selection::Multiple->set();
$Options->selectable = true; // define if the option is selectable
$Options->deselectable = true; // define if the user can remove the selection after selecting

// @ Styling
$Options->divisors = '-'; // define dividers in all options
// @ Displaying
$Options->Orientation::Vertical->set();
$Options->Aligment::Left->set();

// * Items set - Option #1 */
$Items->Options->add(label: 'Option 1');
```

The above example adds a simple option to the menu with the label "Option 1". The selection settings (`Selection`) define whether one or several options can be selected (`Single` or `Multiple` respectively) and the style properties (`Styling`) control the visual appearance of the menu.

It is possible to use dividers (`Divisor`) and headers (`Header`) to better organize the menu options.

#### Composing items

```php
// * Items set - Option #1 */
$Items->extend(
  new Divisors($Menu) // Extends items with a new type of Items
);
$Items->push(
  (new Divisor(characters: '')),
  new Option(label: 'Option 1'),
  new Divisor(characters: '#'),
  new Option(label: 'Option 2'),
  new Divisor(characters: '.'),
  new Option(label: 'Option 3'),
  new Divisor(characters: '='),
);
```

### Rendering

The `rendering()` Generator renders the menu and processes the user keys until Enter. Drive it with a `foreach`; the selected option indexes land in `$Menu->selected`:

```php
foreach ($Menu->rendering() as $frame);

$selected = $Menu->selected;
```

On non-interactive input (pipes, CI) the menu renders once and returns the pre-selected options — deterministic in scripts.

### Aiming a default

`aim()` sets the initial aim (the `=>` marker) — pair it with Enter-confirm to make an option the default:

```php
$Options->add(label: 'Console');
$Options->add(label: 'Web');

$Options->aim(1); // the aim starts at `Web`
```

Locked options never hold the aim.

### Confirming with Enter

Enter with an empty selection confirms the aimed option — no Space needed. With an explicit selection (Space), Enter keeps it and ignores the aim.

### Viewport (long lists)

Set `viewport` to window long vertical lists to N visible options. The window slides with the aim and dim `↑/↓ N more` indicators count the hidden options:

```php
$Options->viewport = 5; // 5 visible options at a time
```

### Type-ahead filter

Typing letters filters the options incrementally: the aim jumps to the first match and non-matching options are hidden while the filter is active. A dim `/filter` hint renders under the prompt. Backspace pops the last character; bare `Esc` clears the filter. Space always selects — it never enters the filter.

### Grid columns

Set `columns` to lay a vertical menu out as a grid — N options per visual line, each cell padded to `Menu::$width / columns`. `←`/`→` move one cell; `↑`/`↓` move one visual line:

```php
Menu::$width = 60;
$Options->columns = 3;
```

## See it live

The official Menu demo runs in the [live showcase](/manual/CLI/UI/Components/Menu/showcase) — real framework code on PHP 8.4 WebAssembly, in your browser, straight from this page.
