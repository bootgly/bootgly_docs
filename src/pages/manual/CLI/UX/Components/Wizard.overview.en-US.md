# Wizard Component

The `Wizard` component is a declarative multi-step guided flow on the [Timeline](/manual/CLI/UI/Components/Timeline/overview) spine: each step binds a label to a handler, and `run()` walks them forward-only with the timeline fixed at the top of the screen — past steps with a green `✔`, the active one with a cyan `◉`, future ones muted in gray `○`. Each activation repaints a fresh screen, so the active step's content — any component the handler renders — always sits right below the frame, and the whole flow map stays visible while the user answers. It is the component behind the canonical project installer (`bootgly project create`).

A live demo is available in the [showcase](/manual/CLI/UX/Components/Wizard/showcase).

## Instance

Create an instance passing the terminal `Input` and `Output` (the UX composite signature — handlers reach both through the Wizard). The optional `title` heads the frame on every repaint:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Wizard;

$Terminal = CLI->Terminal;

$Wizard = new Wizard($Terminal->Input, $Terminal->Output);
$Wizard->title = '@#Cyan: My installer @;';
```

## Adding steps

`add()` binds a label to a handler. The handler receives the Wizard and returns the step note — the short gray annotation rendered beside the completed label — or `null` for no note:

```php
$Wizard->add('Name', function (Wizard $Wizard): string {
   // ... ask something ...
   return $name;   // becomes: ✔ Name (App)
});

$Wizard->add('Build', function (Wizard $Wizard): null {
   // ... do work, no note ...
   return null;    // becomes: ✔ Build
});
```

## Running

`run()` walks the steps in order: each activation clears the screen, paints the title and the full frame — the upcoming steps already visible in gray — and invokes the handler right below it. Completion closes on a fresh screen with the final all-done frame; a failure appends the final frame instead, preserving the failed step's content and Alerts:

```php
$done = $Wizard->run();
```

It returns `true` when the flow completes and `false` when a step fails — or when called again (flows are one-shot) or with no steps.

## Components between steps

Handlers instantiate components directly with the shared IO — any component renders between the timeline points:

```php
use Bootgly\CLI\UI\Components\Question;

$Wizard->add('Name', function (Wizard $Wizard): string {
   $Question = new Question($Wizard->Input, $Wizard->Output);
   $Question->prompt = 'Project name';
   $Question->required = true;

   return $Question->ask();
});
```

The same works for `Menu`, `Fieldset`, `Alert`, `Progress` — or raw output. Data flows between steps through closure captures (`use (&$name)`).

## Dynamic branches

`add()` also works during `run()` — mid-run additions insert **right after the active step** (in add order), so a handler slots the steps of the branch it resolves before the upcoming ones. Declare the common steps upfront (they stay visible in gray) and branch in place:

```php
$Wizard->add('Interface', function (Wizard $Wizard) use (&$interface): string {
   // ... choose CLI or WPI ...

   // ? WPI flows get a Port step — slotted before the upcoming Confirm
   if ($interface === 'WPI') {
      $Wizard->add('Port', fn (Wizard $Wizard): string => /* ... */);
   }

   return $interface;
});
$Wizard->add('Confirm', fn (Wizard $Wizard): null => /* ... */);
```

A resolver step may also append a whole branch — the installer's Mode step adds the entire from-scratch, platform-import or git-import sequence once the user picks one.

## Failing a step

Throw any `Throwable` to fail the step and stop the flow: the step is marked with a red `✖`, later steps stay pending, `run()` returns `false` and the Throwable is exposed on `$Wizard->Throwable`. The message becomes the ✖ note — keep it a short slug and render rich context (an `Alert`) before throwing:

```php
$Wizard->add('Confirm', function (Wizard $Wizard): null {
   $Question = new Question($Wizard->Input, $Wizard->Output);

   if ($Question->confirm('Create the project?', default: true) === false) {
      throw new Exception('aborted');   // becomes: ✖ Confirm (aborted)
   }

   return null;
});
```

## Non-interactive output

On pipes and CI, no screens are cleared and no frames are printed: the title renders once and each transition appends one plain line — `◉ label` on activation, `✔ label (note)` on completion, `✖ label (note)` on failure — exactly the Timeline append behavior. Handlers' components degrade on their own (a `Question` reads one stdin line), so the same code runs interactively and in scripts.

## Reference

### Properties

```php
public Input $Input
```

The terminal Input shared with the step handlers' components.

```php
public Output $Output
```

The terminal Output shared with the step handlers' components.

```php
public string $title
```

Config. Heading repainted above the frame on interactive terminals — rendered once on non-interactive output. Default: `''`.

```php
public private(set) Timeline $Timeline
```

Data (read-only). The state and rendering spine — configure the state glyphs through `$Wizard->Timeline->glyphs`.

```php
public private(set) null|Throwable $Throwable
```

Metadata (read-only). The Throwable that failed the flow — `null` while none.

```php
public private(set) bool $finished
```

Metadata (read-only). Whether the flow ended (completed or failed).

### add()

```php
public function add (string $label, Closure $handler): Step
```

Adds a step: the label enters the timeline and the handler is invoked when the step activates. Callable before and during `run()` — mid-run additions insert right after the active step, in add order. Returns the Timeline `Step`.

### run()

```php
public function run (): bool
```

Runs the flow forward-only, one-shot: activates each step, presents the frame (a fresh screen per activation on interactive terminals; an append line on pipes), invokes the handler and marks the step done with the returned note. A handler throw fails the step and stops the flow. Returns whether the flow completed.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the current timeline frame — blank-line separated when writing; returns the raw markup frame with `RETURN_OUTPUT`.
