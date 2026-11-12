# Console App

`Console\App` é o shell de aplicação TUI: ele é dono do ciclo de vida do terminal — tela alternativa, input raw, rastreio de resize, restauração na saída — e roda um loop non-blocking que lê uma tecla por frame, a despacha para os keymaps e renderiza a tela atual em uma taxa de quadros limitada (`$FPS`).

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

A view retorna o conteúdo do frame como string (linhas separadas por `\n`); o App corta cada linha na largura do terminal e mantém as linhas que cabem acima da status bar. Navegue com `switch()` (substitui), `push()` (sobrepõe, estilo modal) e `pop()` (volta) — tirar a última screen da pilha encerra o `run()`:

```php
$App->Screens->switch('Logs', state: ['filter' => 'error']);
```

Uma screen também pode ser roteada inline, sem arquivo, pelo `Router` por trás de `$App->Screens` — uma rota inline vence uma entrada do manifesto com o mesmo nome:

```php
use Console\App;
use Console\App\Screens\Screen;

$App->Screens->Router->route('About', fn (App $App, Screen $Screen): string => 'Bootgly Console');
```

Cada `switch()` e `push()` cria uma `Screen` **nova** — `$Keymaps` vazios, o `$state` informado —, enquanto o `pop()` volta para a screen de baixo do jeito que ela foi deixada. Registre as teclas próprias de uma screen a partir da view dela, uma vez por visita; elas são verificadas antes das globais:

```php
// screens/Logs.php
use Console\App;
use Console\App\Screens\Screen;

return static function (App $App, Screen $Screen): string {
   // ! Keymaps da screen: registrados uma vez por visita
   if ($Screen->Keymaps->list() === []) {
      $Screen->Keymaps->bind('e', 'Errors only', function () use ($Screen): void {
         $Screen->state['filter'] = 'error';
      });
   }

   $filter = $Screen->state['filter'] ?? 'all';

   return "Logs — filter: $filter";
};
```

## Keymaps

Bindings mapeiam uma tecla — ou um chord (uma sequência como `g g`) — para um handler rotulado:

```php
use Bootgly\CLI\Terminal\Input\Keystrokes;

$App->Keymaps->bind('q', 'Quit', fn () => $App->quit());
$App->Keymaps->bind(Keystrokes::CTRL_P, 'Command palette', fn () => $App->Palette->toggle());
$App->Keymaps->bind(['g', 'g'], 'Go to top', fn () => $App->Toasts->add('Topo!'));
```

`boot()` instala três bindings padrão: `Ctrl+P` (paleta), `?` (overlay de ajuda, gerado a partir dos keymaps) e `q` (sair). Registrar as mesmas teclas de novo substitui o binding anterior, então esses padrões substituem um `Ctrl+P`, `?` ou `q` que você registrou antes do `boot()` — registre depois dele para sobrescrevê-los.

O overlay de ajuda e a paleta mostram as teclas de cada binding como foram registradas: um case de `Keystrokes` pelo nome (`CTRL_P` → `Ctrl+P`, `PAGEDOWN` → `Pagedown`), uma string comum como está, um chord unido por espaços (`g g`). Um chord espera `$timeout` (800 ms) pela próxima tecla; uma tecla que o quebra é tentada de novo como uma sequência nova.

## Widgets de chrome

A status row e a stack de toasts SÃO os componentes do core — o App compõe o [Atom Statusbar](/manual/CLI/UI/Atoms/Statusbar) na última linha e mescla a stack de [Toasts](/manual/CLI/UX/Components/Toasts) pela costura `overlay()` (caixas com borda, posições de tela, severidade `Alert\Type`):

```php
use Bootgly\CLI\UI\Components\Alert\Type;

$App->Statusbar->left = ['Snake', 'Score: 3'];
$App->Statusbar->right = ['[?] help'];

$App->Toasts->add('Salvo!');                      // tipo default, expira em 3s
$App->Toasts->add('Disco cheio', Type::Failure);  // Success | Attention | Failure
```

A **Palette** (`Ctrl+P`) busca, conforme você digita, nos rótulos dos keymaps **globais** (`$App->Keymaps`) — uma busca por substring sem diferenciar maiúsculas de minúsculas: `↑`/`↓` para selecionar, `Enter` para executar, `Esc` para dispensar; a busca se edita como uma linha de shell (`←`/`→`, `Home`/`End`, `Backspace`/`Delete`, `Ctrl+U`/`Ctrl+K`/`Ctrl+W`). Keymaps de screen nunca aparecem ali — o overlay de ajuda (`?`) os lista, sob o nome da screen, acima dos globais.

## Um painel de logs com Tail

`Console\App\Tail` é o pager [Logs](/manual/CLI/UI/Components/Logs) do core — filtros de nível, canal e texto, pausa e rolagem, visão de detalhe — vinculado a uma fonte pull: `follow()` recebe uma `function (): string|false` que retorna o próximo chunk de registros JSON delimitados por newline (as linhas que o handler de log File escreve; `false` ou `''` significa drenada por enquanto), e `pull()` a drena para o pager.

O App não tem um lugar para ele. `render()` não retorna nada — escreve um frame inteiro no `Output` do próprio Tail — e o App nunca lhe entrega uma tecla. Para mostrá-lo numa screen, dê a ele um `Output` em memória, renderize-o a partir da view e retorne o que ele escreveu; para controlá-lo, registre as teclas que quiser nessa screen e repasse-as ao `control()`:

```php
use Bootgly\CLI\Terminal;
use Bootgly\CLI\Terminal\Input\Keystrokes;
use Bootgly\CLI\Terminal\Output;
use Console\App;
use Console\App\Screens\Screen;
use Console\App\Tail;

$Log = fopen(__DIR__ . '/app.log', 'r'); // linhas JSON, como o handler de log File as escreve

$Tail = new Tail($App->Input, new Output('php://memory'));
$Tail->follow(fn (): string|false => fread($Log, 65536));

$App->Screens->Router->route('Logs', function (App $App, Screen $Screen) use ($Tail): string {
   // ! As teclas que esta screen repassa ao pager (registradas uma vez por visita)
   if ($Screen->Keymaps->list() === []) {
      $Screen->Keymaps->bind(Keystrokes::SPACE, 'Pause / resume', fn () => $Tail->control(Keystrokes::SPACE->value));
      $Screen->Keymaps->bind('l', 'Cycle level', fn () => $Tail->control('l'));
      $Screen->Keymaps->bind(Keystrokes::UP, 'Previous record', fn () => $Tail->control(Keystrokes::UP->value));
      $Screen->Keymaps->bind(Keystrokes::DOWN, 'Next record', fn () => $Tail->control(Keystrokes::DOWN->value));
   }

   // @ Renderiza em memória e entrega o frame ao App
   $Tail->rows = Terminal::$height - 1; // o App guarda a última linha para a status bar
   $Tail->pull();
   $Tail->render();

   $Stream = $Tail->Output->stream;
   $frame = (string) stream_get_contents($Stream, null, 0);
   ftruncate($Stream, 0);
   rewind($Stream);

   return $frame;
});
```

Mantenha `$row` em 1 — o App posiciona o conteúdo sozinho. Só as teclas que você repassa chegam ao pager, embora o rodapé dele liste todas. `control()` retorna `false` para as teclas de saída do próprio pager (`q`, e `Esc` quando ao vivo): deixe-as para o App, cujo `q` global já sai.

O `Bootgly\CLI\UX\Components\Tail` do core é outro componente: um seguidor full-screen com loop próprio — o que está por trás do [`bootgly logs -f`](/guide/logs/overview/) — que nunca roda dentro de um App.

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

> [!NOTE]
> `Table` é o único widget que ainda não honra `RETURN_OUTPUT` — ele sempre escreve. Renderize dados tabulares pelo widget `Markdown` (uma tabela Markdown), como o [Monitor](/cookbook/console/monitor/overview/) do Cookbook faz.

A única regra: widgets que rodam **read-loop próprio** (Select, Form, Textbox) nunca renderizam dentro de uma view — o loop do App já é dono do stdin. Screens renderizam strings; ações vivem nos keymaps.

## Testando um App sem terminal

Um teste constrói o App e nunca chama `boot()` nem `run()`: nenhum terminal é tomado e nenhum loop começa. Carregue as screens, mude para uma, chame a view dela para obter o frame e pressione teclas pelos keymaps dela — aqui, um [teste do Bootgly](/testing/about/testing/overview/) da screen `Logs` acima, em `tests/<suíte>/` do projeto:

```php
<?php

use Bootgly\ACI\Tests\Suite\Test;
use Console\App;


return new Test(
   description: 'Logs filters the errors on e',
   test: function () {
      $App = new App;
      $App->Screens->load(__DIR__ . '/../../screens');

      $Screen = $App->Screens->switch('Logs');
      $frame = ($Screen->View)($App, $Screen); // a primeira chamada registra as teclas da screen
      yield assert(assertion: str_contains($frame, 'filter: all'), description: 'starts unfiltered');

      $Screen->Keymaps->handle('e');
      $frame = ($Screen->View)($App, $Screen);
      yield assert(assertion: str_contains($frame, 'filter: error'), description: 'e filters the errors');
   }
);
```

`$App->Keymaps->handle()` dirige os bindings globais do mesmo jeito. Para verificar um frame inteiro — status bar incluída —, construa o App sobre streams em memória e leia de volta o que o `render()` escreveu:

```php
use Bootgly\CLI\Terminal\Input;
use Bootgly\CLI\Terminal\Output;
use Console\App;

$App = new App(new Input(fopen('php://memory', 'r+')), new Output('php://memory'));
$App->Screens->load(__DIR__ . '/../../screens');
$App->Screens->switch('Dashboard');
$App->render();

$frame = (string) stream_get_contents($App->Output->stream, null, 0);
```

## Notas de comportamento

- **Execuções headless**: a interatividade vem do `BOOTGLY_TTY` — verdadeiro quando o STDIN é um terminal; `BOOTGLY_TTY=0` força uma execução headless (veja [Plataforma Console](/manual/Console)). Em headless, o `boot()` só instala os bindings padrão e o `run()` renderiza um único frame e retorna — determinístico, o smoke test de scripts, CI e agentes. Redirecionar só a saída (`| head`) continua tomando o terminal.
- **Uma tecla por frame**, despachada nesta ordem: Palette ativa → overlay de ajuda (qualquer tecla o dispensa, e é consumida) → keymaps da Screen atual → keymaps globais. Uma tecla que nenhum binding pega é descartada.
- **Saída**: o `run()` restaura o terminal quando o loop dele termina — depois de `quit()` ou quando a pilha de screens esvazia. Com `pcntl`, `Ctrl+C` e `SIGTERM` saem pela restauração de shutdown armada pelo `boot()`.
- **Resizes** (com `pcntl`): o `boot()` acompanha o `SIGWINCH` em `Terminal::$columns`/`$lines`/`$width`/`$height`, e o próximo frame se ajusta ao novo tamanho.
- Panes (splits horizontais/verticais) não fazem parte do MVP — um painel de conteúdo + overlays.

---

## Referência

### Console\App

```php
public function __construct (null|Input $Input = null, null|Output $Output = null)
```

Constrói o shell e seus widgets — os públicos `$Keymaps` (os bindings globais), `$Palette`, `$Screens`, `$Statusbar` e `$Toasts`. Input/Output vêm do Terminal da CLI por padrão; injete streams em memória para testes.

```php
public function boot (): self
```

Instala os bindings padrão (`Ctrl+P`, `?`, `q`) e — em um terminal interativo — entra na tela alternativa, esconde o cursor, coloca o input em modo raw non-blocking e acompanha os resizes. Ele não registra restauração própria: o `Screen->open()` registra a restauração do buffer de tela, e o `Input->configure()` em modo raw arma a restauração do modo do terminal e do cursor, mais — com `pcntl` — as saídas por `SIGINT`/`SIGTERM` (quando o input é um terminal).

```php
public function run (null|string $screen = null): void
```

Muda para a screen inicial (quando informada) e roda o loop principal até `quit()` ou a pilha de screens esvaziar, e então restaura o terminal. Em execução não interativa, renderiza um frame e retorna.

```php
public function quit (): void
```

Para o loop principal — ele termina depois do frame atual.

```php
public function render (): void
```

Escreve um frame completo no `$Output`: o painel de conteúdo (o overlay de ajuda, a Palette ativa ou a view da Screen atual), as linhas de toast (só em execuções interativas) e a status bar.

```php
public int $FPS = 30;
```

Limitador de renderização: o loop dorme `1 / $FPS` segundos depois de cada frame — o que também limita quantas teclas ele lê por segundo.

```php
public private(set) bool $running = false;
```

Se o loop principal está rodando — o `run()` o liga, o `quit()` o desliga.

```php
public private(set) bool $help = false;
```

Se o overlay de ajuda está aparecendo. `?` o abre; enquanto ele aparece, a próxima tecla só o dispensa.

```php
public Input $Input;
```

O input de terminal que o loop lê — o do construtor, ou o do Terminal da CLI.

```php
public Output $Output;
```

A saída onde cada frame é escrito — a do construtor, ou a do Terminal da CLI.

```php
public Screen $Screen;
```

A `Bootgly\CLI\Terminal\Screen` do core sobre o `$Output`: o buffer da tela alternativa e o acompanhamento de resize. Não confundir com as views `Console\App\Screens\Screen`.

### Console\App\Screens

```php
public function load (string $path): self
```

Carrega um manifesto de screens (delega ao Router).

```php
public function switch (string $screen, array $state = []): Screen
```

Ativa uma `Screen` nova para o nome, substituindo a atual — lança `InvalidArgumentException` quando o nome não resolve.

```php
public function push (string $screen, array $state = []): Screen
```

Empilha uma `Screen` nova para o nome sobre a atual (estilo modal) — lança `InvalidArgumentException` quando o nome não resolve.

```php
public function pop (): null|Screen
```

Remove a screen do topo e a retorna (`null` quando a pilha já está vazia); a screen de baixo volta a ser a atual do jeito que foi deixada.

```php
public Router $Router;
```

O router que resolve os nomes de screen — o `load()` delega a ele, e `$App->Screens->Router->route(...)` registra uma view inline.

```php
public private(set) array $Stack = [];
```

A pilha de navegação (`array<int,Screen>`); a última entrada é a screen atual.

```php
public null|Screen $Current { get; }
```

A screen do topo da pilha — renderizada e recebendo as teclas — ou `null` quando a pilha está vazia.

### Console\App\Screens\Screen

```php
public function __construct (string $name, Closure $View, array $state = [])
```

Uma screen navegável: o nome, a view — `function (App $App, Screen $Screen): string` — e o estado de navegação. O `switch()` e o `push()` a criam, com `$Keymaps` vazios.

```php
public string $name;
```

O nome da screen (a rota dela) — também o título do grupo dela no overlay de ajuda.

```php
public Keymaps $Keymaps;
```

Os bindings próprios da screen, verificados antes dos globais.

```php
public Closure $View;
```

A view — `($Screen->View)($App, $Screen)` retorna o conteúdo do frame.

```php
public array $state;
```

Estado de navegação (`array<string,mixed>`) passado pelo `switch()`/`push()`; a view e os handlers da screen podem alterá-lo.

### Console\App\Router

```php
public function load (string $path): self
```

Carrega `<path>/screens.index.php` (um array de nomes de screens); cada nome mapeia para `<path>/<Nome>.php`, exigido de forma lazy no primeiro resolve. Lança `InvalidArgumentException` quando o manifesto não existe, não retorna um array não vazio ou lista uma entrada que não é string — os arquivos das screens só são verificados quando resolvidos.

```php
public function route (string $screen, Closure $view): self
```

Registra uma view de screen inline — ela tem precedência sobre uma entrada do manifesto com o mesmo nome.

```php
public function check (string $screen): bool
```

Verifica se um nome de screen é roteável.

```php
public function resolve (string $screen): Closure
```

Resolve um nome de screen para sua Closure de view, exigindo o arquivo na primeira chamada e guardando-o em cache — lança `InvalidArgumentException` para um nome desconhecido, um arquivo ausente ou um arquivo que não retorna uma Closure.

### Console\App\Keymaps

```php
public function bind (string|array|Keystrokes $keys, string $label, Closure $handler): self
```

Registra um binding: uma tecla, um case de `Keystrokes` ou um array deles (um chord). Registrar as mesmas teclas de novo substitui o binding anterior. As teclas aparecem como foram registradas — um case de `Keystrokes` pelo nome (`Ctrl+P`, `Pagedown`), uma string como está, um chord unido por espaços — ao lado do `$label` no overlay de ajuda e na Palette.

```php
public function handle (string $key, null|float $at = null): bool
```

Consome uma tecla crua: um match exato executa o handler; um prefixo de chord fica em buffer até a próxima tecla ou o timeout do chord (`$timeout`), e uma tecla que quebra um chord pendente é tentada de novo como uma sequência nova. Retorna se a tecla foi consumida. `$at` injeta o relógio (em segundos) para testes.

```php
public function reset (): void
```

Reseta o buffer de chord pendente.

```php
public function list (): array
```

Lista os bindings (`keys` como exibidas, `label`, `handler`) — alimenta o overlay de ajuda e a Palette.

```php
public int $timeout = 800;
```

Janela do chord em milissegundos: um chord pendente expira quando a próxima tecla chega depois disso.

### Statusbar e Toasts

A status row e a stack de toasts são os componentes do CORE, compostos pelo App com pin `RETURN_OUTPUT` — veja as referências do [Atom Statusbar](/manual/CLI/UI/Atoms/Statusbar) e dos [Toasts](/manual/CLI/UX/Components/Toasts). O App mescla as caixas de toast via `Toasts::overlay()` (linhas absolutas 1-based) e confia no streaming plain classificado do `add()` em saída não-interativa.

### Console\App\Palette

```php
public function __construct (Keymaps &$Keymaps)
```

Constrói a paleta sobre um registro de Keymaps, passado por referência — o App passa os `$Keymaps` globais dele, então bindings de screen nunca aparecem nela.

```php
public function toggle (): void
```

Abre/fecha a paleta (abrir reseta a busca e a seleção).

```php
public function control (string $key): bool
```

Trata uma tecla enquanto ativa: `Esc` fecha, `Enter` fecha e executa o binding selecionado, `↑`/`↓` selecionam, qualquer outra tecla edita a busca. Sempre consome a tecla.

```php
public function filter (): array
```

Filtra os bindings pela busca atual — uma substring do rótulo, sem diferenciar maiúsculas de minúsculas; uma busca vazia lista todos.

```php
public function render (int $mode = self::RETURN_OUTPUT): null|string
```

Renderiza o conteúdo do frame da paleta — a linha de busca, até `$limit` entradas e uma dica de teclas. Sempre retorna a string: o App compõe o frame.

```php
public int $limit = 8;
```

Quantas entradas aparecem de uma vez; a lista rola junto com a seleção.

```php
public Line $Line;
```

O editor da busca — o `Bootgly\CLI\Terminal\Input\Line` do core (`←`/`→`, `Home`/`End`, `Backspace`/`Delete`, `Ctrl+U`/`Ctrl+K`/`Ctrl+W`).

```php
public private(set) bool $active = false;
```

Se a paleta está aberta — enquanto está, ela pega todas as teclas.

```php
public private(set) int $cursor = 0;
```

A entrada selecionada, na lista filtrada; uma busca alterada a leva de volta para a primeira entrada.

```php
public string $query { get; }
```

A busca atual — o valor do `$Line`.

### Console\App\Tail

```php
public function __construct (Input $Input, Output $Output, int $max = 5000)
```

Herdado do pager Logs do core: um input e o `Output` onde os frames dele são escritos (um em memória, dentro de um App); `$max` limita o ring buffer, em registros.

```php
public function follow (null|Closure $source): self
```

Vincula (ou desvincula com `null`) a fonte pull — `function (): string|false` retornando o próximo chunk de registros JSON delimitados por newline.

```php
public function pull (): void
```

Drena a fonte vinculada para o buffer de logs — chama-a até ela retornar `false` ou `''` (chame uma vez por frame).

```php
public function feed (string $chunk): void
```

Acrescenta bytes crus (registros JSON delimitados por newline) diretamente — o que o `pull()` faz com cada chunk; uma linha final incompleta espera a próxima chamada.

```php
public function control (string $key): bool
```

Trata uma tecla do pager (`l`, `1`–`9`, `/`, `Space`, `↑`/`↓`, `PgUp`/`PgDn`, `Home`/`End`, `Enter`, `Esc`). Retorna `false` para as teclas de saída dele — `q`, e `Esc` quando ao vivo.

```php
public function render (): void
```

Escreve um frame completo no `$Output`, a partir da linha `$row`: o cabeçalho, os registros e o rodapé de teclas — ou a visão de detalhe do registro selecionado.

```php
public int $row = 1;
```

A linha âncora do frame (1-based). Dentro de um App, mantenha-a em 1.

```php
public int $rows = 0;
```

A altura do frame em linhas — `0` usa a altura do terminal; o painel de registros tem duas linhas a menos (cabeçalho e rodapé).

Como o pager do core, ele expõe os `$Records` em buffer, os filtros — `$level`, `$channels`, `$search` — e o estado de visão — `$paused`, `$searching`, `$cursor` e `$Detail`; veja a referência do [Logs](/manual/CLI/UI/Components/Logs).
