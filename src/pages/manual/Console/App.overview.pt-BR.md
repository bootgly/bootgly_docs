# Console App

`Console\App` é o shell de aplicação TUI: ele é dono do ciclo de vida do terminal — tela alternativa, input raw, rastreio de resize, restauração na saída — e roda um loop non-blocking que drena teclas, despacha keymaps e renderiza a tela atual em uma taxa de quadros limitada.

Um frame é composto por um único painel de conteúdo (a view da **Screen** atual ou um overlay ativo), linhas de **Toast** sobrepostas no topo e a **Statusbar** na última linha.

## Um app mínimo

A closure `boot` do projeto constrói e executa o App:

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

## Screens

Screens são **Closures de view** navegadas por nome. Um diretório de screens tem um manifesto mais um arquivo por screen:

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

A view retorna o conteúdo do frame como string (linhas separadas por `\n`); o App ajusta cada linha à largura do terminal. Navegue com `switch()` (substitui), `push()` (sobrepõe, estilo modal) e `pop()` (volta):

```php
$App->Screens->switch('Logs', state: ['filter' => 'error']);
```

Cada `Screen` carrega seus próprios `$Keymaps` (verificados antes dos globais) e um array `$state` passado pela chamada de navegação.

## Keymaps

Bindings mapeiam uma tecla — ou um chord (uma sequência como `g g`) — para um handler rotulado:

```php
use Bootgly\CLI\Terminal\Input\Keystrokes;

$App->Keymaps->bind('q', 'Quit', fn () => $App->quit());
$App->Keymaps->bind(Keystrokes::CTRL_P, 'Command palette', fn () => $App->Palette->toggle());
$App->Keymaps->bind(['g', 'g'], 'Go to top', fn () => $App->Toasts->add('Topo!'));
```

`boot()` instala três bindings padrão: `Ctrl+P` (paleta), `?` (overlay de ajuda, gerado automaticamente a partir dos keymaps) e `q` (sair).

## Widgets de chrome

A status row e a stack de toasts SÃO os componentes do core — o App compõe o [Atom Statusbar](/manual/CLI/UI/Atoms/Statusbar) na última linha e mescla a stack de [Toasts](/manual/CLI/UX/Components/Toasts) pela costura `overlay()` (caixas com borda, posições de tela, severidade `Alert\Type`):

```php
use Bootgly\CLI\UI\Components\Alert\Type;

$App->Statusbar->left = ['Snake', 'Score: 3'];
$App->Statusbar->right = ['[?] help'];

$App->Toasts->add('Salvo!');                      // tipo default, expira em 3s
$App->Toasts->add('Disco cheio', Type::Failure);  // Success | Attention | Failure
```

A **Palette** (`Ctrl+P`) busca incrementalmente nos keymaps registrados — digite para filtrar, `↑`/`↓` para selecionar, `Enter` para executar, `Esc` para dispensar.

**Tail** é um widget visualizador de logs — o pager [Logs](/manual/CLI/UI/Components/Logs) do core vinculado a uma fonte pull:

```php
use const Bootgly\CLI;
use Console\App\Tail;

$Tail = new Tail(CLI->Terminal->Input, CLI->Terminal->Output);
$Tail->follow(fn (): string|false => $LogPipe->read(65536));
$Tail->pull();    // drena a fonte a cada frame
$Tail->render();  // frame completo (ou ancore com $Tail->row / $Tail->rows)
```

## Widgets do core como conteúdo de screen

Qualquer widget não-interativo do core renderiza direto numa view — `RETURN_OUTPUT` entrega a string pro frame. Telas de ajuda em [Markdown](/manual/CLI/UI/Components/Markdown), dumps de estado com o [Dumper](/manual/CLI/UI/Atoms/Dumper), banners com [Figlet](/manual/CLI/UI/Atoms/Figlet), views de código com o [Highlighter](/manual/CLI/UI/Atoms/Highlighter), tabelas e charts — sem cola nenhuma:

```php
// screens/State.php
use const Bootgly\CLI;
use Bootgly\API\Component;
use Bootgly\CLI\UI\Atoms\Dumper;
use Console\App;
use Console\App\Screens\Screen;

return static function (App $App, Screen $Screen): string {
   $Dumper = new Dumper(CLI->Terminal->Output);
   $Dumper->value = $Screen->state;

   return "Estado do app:\n" . (string) $Dumper->render(Component::RETURN_OUTPUT);
};
```

A única regra: widgets que rodam **read-loop próprio** (Menu, Form, Question, Finder) nunca renderizam dentro de uma view — o loop do App já é dono do stdin. Screens renderizam strings; ações vivem nos keymaps.

## Notas de comportamento

- **Execuções não interativas** (pipes, CI): `boot()` pula a tomada do terminal e `run()` renderiza um único frame e retorna — determinístico e seguro.
- **Ordem de despacho do input**: Palette ativa → overlay de ajuda → keymaps da Screen atual → keymaps globais.
- **Componentes interativos do core** (Menu, Form, Question) têm read-loops próprios — **não** os chame dentro de uma view de screen: o loop do App já é dono do stdin. Screens renderizam strings; ações vivem nos keymaps.
- Panes (splits horizontais/verticais) não fazem parte do MVP — um painel de conteúdo + overlays.

---

## Referência

### Console\App

```php
public function __construct (null|Input $Input = null, null|Output $Output = null)
```

Constrói o shell e seus widgets. Input/Output vêm do Terminal da CLI por padrão; injete streams em memória para testes.

```php
public function boot (): self
```

Instala os bindings padrão e — em um TTY interativo — entra na tela alternativa, esconde o cursor, coloca o input em modo raw non-blocking, rastreia resizes e registra a restauração na saída (shutdown + SIGINT).

```php
public function run (null|string $screen = null): void
```

Muda para a screen inicial (quando informada) e roda o loop principal até `quit()` ou a pilha de screens esvaziar. Em execução não interativa, renderiza um frame e retorna.

```php
public function quit (): void
```

Para o loop principal.

```php
public function render (): void
```

Renderiza um frame completo: painel de conteúdo, linhas de toast e a status bar.

### Console\App\Screens

```php
public function load (string $path): self
```

Carrega um manifesto de screens (delega ao Router).

```php
public function switch (string $screen, array $state = []): Screen
```

Ativa uma screen, substituindo a atual.

```php
public function push (string $screen, array $state = []): Screen
```

Sobrepõe uma screen sobre a atual (estilo modal).

```php
public function pop (): null|Screen
```

Remove a screen do topo, voltando à anterior.

### Console\App\Router

```php
public function load (string $path): self
```

Carrega `<path>/screens.index.php` (um array de nomes de screens); cada nome mapeia para `<path>/<Nome>.php`, exigido de forma lazy no primeiro resolve.

```php
public function route (string $screen, Closure $view): self
```

Registra uma view de screen inline.

```php
public function check (string $screen): bool
```

Verifica se um nome de screen é roteável.

```php
public function resolve (string $screen): Closure
```

Resolve um nome de screen para sua Closure de view — lança `InvalidArgumentException` para nomes desconhecidos ou arquivos inválidos.

### Console\App\Keymaps

```php
public function bind (string|array|Keystrokes $keys, string $label, Closure $handler): self
```

Registra um binding: uma tecla, um case de `Keystrokes` ou um array deles (um chord).

```php
public function handle (string $key, null|float $at = null): bool
```

Consome uma tecla crua: matches exatos executam o handler; prefixos de chord ficam em buffer até a próxima tecla ou o timeout do chord (`$timeout`, 800 ms). Retorna se a tecla foi consumida.

```php
public function reset (): void
```

Reseta o buffer de chord pendente.

```php
public function list (): array
```

Lista os bindings (`keys`, `label`, `handler`) — alimenta o overlay de ajuda e a Palette.

### Statusbar e Toasts

A status row e a stack de toasts são os componentes do CORE, compostos pelo App com pin `RETURN_OUTPUT` — veja as referências do [Atom Statusbar](/manual/CLI/UI/Atoms/Statusbar) e dos [Toasts](/manual/CLI/UX/Components/Toasts). O App mescla as caixas de toast via `Toasts::overlay()` (linhas absolutas 1-based) e confia no streaming plain classificado do `add()` em saída não-interativa.

### Console\App\Palette

```php
public function toggle (): void
```

Abre/fecha a paleta (abrir reseta a busca e a seleção).

```php
public function control (string $key): bool
```

Trata uma tecla enquanto ativa — sempre a consome.

```php
public function filter (): array
```

Filtra os bindings pela busca atual (comparada com os rótulos).

```php
public function render (int $mode = self::RETURN_OUTPUT): null|string
```

Renderiza o conteúdo do frame da paleta.

### Console\App\Tail

```php
public function follow (null|Closure $source): self
```

Vincula (ou desvincula com `null`) a fonte pull — `function (): string|false` retornando o próximo chunk de registros JSON delimitados por newline.

```php
public function pull (): void
```

Drena a fonte vinculada para o buffer de logs (chame uma vez por frame).
