# Fieldset Class Documentation

The `Fieldset` class offers an elegant and simple way to create frames with a title and content in the terminal. This component is an excellent choice for presenting information in a structured and clear way.

## Instance

To use the `Fieldset` class, you need to access an instance of the `Output` class, which is part of the `Terminal` class, which in turn can be accessed through the static class `CLI`, as shown below:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Fieldset;

$Output = CLI->Terminal->Output;

$Fieldset = new Fieldset($Output);
```

## Settings

### Properties

The `Fieldset` class allows you to customize various settings to create a personalized frame in the terminal. Here are the available settings:

`width`: Sets the width of the frame.

`color`: Sets the color of the frame and text.

`borders`: Contains the characters used to draw the borders of the frame.

## Usage

### Setting the Title

The `title` property can be set to give your fieldset a title. The title is displayed at the top of the frame. When setting the title, it is automatically handled and escaped to be displayed correctly in the terminal.

Example:

```php
$Fieldset->title = "My Title";
```

### Configuring Borders

```php
public function border(string $position, ? int $length = null)
```

With this method, you can render individual borders of the fieldset. Specify the position (`'top'`, `'left'`, `'right'`, `'bottom'`) and optionally a length.

Example:

```php
$Fieldset->border('top', 20);
```

### Separating Content

```php
public function separate(int $length)
```

Use the `separate` method to insert a horizontal separation line within the content of your fieldset. The `$length` parameter specifies the length of the separation line.

Example:

```php
$Fieldset->separate(20);
```

### Rendering the Fieldset

```php
public function render(int $mode = self::WRITE_OUTPUT)
```

The `render` method is responsible for drawing the frame in the terminal, with all the applied settings. This is the moment when your fieldset really comes to life. When you call it, all the borders, title, and content are presented in the terminal.

Example:

```php
$Fieldset->render();
```

### Complete Example

Here is a complete example of using the `Fieldset` class from start to finish:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Fieldset\Fieldset;

$Output = CLI->Terminal->Output;

$Fieldset = new Fieldset($Output);
$Fieldset->title = "My Fieldset";
$Fieldset->content = "This is the content of my fieldset.\nI can have multiple lines.\n@---;\nAnd even separating lines.";
$Fieldset->width = 50;
$Fieldset->color = '@#Green:';
$Fieldset->render();
```
