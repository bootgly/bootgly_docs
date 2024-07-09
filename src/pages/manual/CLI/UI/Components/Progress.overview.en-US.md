# Progress

The `Progress` class is used to show the progress of an operation in real time in the terminal.

## Instance

To use the class, first you need to create an instance of it:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Progress;

$Output = CLI->Terminal->Output;

$Progress = new Progress($Output);
```

When creating a new instance, if no parameters are passed, the default values will be used.

## Settings

### Limiting the update rate

```php
float $throttle
```

Update interval (in seconds). Default: `0.1`.

This parameter determines how often the progress bar is updated (rendered), that is, how often the progress of the task in progress is displayed. If the `throttle` is set to a low value, the progress bar will be updated more frequently, which can increase the accuracy of the time estimate and give a smoother feeling of progress.

On the other hand, if the `throttle` is set to a high value, the progress bar will be updated less frequently, which can reduce the processing overhead and make the code execution more efficient.

Usually, the value of the `throttle` is adjusted according to the characteristics of the task in question and the execution environment, in order to find a balance between accuracy, efficiency and smoothness of the update.

Example:

```php
$Progress->throttle = 0.2;
```

### Precision of the displayed numbers

```php
object $Precision
```

You can set the number of decimal places of the precision of the displayed numbers by setting the `Precision` Object property that contains the following properties:

`percent: int`: Number of decimal places for the percentage. Default: `2`.

`seconds: int`: Number of decimal places for elapsed and estimated times. Default: `1`.

`rate: int`: Number of decimal places for the data rate. Default: `0`.

Examples:

```php
$Progress->Precision->percent = 2;
$Progress->Precision->seconds = 1;
$Progress->Precision->rate = 0;
```

## Templating

It is possible to compose a Template of each part of the Progress component that will be displayed in the Terminal output.

This composition is made by defining the position where each part will be placed using the template tokens as shown in the example below:

```php
$Progress->template = <<<'TEMPLATE'
@described;
@current;/@total; [@bar;] @percent;%
⏱️ @elapsed;s - 🏁 @eta;s - 📈 @rate; loops/s
TEMPLATE;
```

Each token must start with the character `@` and end with the character `;`.

### Template tokens

Below is what each token represents:

`@described;`: last description called by the `describe()` method.

`@current;`: current amount of the ongoing operation.

`@total;`: total amount of the ongoing operation.

`@percent;`: current percentage achieved of the ongoing operation.

`@elapesed;`: elapsed time of the ongoing operation.

`@eta;`: is an acronym for "estimated time of arrival" which is the estimated time to complete the operation.

`@rate;`: data rate of the operation per second.

`@bar;`: Progress component's Bar subcomponent.

## Usage

### Starting a new progress

The `start()` method must be called to start a new progress:

```php
$Progress->start();
```

### Updating the progress

```php
advance (int $amount = 1)
```

The `advance()` method must be called whenever there is a change in the progress of the operation.
Its use is common within a `while`, `for` loop, etc.

Example:

```php
$Progress->advance(2);
```

### Describing the progress

```php
describe (string $description)
```

The `describe()` method can be called at any time to update the progress description.

Example:

```php
$Progress->describe('Processing file 3...');
```

### Finishing the progress

```php
finish ()
```

The `finish()` method must be called to finish the progress of the operation:

```php
$Progress->finish();
```

When calling this method, the cursor, which is hidden during the rendering of the progress, is shown again.
