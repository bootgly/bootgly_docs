
# Alert Class

The Alert class is responsible for displaying colored alerts in the Terminal.

## Instance

To use the Alert class, it is necessary to instantiate an object of the same class passing as parameter a reference to the Output object of the Terminal class:

```php
use Bootgly\CLI;
use Bootgly\CLI\Terminal\components\Alert\Alert;

$Output = CLI::$Terminal->Output;

$Alert = new Alert($Output);
```

## Settings

The Alert class can be configured with the following options:

### Type

The type of alert to be displayed. Can be of type "DEFAULT", "SUCCESS", "ATTENTION" or "FAILURE".

Example:

```php
// Setting the alert type to SUCCESS
$Alert->Type::SUCCESS->set();
```

### width

The width in characters of the alert to be displayed.

Example:

```php
// Setting the alert width to 100 characters
$Alert->width = 100;
```

## Usage

### emit

The `emit` method is used to display an alert on the screen. It takes as parameter the message that should be displayed in the alert.

Method header:

```php
emit (string $message) : void
```

Example:

```php
use Bootgly\CLI;
use Bootgly\CLI\Terminal\components\Alert\Alert;

$Output = CLI::$Terminal->Output;

$Alert = new Alert($Output);

$Alert->Type::SUCCESS->set(); // set the alert type to success
$Alert->width = 60; // set the alert width to 60 characters

$message = 'This is a success alert!';

$Alert->emit(message: $message); // call the method to display the alert
```
