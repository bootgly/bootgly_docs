# Progress

Aqui nós temos dois exemplo que também estão presentes como arquivo na demo do Bootgly CLI.

## Estado determinado

```php
<?php
namespace Bootgly\CLI;

use Bootgly\CLI;
use Bootgly\CLI\UI\Progress\Progress;

$Output = CLI::$Terminal->Output;
$Output->reset();

$Output->render(<<<OUTPUT
/* @*:
 * @#green: Bootgly CLI Terminal - Progress component @;
 * @#yellow: @@ Demo - Example #1 @;
 * projects/@bootgly/cli/examples/terminal/components/Progress-01.example.php
 */\n\n
OUTPUT);

$Progress = new Progress($Output);
// * Config
// @
$Progress->throttle = 0.0;

// * Data
// @
$Progress->total = 250000;
// ! Templating
$Progress->template = <<<'TEMPLATE'
@description;
@current;/@total; [@bar;] @percent;%
⏱️ @elapsed;s - 🏁 @eta;s - 📈 @rate; loops/s
TEMPLATE;

// ! Bar
// * Config
$Progress->Bar->units = 10;
// * Data
$Progress->Bar->Symbols->incomplete = '🖤';
$Progress->Bar->Symbols->current = '';
$Progress->Bar->Symbols->complete = '❤️';

$Progress->start();

$i = 0;
while ($i++ < 250000) {
   if ($i === 1) {
      $Progress->describe('@#red: Performing progress! @;');
   }
   if ($i === 125000) {
      $Progress->describe('@#yellow: There\'s only half left... @;');
   }
   if ($i === 249999) {
      $Progress->describe('@#green: Finished!!! @;');
   }

   $Progress->advance();

   #usleep(100);
}


$Progress->finish();
```

## Estado indeterminado

```php
<?php
namespace Bootgly\CLI;

use Bootgly\CLI;
use Bootgly\CLI\UI\Progress\Progress;

$Output = CLI::$Terminal->Output;
$Output->reset();

$Output->render(<<<OUTPUT
/* @*:
 * @#green: Bootgly CLI Terminal - Progress component @;
 * @#yellow: @@ Demo - Example #2: Indeterminate state @;
 * projects/@bootgly/cli/examples/terminal/components/Progress-02.example.php
 */\n\n
OUTPUT);

$Progress = new Progress($Output);
// * Config
// @
$Progress->throttle = 0.0;

// * Data
// @
$Progress->total = 0;
// @ Templating
$Progress->template = <<<'TEMPLATE'
@description;
@current;/@total; [@bar;] @percent;%
⏱️ @elapsed;s - 🏁 @eta;s - 📈 @rate; loops/s
TEMPLATE;

// ! Bar
$Bar = $Progress->Bar;
// * Config
$Bar->units = 10;
// * Data
$Bar->Symbols->incomplete = '🖤';
$Bar->Symbols->current = '';
$Bar->Symbols->complete = '❤️';

$Progress->start();

$i = 0;
while ($i++ < 1500) {
   if ($i === 1) {
      $Progress->describe('@#red: Performing progress! @;');
   }

   $Progress->advance();

   usleep(5000);
}


$Progress->finish();
```
