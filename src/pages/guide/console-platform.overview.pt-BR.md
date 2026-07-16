# Plataforma Console

Construa apps de terminal full-screen — dashboards, ferramentas e até jogos — com a plataforma TUI opinativa do Bootgly. Zero dependências, PHP puro.

## Configure

O [instalador canônico](/guide/getting-started) já a instala na hora — ele pergunta quais plataformas configurar, é só escolher **Console**:

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

## Seu primeiro app TUI

Crie um projeto (interface **CLI**) com o wizard e faça o `.project.php` dele bootar um `Console\App`:

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

Screens são arquivos simples: um manifesto mais uma view por screen —

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
   return "Dashboard — pressione ? para ajuda, Ctrl+P para a paleta";
};
```

Inicie:

```bash :toolbar="true";
php bootgly project Hello start
```

Você ganha o shell de graça: tela alternativa (o scrollback do seu shell sobrevive), `?` abre um overlay de ajuda gerado dos seus keymaps, `Ctrl+P` abre uma paleta de comandos sobre eles, `q` sai com o terminal totalmente restaurado — incluindo Ctrl+C.

## Jogue no navegador

A plataforma traz três jogos completos como projetos exportáveis — jogue-os aqui mesmo (PHP WASM, sem servidor):

<d-block-terminal
  engine="bootgly-cli"
  title="Console Games — ao vivo"
  commands="Snake:project Snake start|Pong:project Pong start|Invaders:project Invaders start"
  height="560"
>
Escolha um jogo e pressione Run, depois **clique no terminal para focá-lo**. Enter inicia, `q` sai. Snake: setas dirigem, segurar acelera. Pong: segure ↑/↓, o primeiro a 5 vence. Invaders: ←/→ movem, Space atira.
</d-block-terminal>

No seu próprio kit, importe-os com o wizard (**Import projects from Platforms**) e rode nativamente:

```bash
php bootgly project Snake start
php bootgly project Pong start
php bootgly project Invaders start
```

Eles são referências compactas para o módulo **Games**: loop de timestep fixo, Canvas com renderização por diff, detecção de tecla segurada, scenes, sprite sheets e matemática 2D.

## Indo mais fundo

- [Console](/manual/Console) — como a plataforma boota e como projetos se vinculam a ela.
- [App](/manual/Console/App) — o shell de app: Screens + Router, Keymaps, Statusbar, Toasts, Palette, Tail.
- [Games](/manual/Console/Games) — o shell de jogo: Loop, Canvas (Block/Half/Braille), Keyboard, Scenes.
