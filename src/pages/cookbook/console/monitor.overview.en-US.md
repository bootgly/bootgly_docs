# Monitor

Build **Monitor**, a live system dashboard for your terminal: CPU and memory gauges with a CPU history sparkline, the top processes by memory and the usage of every mounted disk — three screens switched with one key, plus a status bar, a help overlay and a command palette that the Console platform gives you for free.

You will write 8 short files (about 20 minutes) and learn how a `Console\App` boots, how screens are plain files that return a string, how keymaps and the status bar work, how core widgets render inside a screen and how a project is tested with `bootgly test`.

```text
CPU                                                       12.5%
■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■

Memory                                     11.0 GB / 15.5 GB
■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■

 Load average  1.11  0.75  0.47
 CPU history   ▁▆▅█▅▃▂▂▄

 Press r to refresh — the status bar lists the screens, ? lists every key.

 Monitor  ▏ omni          1 Overview · 2 Processes · 3 Disks  ? help · q quit
```

<d-block-stepper>
  <d-block-step title="Install Bootgly">

One command installs everything on Linux (or WSL2): it checks for **git** and **PHP 8.4+**, offers to install what is missing through your package manager and clones the Bootgly Kit into `./bootgly.kit`. `--no-wizard` skips the interactive project wizard — the next step creates the project with an explicit command instead.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash -s -- --no-wizard
cd bootgly.kit
```

> [!TIP]
> The installer also asks whether to install the `bootgly` command globally — either answer is fine, every page here uses `php bootgly …`. Already have a kit? The installer resumes the one it finds at `./bootgly.kit` and offers to move it to the current release — accept it, these pages assume 1.0.2 or newer — then `cd` into it and go to the next step. Every command below runs from the kit directory as `php bootgly …` — if you installed the CLI globally (`php bootgly setup`), `bootgly …` works too. The [Getting started](/guide/getting-started/overview/) guide explains the installer and the kit layout.

  </d-block-step>

  <d-block-step title="Create the project">

Create a **CLI** project named `Monitor` on the **Console** platform. On the first run this also sets the platform up (its git submodule and the shipped examples), so it takes a moment:

```bash :toolbar="true";
php bootgly projects create Monitor --platform=console --interfaces=CLI --yes
```

The project lands in `projects/Monitor/` — a git repository of its own (the scaffold becomes its first commit once git knows your name and e-mail):

```text
projects/Monitor/
├── .gitignore
├── Monitor.Project.php     ← the project signature: metadata + the boot function
├── schedule.php            ← cron-like jobs (unused here)
└── tests/
    ├── autoboot.php        ← the project's test registry
    └── example/            ← an example suite (de-registered in the last step; delete it when you like)
```

Everything you write next goes inside `projects/Monitor/`.

  </d-block-step>

  <d-block-step title="Write the System probes">

The dashboard reads Linux's `/proc` files: `/proc/stat` for CPU time, `/proc/meminfo` and `/proc/loadavg` for memory and load, `/proc/[pid]/stat` for processes and `/proc/mounts` for disks. A plain class keeps that out of the screens.

Screens are rendered many times per second, so every probe re-reads at most once per second (`elapse()`) and hands back the last reading in between:

**File** `projects/Monitor/System.php`

```php :filename="projects/Monitor/System.php";
<?php

namespace Monitor;


use const FILE_IGNORE_NEW_LINES;
use function array_slice;
use function array_sum;
use function array_values;
use function basename;
use function count;
use function dirname;
use function disk_free_space;
use function disk_total_space;
use function explode;
use function file;
use function file_get_contents;
use function glob;
use function hrtime;
use function in_array;
use function is_dir;
use function max;
use function preg_match;
use function preg_split;
use function round;
use function sprintf;
use function str_replace;
use function str_starts_with;
use function strpos;
use function strrpos;
use function substr;
use function trim;
use function usort;


/**
 * System probes over /proc — CPU, memory, load, processes and disks.
 * Every probe re-reads at most once per `$interval` seconds, so screens
 * can call them on every frame.
 */
class System
{
   // * Config
   /** Seconds between two readings of the same probe */
   public float $interval = 1.0;
   /** CPU history length (samples) */
   public int $depth = 40;

   // * Data
   /** CPU usage since the previous sample (%) */
   public float $CPU = 0.0;
   /** @var array<int,float> Recent CPU samples (%) */
   public array $history = [];
   /** @var array<int,float> Load average (1, 5, 15 min) */
   public array $load = [0.0, 0.0, 0.0];
   /** @var array{total:int,used:int,available:int} Memory in KB */
   public array $memory = ['total' => 0, 'used' => 0, 'available' => 0];

   // * Metadata
   /** @var array<string,float> Last reading time per probe (seconds) */
   private array $readings = [];
   private int $busy = 0;
   private int $total = 0;
   /** @var array<int,array{pid:int,name:string,state:string,rss:int,cpu:float}> */
   private array $processes = [];
   /** @var array<int,array{mount:string,type:string,total:float,used:float,percent:float}> */
   private array $disks = [];


   /**
    * Sample CPU, load average and memory.
    */
   public function sample (): void
   {
      // ?
      if ($this->elapse('sample') === false) {
         return;
      }

      // @ CPU — /proc/stat first line: cpu user nice system idle iowait irq softirq steal
      $line = file('/proc/stat', FILE_IGNORE_NEW_LINES)[0] ?? 'cpu';
      $fields = preg_split('/\s+/', trim($line)) ?: [];
      $values = [];
      foreach (array_slice($fields, 1) as $field) {
         $values[] = (int) $field;
      }
      $total = array_sum($values);
      $busy = $total - ($values[3] ?? 0) - ($values[4] ?? 0);
      if ($this->total > 0 && $total > $this->total) {
         $this->CPU = round(($busy - $this->busy) / ($total - $this->total) * 100, 1);
      }
      $this->total = $total;
      $this->busy = $busy;
      $this->history[] = $this->CPU;
      $this->history = array_slice($this->history, -$this->depth);

      // @ Load average
      $load = explode(' ', trim((string) file_get_contents('/proc/loadavg')));
      $this->load = [(float) ($load[0] ?? 0), (float) ($load[1] ?? 0), (float) ($load[2] ?? 0)];

      // @ Memory — /proc/meminfo in KB
      $info = [];
      foreach (file('/proc/meminfo', FILE_IGNORE_NEW_LINES) ?: [] as $row) {
         if (preg_match('/^(\w+):\s+(\d+)/', $row, $matches) === 1) {
            $info[$matches[1]] = (int) $matches[2];
         }
      }
      $total = $info['MemTotal'] ?? 0;
      $available = $info['MemAvailable'] ?? 0;
      $this->memory = ['total' => $total, 'used' => $total - $available, 'available' => $available];
   }

   /**
    * Rank processes by resident memory.
    *
    * @return array<int,array{pid:int,name:string,state:string,rss:int,cpu:float}>
    */
   public function rank (int $limit = 15): array
   {
      // ?
      if ($this->elapse('rank') === false) {
         return array_slice($this->processes, 0, $limit);
      }

      $uptime = (float) explode(' ', (string) file_get_contents('/proc/uptime'))[0];
      $ticks = 100;  // clock ticks per second (Linux default)
      $page = 4096;  // bytes per memory page

      $processes = [];
      foreach (glob('/proc/[0-9]*/stat') ?: [] as $file) {
         $stat = file_get_contents($file);
         if ($stat === false) {
            continue;
         }

         // ! The name sits in parentheses and may contain spaces
         $open = (int) strpos($stat, '(');
         $close = (int) strrpos($stat, ')');
         $name = substr($stat, $open + 1, $close - $open - 1);
         $fields = explode(' ', trim(substr($stat, $close + 2)));
         // after the name: 0 state … 11 utime, 12 stime … 19 starttime … 21 rss
         if (count($fields) < 22) {
            continue;
         }

         $elapsed = max($uptime - (int) $fields[19] / $ticks, 1.0);

         $processes[] = [
            'pid' => (int) basename(dirname($file)),
            'name' => $name,
            'state' => $fields[0],
            'rss' => (int) $fields[21] * $page,
            'cpu' => round(((int) $fields[11] + (int) $fields[12]) / $ticks / $elapsed * 100, 1)
         ];
      }
      usort($processes, static fn (array $a, array $b): int => $b['rss'] <=> $a['rss']);

      $this->processes = $processes;

      return array_slice($processes, 0, $limit);
   }

   /**
    * Measure the usage of the mounted filesystems.
    *
    * @return array<int,array{mount:string,type:string,total:float,used:float,percent:float}>
    */
   public function measure (): array
   {
      // ?
      if ($this->elapse('measure') === false) {
         return $this->disks;
      }

      // ! Block devices, plus the root filesystems containers and VMs mount without one —
      //   minus read-only images (snaps, discs), which always read as 100% full
      $roots = ['overlay', 'fuse.fuse-overlayfs', 'virtiofs', '9p', 'erofs'];
      $images = ['squashfs', 'iso9660'];

      $disks = [];
      foreach (file('/proc/mounts', FILE_IGNORE_NEW_LINES) ?: [] as $row) {
         [$device, $mount, $type] = explode(' ', $row) + [1 => '', 2 => ''];
         $mount = str_replace('\\040', ' ', $mount);

         if (
            (str_starts_with($device, '/dev/') === false && in_array($type, $roots, true) === false)
            || in_array($type, $images, true) || isset($disks[$mount]) || is_dir($mount) === false
         ) {
            continue;
         }

         $total = (float) disk_total_space($mount);
         $free = (float) disk_free_space($mount);
         if ($total <= 0.0) {
            continue;
         }

         $disks[$mount] = [
            'mount' => $mount,
            'type' => $type,
            'total' => $total,
            'used' => $total - $free,
            'percent' => round(($total - $free) / $total * 100, 1)
         ];
      }

      $this->disks = array_values($disks);

      return $this->disks;
   }

   /**
    * Forget the reading times, so the next call of every probe reads again.
    */
   public function reset (): void
   {
      $this->readings = [];
   }

   /**
    * Format bytes for humans (KB, MB, GB, TB).
    */
   public function format (float $bytes): string
   {
      foreach (['B', 'KB', 'MB', 'GB', 'TB'] as $unit) {
         if ($bytes < 1024.0 || $unit === 'TB') {
            return sprintf($unit === 'B' ? '%d %s' : '%.1f %s', $bytes, $unit);
         }
         $bytes /= 1024.0;
      }

      return '';
   }

   // ---

   /**
    * Check whether `$interval` seconds elapsed since the probe's last reading
    * — and stamp the reading when they did.
    */
   private function elapse (string $probe): bool
   {
      $now = hrtime(true) / 1e9;
      $last = $this->readings[$probe] ?? 0.0;

      // ?
      if ($last > 0.0 && $now - $last < $this->interval) {
         return false;
      }

      $this->readings[$probe] = $now;

      return true;
   }
}
```

`namespace Monitor;` mirrors the project folder — that is how Bootgly autoloads your classes (`projects/Monitor/System.php` is `Monitor\System`). `use function …` imports are the Bootgly style for global functions inside a namespace.

  </d-block-step>

  <d-block-step title="Write the app class">

`Console\App` is the TUI shell: alternate screen, raw keyboard input, a render loop, the status bar, toasts, the help overlay (`?`) and the command palette (`Ctrl+P`). Extend it so every screen reaches the same probes through `$App->System`:

**File** `projects/Monitor/Monitor.php`

```php :filename="projects/Monitor/Monitor.php";
<?php

namespace Monitor;


use Console\App;


/**
 * The Monitor app — the Console App shell carrying the System probes,
 * so every screen reads the same samples through `$App->System`.
 */
class Monitor extends App
{
   // * Data
   public System $System;


   public function __construct ()
   {
      parent::__construct();

      $this->System = new System;
      $this->System->sample(); // baseline — the first frame already shows a CPU delta
   }
}
```

The constructor takes a first sample right away, so the very first frame already shows a CPU delta.

  </d-block-step>

  <d-block-step title="Write the project signature">

Replace the scaffolded `Monitor.Project.php`. The `boot` function is what `php bootgly project Monitor start` runs: it loads the screens directory, binds one number key per screen whose file already exists (`is_file` — so a key never points at a screen you have not written yet), fills the status bar with those keys and hands control to the app loop.

**File** `projects/Monitor/Monitor.Project.php`

```php :filename="projects/Monitor/Monitor.Project.php";
<?php

use Bootgly\API\Projects\Project;

use Monitor\Monitor;


return new Project(
   // # Project Metadata
   name: 'Monitor',
   description: 'Live system dashboard — Console platform App',
   version: '1.0.0',
   author: 'Cookbook',
   exportable: true,

   // # Project Boot Function
   boot: function (array $arguments = [], array $options = []): void
   {
      $App = new Monitor;

      // @ Screens (one file per screen in screens/)
      $App->Screens->load(__DIR__ . '/screens');

      // @ Keymaps — one number per screen whose file exists (q, ? and Ctrl+P come with the shell)
      $labels = [];
      foreach (['1' => 'Overview', '2' => 'Processes', '3' => 'Disks'] as $key => $screen) {
         if (is_file(__DIR__ . "/screens/{$screen}.php") === true) {
            $App->Keymaps->bind($key, $screen, fn () => $App->Screens->switch($screen));
            $labels[] = "{$key} {$screen}";
         }
      }
      $App->Keymaps->bind('r', 'Refresh now', function () use ($App): void {
         $App->System->reset();
         $App->Toasts->add('Refreshed');
      });

      // @ Status bar
      $App->Statusbar->left = ['Monitor', gethostname()];
      $App->Statusbar->right = [implode(' · ', $labels), '? help · q quit'];

      $App->boot();
      $App->run('Overview');
   }
);
```

`boot()` installs three bindings of its own — `q` quits, `?` opens the help overlay generated from your keymaps and `Ctrl+P` opens the palette — and `run('Overview')` picks the first screen.

  </d-block-step>

  <d-block-step title="Write the first screen">

Screens live in `screens/`: a manifest with the three screen names plus one file per screen — the manifest may name a file before you write it, the boot function only binds the keys of the files that exist:

**File** `projects/Monitor/screens/screens.index.php`

```php :filename="projects/Monitor/screens/screens.index.php";
<?php

return [
   'Overview',
   'Processes',
   'Disks'
];
```

A screen is a closure receiving the app and its `Screen` object, and it returns the frame content as a string — one line per row; the app fits every line to the terminal width.

The **Overview** screen renders two core widgets — a `Meter` gauge for CPU and memory and a `Sparkline` for the CPU history. Any non-interactive widget renders into a string with `Component::RETURN_OUTPUT`, so it can be part of the frame:

**File** `projects/Monitor/screens/Overview.php`

```php :filename="projects/Monitor/screens/Overview.php";
<?php

use Bootgly\API\Component;
use Bootgly\CLI\Terminal;
use Bootgly\CLI\UI\Components\Chart\Gradient;
use Bootgly\CLI\UI\Components\Charts\Meter;
use Bootgly\CLI\UI\Components\Charts\Sparkline;
use Console\App\Screens\Screen;

use Monitor\Monitor;


return static function (Monitor $App, Screen $Screen): string {
   $System = $App->System;
   $System->sample();

   $width = max(20, min(Terminal::$width - 4, 60));
   $Gradient = new Gradient(['#00c853', '#ffd600', '#ff1744']);

   // @ CPU gauge
   $CPU = new Meter($App->Output);
   $CPU->width = $width;
   $CPU->Gradient = $Gradient;
   $CPU->heading = '@#White:CPU@;';
   $CPU->summary = "{$System->CPU}%";
   $CPU->value = $System->CPU;

   // @ Memory gauge
   $memory = $System->memory;
   $percent = $memory['total'] > 0 ? round($memory['used'] / $memory['total'] * 100, 1) : 0.0;

   $Memory = new Meter($App->Output);
   $Memory->width = $width;
   $Memory->Gradient = $Gradient;
   $Memory->heading = '@#White:Memory@;';
   $Memory->summary = $System->format($memory['used'] * 1024) . ' / ' . $System->format($memory['total'] * 1024);
   $Memory->value = $percent;

   // @ CPU history
   $History = new Sparkline($App->Output);
   $History->series = $System->history;

   return implode("\n", [
      '',
      (string) $CPU->render(Component::RETURN_OUTPUT),
      '',
      (string) $Memory->render(Component::RETURN_OUTPUT),
      '',
      ' Load average  ' . implode('  ', $System->load),
      ' CPU history   ' . (string) $History->render(Component::RETURN_OUTPUT),
      '',
      ' Press r to refresh — the status bar lists the screens, ? lists every key.'
   ]);
};
```

  </d-block-step>

  <d-block-step title="Run it">

Start the project from the kit directory:

```bash :toolbar="true";
php bootgly project Monitor start
```

The terminal switches to the alternate screen and you see the Overview updating every second. Press `?` for the help overlay, `Ctrl+P` for the palette, `r` to refresh right away and `q` to leave — your shell comes back exactly as it was, scrollback included.

> [!NOTE]
> Without a terminal (a pipe, CI, an AI agent) the app renders a single frame and exits, so `php bootgly project Monitor start | head` is a safe way to check a screen.

The status bar shows `1 Overview` only: the other two keys appear as soon as their screen files exist, in the next two steps.

  </d-block-step>

  <d-block-step title="Add the Processes screen">

Rank the processes by resident memory and render them as a table. The `Markdown` widget turns a Markdown table into an aligned terminal table, so the screen only builds text:

**File** `projects/Monitor/screens/Processes.php`

```php :filename="projects/Monitor/screens/Processes.php";
<?php

use Bootgly\API\Component;
use Bootgly\CLI\Terminal;
use Bootgly\CLI\UI\Components\Markdown;
use Console\App\Screens\Screen;

use Monitor\Monitor;


return static function (Monitor $App, Screen $Screen): string {
   $System = $App->System;
   $limit = max(5, Terminal::$height - 6);

   $source = "| PID | Name | State | Memory | CPU % |\n";
   $source .= "|----:|:-----|:-----:|-------:|------:|\n";
   foreach ($System->rank($limit) as $process) {
      $source .= sprintf(
         "| %d | %s | %s | %s | %.1f |\n",
         $process['pid'],
         $process['name'],
         $process['state'],
         $System->format($process['rss']),
         $process['cpu']
      );
   }

   $Markdown = new Markdown($App->Output);
   $Markdown->source = $source;

   return (string) $Markdown->render(Component::RETURN_OUTPUT);
};
```

`Terminal::$height` keeps the list inside the pane (the status bar takes the last row).

  </d-block-step>

  <d-block-step title="Add the Disks screen">

One gauge per mounted filesystem, with the corner labels `Meter` offers — heading and summary above the bar, caption and note below:

**File** `projects/Monitor/screens/Disks.php`

```php :filename="projects/Monitor/screens/Disks.php";
<?php

use Bootgly\API\Component;
use Bootgly\CLI\Terminal;
use Bootgly\CLI\UI\Components\Chart\Gradient;
use Bootgly\CLI\UI\Components\Charts\Meter;
use Console\App\Screens\Screen;

use Monitor\Monitor;


return static function (Monitor $App, Screen $Screen): string {
   $System = $App->System;
   $width = max(20, min(Terminal::$width - 4, 60));
   $Gradient = new Gradient(['#00c853', '#ffd600', '#ff1744']);

   $lines = [''];
   foreach ($System->measure() as $disk) {
      $Meter = new Meter($App->Output);
      $Meter->width = $width;
      $Meter->Gradient = $Gradient;
      $Meter->heading = "@#White:{$disk['mount']}@; ({$disk['type']})";
      $Meter->summary = "{$disk['percent']}%";
      $Meter->caption = $System->format($disk['used']) . ' used';
      $Meter->note = $System->format($disk['total']) . ' total';
      $Meter->value = $disk['percent'];

      $lines[] = (string) $Meter->render(Component::RETURN_OUTPUT);
      $lines[] = '';
   }

   return implode("\n", $lines);
};
```

Start the project again and press `2` and `3`:

```bash :toolbar="true";
php bootgly project Monitor start
```

```text
    PID │ Name         │ State │   Memory │ CPU %
────────┼──────────────┼───────┼──────────┼───────
  97750 │ node         │   S   │   1.0 GB │   2.7
  18216 │ msedge       │   S   │ 781.4 MB │   2.7
   3274 │ plasmashell  │   S   │ 516.6 MB │   0.9
```

  </d-block-step>

  <d-block-step title="Test it">

A project carries its own suites. Replace the scaffolded registry so it lists a `System` suite, then write the suite and one test — the Basic API is a generator that `yield`s one native `assert()` per check:

**File** `projects/Monitor/tests/autoboot.php`

```php :filename="projects/Monitor/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/system/',
   ]
);
```

**File** `projects/Monitor/tests/system/autoboot.php`

```php :filename="projects/Monitor/tests/system/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suite;


return new Suite(
   // * Config
   autoBoot: __DIR__,
   autoInstance: true,
   autoReport: true,
   autoSummarize: true,
   exitOnFailure: true,
   // * Data
   suiteName: 'System',
   tests: [
      '1.1-probes',
   ]
);
```

**File** `projects/Monitor/tests/system/1.1-probes.Test.php`

```php :filename="projects/Monitor/tests/system/1.1-probes.Test.php";
<?php

use Bootgly\ACI\Tests\Suite\Test;

use Monitor\System;


return new Test(
   description: 'System probes read /proc',
   test: function () {
      $System = new System;
      $System->sample();

      yield assert(
         assertion: $System->memory['total'] > 0,
         description: 'memory total is known'
      );

      // @ A second reading (the interval waived) gives the first CPU delta
      usleep(50_000);
      $System->reset();
      $System->sample();
      yield assert(
         assertion: count($System->history) === 2 && $System->CPU >= 0.0 && $System->CPU <= 100.0,
         description: 'the second sample yields a CPU usage within 0..100 %'
      );

      $processes = $System->rank(5);
      yield assert(
         assertion: count($processes) > 0 && count($processes) <= 5,
         description: 'ranks at most 5 processes'
      );

      yield assert(
         assertion: $System->measure() !== [],
         description: 'measures at least one filesystem'
      );
   }
);
```

Run the project's suites from inside the project directory — the launcher is two levels up, in the kit root:

```bash :toolbar="true";
cd projects/Monitor && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Next steps

- Add a screen: create `screens/Network.php` (read `/proc/net/dev`), list it in `screens/screens.index.php` and bind a key in `Monitor.Project.php`.
- Push a screen instead of switching — `$App->Screens->push('Details', ['pid' => 42])` overlays it and `pop()` comes back; the pushed screen reads `$Screen->state['pid']`.
- Tail a log inside the app with the `Tail` widget, or replace the process table with a `Bars` chart.
- Commit your work: the project is its own git repository — `git -C projects/Monitor status`; if the scaffold commit was skipped, set `git config --global user.name`/`user.email` and `git -C projects/Monitor commit -m "chore: scaffold"`.

## Reference

- [Console App](/manual/Console/App/overview/) — `App`, `Screens`, `Router`, `Keymaps`, `Statusbar`, `Toasts`, `Palette`, `Tail`.
- [Charts](/manual/CLI/UI/Components/Charts/overview/) — `Meter`, `Sparkline`, `Bars`, `Graph` and `Gradient`.
- [Markdown](/manual/CLI/UI/Components/Markdown/overview/) — the terminal Markdown renderer used for the process table.
- [Projects](/manual/Bootgly/essential/projects/overview/) — `projects create` flags, the project signature and the autoloader namespaces.
- [Testing](/testing/about/testing/overview/) — suites, the Basic and Advanced assertion APIs and `bootgly test`.
