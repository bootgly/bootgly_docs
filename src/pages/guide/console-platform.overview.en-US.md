# Console Platform

Build full-screen terminal apps — dashboards, tools, even games — with Bootgly's opinionated TUI platform. Zero dependencies, pure PHP.

## Set it up

The [canonical installer](/guide/getting-started) can install it right away — it asks which platforms to set up, so just pick **Console**:

```bash
curl -fsSL https://bootgly.com/install | bash
```

## Your first TUI app

Create a project (interface **CLI**) with the wizard, then make its `.project.php` boot a `Console\App`:

```php
use Bootgly\API\Projects\Project;

use Console\App;


return new Project(
   name: 'Hello',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $App = new App;

      $App->Screens->load(__DIR__ . '/screens');
      $App->Statusbar->left = ['Hello'];
      $App->Keymaps->bind('l', 'Logs', function () use ($App): void {
         $App->Screens->switch('Logs');
      });

      $App->boot();
      $App->run('Dashboard');
   }
);
```

Screens are plain files: a manifest plus one view per screen —

```php
// screens/screens.index.php
return [
   'Dashboard',
   'Logs'
];
```

```php
// screens/Dashboard.php
use Console\App;
use Console\App\Screens\Screen;

return static function (App $App, Screen $Screen): string {
   return "Dashboard — press ? for help, Ctrl+P for the palette";
};
```

Start it:

```bash
php bootgly project Hello start
```

You get the shell for free: alternate screen (your shell scrollback survives), `?` opens a help overlay generated from your keymaps, `Ctrl+P` opens a command palette over them, `q` quits with the terminal fully restored — including Ctrl+C.

## Play in the browser

The platform ships three complete games as exportable projects — play them right here (PHP WASM, no server):

<d-block-terminal
  engine="bootgly-cli"
  title="Console Games — live"
  commands="Snake:project Snake start|Pong:project Pong start|Invaders:project Invaders start"
  height="560"
>
Pick a game and press Run, then **click the terminal to focus it**. Enter starts, `q` quits. Snake: arrows steer, holding accelerates. Pong: hold ↑/↓, first to 5 wins. Invaders: ←/→ move, Space fires.
</d-block-terminal>

In your own kit, import them with the wizard (**Import projects from Platforms**) and run natively:

```bash
php bootgly project Snake start
php bootgly project Pong start
php bootgly project Invaders start
```

They are compact references for the **Games** module: fixed-timestep loop, diff-rendered Canvas, held-key detection, scenes, sprite sheets and 2D math.

## Going deeper

- [Console](/manual/Console) — how the platform boots and how projects bind to it.
- [App](/manual/Console/App) — the app shell: Screens + Router, Keymaps, Statusbar, Toasts, Palette, Tail.
- [Games](/manual/Console/Games) — the game shell: Loop, Canvas (Block/Half/Braille), Keyboard, Scenes, Sprites and 2D math.
