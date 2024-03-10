# Mouse Reporting

Mouse Reporting or Mouse Tracking is a feature that allows Command Line Interface (CLI) terminals to receive mouse input events, such as `movement`, `click`, and `scrolling`. This can be useful for interacting with text-based applications that support mouse usage, such as text editors, file managers, games, and menus.

To enable Mouse Reporting, a special control sequence must be sent to the terminal, which depends on the type of terminal and the desired tracking mode. There are several tracking modes, such as `X10`, `X11`, `SGR`, and `URXVT`, which differ in how mouse events are encoded and reported. Some terminals also support extended tracking modes, which allow larger coordinates than 223 or 95, depending on the protocol.

To disable Mouse Reporting, another special control sequence must be sent to the terminal, which also depends on the type of terminal and the tracking mode used. It is important to disable Mouse Reporting when the application no longer needs it, to avoid interference with other programs or commands.

Examples of terminals that support Mouse Reporting are `xterm`, `Tabby`, `Konsole`, `gnome-terminal`, `eterm`, and other X Window system-based terminal emulators. In the Linux virtual console, it is necessary to run gpm (8) to enable Mouse Reporting. Some applications that use Mouse Reporting are `midnight-commander`, `tmux`, `vim`, `emacs`, and `htop`.

## Instance

In Bootgly, we have an easy-to-understand Code API that abstracts the ANSI escape codes that are used and sent to the terminal for the activation and deactivation of Mouse Reporting.

First of all, you will need to use the Input and Output classes from the CLI to use as a composition\. To do this, you can use the `Bootgly\CLI` class to get a static instance of the CLI class and then have access to the Input and Output classes. Then, create an instance of the Mouse class as shown below.

```php
use Bootgly\CLI;
use Bootgly\CLI\Terminal\Reporting\Mouse;

$Input = CLI::$Terminal->Input;
$Output = CLI::$Terminal->Output;

$Mouse = new Mouse($Input, $Output);
```

## Settings

The Mouse class has two boolean properties that can be configured to extend its functionality:

### SGT

This is a boolean property that enables or disables the `SGR` extension mode. By default, it is enabled.

```php
$Mouse = new Mouse($Input, $Output);
$Mouse->SGT = false;  // Disables the SGR extension mode
```

### URXVT

This is another boolean property that turns on or off the `URXVT` extension mode. It, too, is enabled by default.

```php
$Mouse = new Mouse($Input, $Output);
$Mouse->URXVT = false;  // Disables the URXVT extension mode
```

## Usage

Now, let's explore the methods that this class provides for use.

### Enabling or disabling Mouse Reporting

```php
report (bool $enabled)
```

This method is used to turn Mouse Reporting on or off and control the receipt of mouse events. It receives a boolean value as an argument. If the value is `true`, mouse event reporting will be enabled. If it's `false`, it will be disabled.

```php
$Mouse = new Mouse($Input, $Output);
$Mouse->report(true); // Enables mouse event reports
```

When activating the Mouse `reporting` mode, the Terminal starts to receive directly in the Terminal data input, the mouse data and with that, it is possible to monitor in real time:

1) Mouse movements and know in which column and line it is over the terminal;
2) Mouse clicks performed, as well as whether the button is being clicked or not;
3) Mouse scrolling and know if it is scrolling up or down;
4) All the above actions together with keys.

### Real-time Mouse Reporting

```php
reporting (\Closure $Callback) : void
```

This method processes the mouse event data generated in real time. It receives a callback function that will be invoked for each reported event. The callback function receives three arguments: the mouse action, the column, line coordinates, and a flag indicating whether the mouse button is being pressed or released (`false`).

#### Callback

```php
function (Bootgly\CLI\Terminal\Input\Mousestrokes $Action, array $coordinate, bool $clicking) : bool;
```

##### Parameters

`Mousestrokes $Action`

Receives the mouse action mapped by the Mousestrokes enum.

`array $coordinate`

Receives the mouse's coordinates defined by column and row in the Terminal.

`bool $clicking`

Receives a boolean indicating whether any mouse button is being pressed or not.

##### Return

The callback function returns a boolean indicating whether the loop for "reporting" should continue or not. This control is ideal in case you need to stop the reporting at some point in your logic.

##### Example

```php
use Bootgly\CLI\Terminal\Input\Mousestrokes;

$Mouse->reporting(function (Mousestrokes $Action, array $coordinate, bool $clicking) {
   [$col, $row] = $coordinate;
   $action = $Action->name;

   echo "Mouse {$action} at [$col, $row], button is " . ($clicking ? "down" : "up") . PHP_EOL;

   if ($Action === Mousestrokes::RIGHT_CLICK) {
      return false;
   }

   return true;
});
```

The example above should output in the terminal something like:

```txt
Mouse NONE_CLICK_WITH_MOVEMENT at [58, 28], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [58, 27], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [57, 27], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [56, 27], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [55, 27], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [55, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [54, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [53, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [52, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [51, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [50, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [49, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [49, 27], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [48, 27], button is up
Mouse LEFT_CLICK at [48, 27], button is down
Mouse LEFT_CLICK at [48, 27], button is up
Mouse LEFT_CLICK at [48, 27], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [48, 27], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [48, 28], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [47, 28], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [47, 29], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [46, 29], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [46, 30], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [46, 31], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [45, 31], button is down
Mouse LEFT_CLICK at [45, 31], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [45, 31], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [44, 31], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [43, 31], button is up
Mouse RIGHT_CLICK at [43, 31], button is down
```
