# Menu Component

The `Menu` component of the Bootgly library is responsible for rendering and manipulating an interactive menu in the terminal.

## Instance

To use the component, it is necessary to create an instance passing as parameters the instances of the `Input` and `Output` components.

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Menu\Menu;

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

### Open

The `open()` method of the component is responsible for rendering the menu and processing the inputs provided by the user. This method returns an array with the indices of the selected options.

Example:

```php
$selected = $Menu->open();
```

The above example executes the `open()` function of the component and stores the selected options in a variable called `$selected`.
