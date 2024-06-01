
# Alert Class

The Alert class is responsible for displaying colored alerts in the Terminal.

## Instance

To use the Alert class, it is necessary to instantiate an object of the same class passing as parameter a reference to the Output object of the Terminal class:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Alert\Alert;

$Output = CLI->Terminal->Output;

$Alert = new Alert($Output);
```

## Settings

The Alert class can be configured with the following options:

### Style

The style of alert to be displayed. Can be "Default" or "Fullcolor".

Example:

```php
// Setting the alert style to Fullcolor
$Alert->Style::Fullcolor->set();
```

### Type

The type of alert to be displayed. Can be "Default", "Success", "Attention" or "Failure".

Example:

```php
// Setting the alert type to Success
$Alert->Type::Success->set();
```

### width

The width in characters of the alert to be displayed.

Example:

```php
// Setting the alert width to 100 characters
$Alert->width = 100;
```

## Usage

### Setting the alert message

The `message` property is used to set the message that should be displayed in the alert.

Example:

```php
$Alert->message = 'This is a success alert!';
```
