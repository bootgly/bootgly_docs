# Componente Prompt

O componente `Prompt` fixa uma linha de entrada no rodapé do terminal enquanto o conteúdo rola acima — como Claude Code, Codex ou OpenCode. Por padrão a área de conteúdo é uma banda [Scrollarea](/manual/CLI/UI/Components/Scrollarea/overview) bufferizada: a roda do mouse e `PgUp`/`PgDn` a rolam, a scrollbar da borda direita aceita hover, clique e arrasto, e **`Ctrl+T` alterna o modo seleção** — libera o mouse para a seleção/cópia de texto nativa funcionar, e retoma no próximo toggle. Alternativamente, `buffered = false` troca para o fluxo nativo: o conteúdo entra no scrollback do terminal e tudo que envolve mouse permanece nativo, sem scrollbar interna. `prompting()` entrega cada linha submetida, com histórico `↑`/`↓` e entrada multilinha com `Shift+Enter` (o frame cresce uma linha por quebra). Qualquer símbolo (`/`, `@`, `!`, …) pode abrir um menu de contexto sobre o input — completions com descrições, hints de argumentos, estilização do frame por trigger e modos absorvidos — e `pick()` abre um bottom sheet sobre o rodapé inteiro, no estilo Claude Code. O frame também se re-ancora em resizes do terminal. Em entrada não interativa (pipes, CI) degrada para um loop simples de linhas do stdin — o código consumidor permanece idêntico.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UX/Components/Prompt/showcase).

## Instância

Para usar o componente, é necessário criar uma instância passando como parâmetros as instâncias dos componentes `Input` e `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Prompt;

$Terminal = CLI->Terminal;

$Prompt = new Prompt($Terminal->Input, $Terminal->Output);
$Prompt->prompt = '>_ ';
```

## Prompt em loop

Conduza `prompting()` com um `foreach` — cada iteração é uma linha submetida. Use `feed()` para toda saída do app, para que entre na banda de conteúdo acima da entrada fixa (chame `start()` antes ao alimentar antes do loop — a banda é dona da área de conteúdo):

```php
$Prompt->start();
$Prompt->feed('Bem-vindo — digite linhas; `exit` sai.');

foreach ($Prompt->prompting() as $line) {
   if (trim($line) === 'exit') {
      break;
   }

   $Prompt->feed("echo: {$line}");
}

$Prompt->finish();
```

`Ctrl+D` ou EOF encerram o loop imediatamente. `Ctrl+C` pede confirmação: o primeiro toque mostra um aviso na borda inferior — pressione `Ctrl+C` de novo em até 2 segundos para encerrar; caso contrário o aviso expira (qualquer outra tecla também o descarta) e a edição continua. O texto do aviso é a config `interruption`. Sempre deixe `finish()` rodar (também roda no destruct) — ele reseta a região de scroll; uma região vazada quebra o terminal.

## Bordas e textos fixos

A linha de entrada é emoldurada por bordas acima e abaixo, com quatro slots de texto fixo — esquerda e direita, acima da borda superior e abaixo da borda inferior. Os textos aceitam markup de Template e podem ser atualizados a qualquer momento (o próximo repaint os reflete):

```php
$Prompt->top = ['left' => '@#Cyan:Bootgly REPL@;', 'right' => '@#Black:v0.20@;'];
$Prompt->bottom = ['left' => '@#Black:? for help@;', 'right' => '@#Black:0 lines@;'];
$Prompt->border = '─';
```

```text
[conteúdo rola aqui...]
Bootgly REPL                                v0.20
─────────────────────────────────────────────────
>_ digite aqui█
─────────────────────────────────────────────────
? for help                                0 lines
```

Slots `top`/`bottom` vazios pulam sua linha de texto — o frame encolhe e a região de conteúdo cresce.

## Rolando o conteúdo

**Banda bufferizada (padrão).** A área de conteúdo é uma banda [Scrollarea](/manual/CLI/UI/Components/Scrollarea/overview) (1000 linhas visuais por padrão; linhas longas quebram): `PgUp`/`PgDn` paginam, a **roda do mouse** rola três linhas por clique e a scrollbar da borda direita é interativa — o cursor destaca no hover e aceita clique e arrasto (clique no trilho salta a visão). Enquanto rolado para cima, novos feeds mantêm a posição; submeter uma linha (ou alcançar a última) gruda a visão de volta no rodapé. O frame de entrada nunca se move.

**Modo seleção (`Ctrl+T`).** O mouse reporting é global por design do terminal — enquanto ligado, a seleção de texto nativa pausa. `Ctrl+T` alterna o modo seleção: o mouse é liberado (um aviso aparece na borda inferior) e selecionar/copiar funciona nativamente — mova, clique e arraste à vontade; digitar continua funcionando e `PgUp`/`PgDn` seguem rolando a banda. `Ctrl+T` de novo retoma o mouse (roda + scrollbar). `Shift` também bypassa o reporting a qualquer momento; use `$Prompt->mouse = false;` para manter o mouse totalmente nativo na sessão inteira.

**Fluxo nativo (`$Prompt->buffered = false;`).** O conteúdo alimentado entra no fluxo do próprio terminal enquanto o frame permanece fixo no rodapé: cada feed limpa o frame (as linhas dele nunca poluem o scrollback), escreve o conteúdo acima e rola a tela pela última linha — o único caminho para o scrollback real — e então repinta o frame no rodapé. Tudo que envolve mouse permanece nativo (sem mouse reporting, sem scrollbar interna) — estilo Claude Code.

## Histórico e multilinha

**Quebrando a linha (`Shift+Enter`).** `Shift+Enter` quebra a linha no cursor e é a única quebra de linha — o Enter sempre submete. Cada quebra faz o frame de entrada crescer uma linha (a banda de conteúdo acima cede essa linha): as linhas quebradas são linhas reais, empilhadas sob o marcador do prompt, com as linhas de continuação indentadas para alinhar sob ele. Apenas a linha ativa carrega a célula do cursor. O Enter então submete todas as linhas de uma vez, unidas por `\n`:

```text
[conteúdo rola aqui...]
─────────────────────────────────────────────────
>_ SELECT id, name
   FROM users
   WHERE active = 1█
─────────────────────────────────────────────────
```

**Editando entre linhas.** O buffer inteiro permanece editável: `Backspace` no início de uma linha a funde na anterior (o cursor para na emenda), `Delete` no fim de uma linha puxa a próxima para cima, `←`/`→` atravessam os limites das linhas e `Home`/`End`/`Ctrl+U`/`Ctrl+K`/`Ctrl+W` agem na linha atual.

**Histórico (`↑`/`↓`).** `↑`/`↓` percorrem primeiro as linhas da entrada e só alcançam o histórico de linhas submetidas nas extremidades — `↑` na primeira linha, `↓` na última. O rascunho atual é preservado e volta com `↓`, e recuperar uma entrada multilinha restaura as linhas dela em vez de colá-las em uma única linha.

**Suporte do terminal.** `Shift+Enter` não tem codificação legada: um terminal comum envia `CR` tanto para o Enter quanto para o `Shift+Enter`, então o modificador nunca chega ao programa. Reportá-lo exige o protocolo de teclado estendido, que o `start()` negocia sozinho (`$Prompt->Input->extended = true` — o push kitty `CSI u` mais a requisição xterm `modifyOtherKeys`), então nada precisa ser configurado. Terminais que o implementam incluem kitty, ghostty, foot e WezTerm (protocolo kitty) e xterm (`modifyOtherKeys`); os demais ignoram a negociação e nunca veem a tecla — neles o `Shift+Enter` chega como um Enter comum e submete, então a entrada permanece de linha única.

## Menus de trigger

Qualquer símbolo vira um trigger de menu de contexto. Registre-o em `triggers`: a chave é o símbolo, o valor é um conjunto estático de opções ou uma `Closure` que recebe a query digitada (o token sem o símbolo) e retorna opções. Opções estáticas vêm em três formas — um comando puro, `'value' => 'label'` (insere a chave, mostra o label) ou o estruturado `'command' => ['skeleton' => …, 'description' => …]`:

```php
$Prompt->triggers = [
   '/' => [
      '/help' => ['description' => 'List the available commands'],
      '/time' => ['skeleton' => '[timezone]', 'description' => 'Tell the current time'],
      '/echo' => ['skeleton' => '<text>', 'description' => 'Echo the text back'],
      '/exit' => ['description' => 'Quit the REPL'],
   ],
   '@' => static function (string $query): array {
      $files = ['@README.md', '@composer.json', '@bootgly.php'];

      return array_values(array_filter(
         $files,
         static fn (string $file): bool => str_contains($file, $query)
      ));
   }
];
```

Quando o token sob o cursor começa com um símbolo registrado, um painel de largura total abre rente ao frame do input — um [Listbox](/manual/CLI/UI/Base/Listbox/overview) dentro de uma caixa [Flyout](/manual/CLI/UI/Base/Flyout/overview) — filtrando as opções estáticas por prefixo (uma Closure filtra por conta própria) e acendendo o token digitado dentro de cada match. Uma regra cobre os dois mundos: `/comando` funciona no início do input e `@menção` funciona no meio da frase.

```text
┌──────────────────────────────────────────────────┐
│ ❯ /help          List the available commands     │
│   /history       Count the submitted lines       │
└──────────────────────────────────────────────────┘
──────────────────────────────────────────────────
❯ /h█
──────────────────────────────────────────────────
```

Com o menu aberto, `↑`/`↓` miram (circularmente — o topo dá a volta para o fundo), `Tab` completa o token para a opção mirada, `Esc` o fecha (fica fechado até o token mudar) e `Enter` completa a mira e a submete de uma vez — `Esc` antes para submeter o texto exatamente como digitado.

**Ponteiro.** Com o mouse ligado (modo band), o menu é totalmente navegável pelo ponteiro: mover sobre uma opção a mira, um click esquerdo a seleciona (como o `Tab` — o hint de argumentos sobe no comando resolvido), a wheel navega a lista enquanto o ponteiro está sobre o painel (e continua rolando o band de conteúdo fora dele), e a scrollbar da borda direita do menu aceita hover, click e drag — um press no trilho salta a janela, arrastar o thumb a desliza.

**Partes.** `listing` escolhe o que acompanha cada comando enquanto o menu lista opções, e `resolution` o que aparece quando resta uma única opção — qualquer combinação de `'skeleton'` e `'description'`. Padrões: descrições ao listar; skeleton + descrição ao resolver.

**Hints de argumentos.** Depois que o `Tab` resolve um comando, as partes de `resolution` continuam à vista enquanto os argumentos são digitados — `/time █` mantém `/time [timezone]` na tela. O hint cede a vez a qualquer menu que o token do cursor abra e fecha no submit.

## Estilos, modos e quebras por trigger

**Estilização (`styles`).** Um trigger ativo pode recolorir o frame do input e trocar o marcador — a pista visual de que outro tipo de linha está sendo composto:

```php
$Prompt->styles = [
   '/' => ['border' => '@#Cyan:', 'prompt' => '❯ '],
   '!' => ['border' => '@#Red:', 'prompt' => '! ']
];
```

**Modos (`modes`).** Um símbolo listado em `modes` é *absorvido* quando digitado num input vazio: ele vive no marcador em vez do buffer — como um modo `!` de bash raw. `Backspace` no input vazio o libera (como se o símbolo inicial invisível fosse apagado) e o Enter o reincorpora à linha submetida, então o consumidor ainda recebe `!ls`. Símbolos fora de `modes` ficam literais no texto — uma menção `@` continua compondo um prompt maior:

```php
$Prompt->modes = ['!'];
```

**Quebra de linha (`breaks`).** Um trigger pode travar o input em linha única — `false` suprime o `Shift+Enter` enquanto o símbolo está ativo. Slash commands são de uma linha; um modo bash mantém as quebras (lá um `\` no fim continua a linha):

```php
$Prompt->breaks = ['/' => false];
```

## Slots de atalhos

`shortcuts` pinta slots de dica tecla → ação abaixo do input, tomando o lugar do `bottom['left']` — a tecla destacada pelo `tint`, a ação esmaecida:

```php
$Prompt->shortcuts = [
   'Enter' => 'send',
   'Shift+Enter' => 'break',
   'Tab' => 'complete',
   'Esc' => 'close'
];
```

```text
──────────────────────────────────────────────────
Enter:send  Shift+Enter:break  Tab:complete  Esc:close
```

## Bottom sheet

`pick()` abre um bottom sheet: o [Flyout](/manual/CLI/UI/Base/Flyout/overview) ancorado ao rodapé do terminal, **substituindo o frame do input inteiro** (input, bordas e atalhos ficam cobertos) enquanto um Listbox navega as opções dentro dele — com o hint esmaecido na última linha da tela, no estilo Claude Code. As opções usam a forma dos triggers, então os comandos de um trigger navegam diretamente. Chame-o entre os yields do `prompting()` — num handler de `/help`, tipicamente:

```php
foreach ($Prompt->prompting() as $line) {
   if (trim($line) === '/help') {
      $picked = $Prompt->pick(
         $Prompt->triggers['/'],
         title: '@#Cyan:Commands@;',
         hint: '↑/↓ aim · Enter picks into the input · Esc cancels'
      );

      if ($picked !== null) {
         $Prompt->Lines->load($picked); // pré-preenche o input com a escolha
      }

      continue;
   }
}
```

```text
┌ Commands ────────────────────────────────────────┐
│ ❯ /help          List the available commands     │
│   /time [timezone]  Tell the current time        │
│   /exit          Quit the REPL                   │
└──────────────────────────────────────────────────┘
 ↑/↓ aim · Enter picks into the input · Esc cancels
```

`↑`/`↓` miram, `Enter` retorna o valor da opção mirada e `Esc` (ou `Ctrl+C`/`Ctrl+D`) cancela com `null`. O frame do input se repinta no lugar quando o sheet fecha. Pré-preencher via `Lines->load()` é o ponto doce: a maquinaria de triggers reabre sozinha o hint de argumentos no comando carregado. Em entrada não interativa o sheet nunca abre — `pick()` retorna `null`.

## Resizes do terminal

O prompt observa `SIGWINCH`: redimensionar o terminal re-mede a tela, a limpa e re-ancora tudo — a banda de conteúdo se reajusta, o frame repinta no novo fundo e qualquer menu ou sheet aberto se recompõe na nova largura e altura. Sem isso, emuladores de terminal refluem as linhas pintadas por conta própria e rasgam qualquer layout fixado no rodapé. O watcher arma no `start()` e restaura o handler padrão no `finish()`; a entrega de sinais usa `pcntl` (async signals), então ambientes sem ele simplesmente mantêm o tamanho medido no boot.

## Entrada não interativa

Em pipes e CI não há região nem histórico: `prompting()` entrega linhas do stdin até EOF e `feed()` escreve plano — determinístico, sem ruído de escapes. Menus de trigger nunca interferem e `pick()` retorna `null`.

## Referência

### Propriedades

```php
public string $prompt
```

Config. O prefixo da linha de entrada — a largura dele também é a indentação das linhas de continuação. Padrão: `'> '`.

```php
public int $history
```

Config. Máximo de entradas do histórico (ring limitado). Padrão: `100`.

```php
public string $border
```

Config. O caractere da linha de borda renderizada acima e abaixo da linha de entrada. Padrão: `'─'`.

```php
public array $top
```

Config. Textos fixos acima da borda superior — `['left' => ..., 'right' => ...]` (markup de Template suportado; ambos vazios pulam a linha). Padrão: ambos vazios.

```php
public array $bottom
```

Config. Textos fixos abaixo da borda inferior — mesmo formato do `top`. Padrão: ambos vazios.

```php
public string $interruption
```

Config. O aviso mostrado na borda inferior após o primeiro `Ctrl+C` — um segundo toque em até 2 segundos encerra o loop; caso contrário o aviso expira. Padrão: `'Press Ctrl+C again to exit'`.

```php
public bool $buffered
```

Config. Banda de conteúdo bufferizada (scrollbar interna + mouse reporting; `Ctrl+T` alterna o modo seleção). `false` troca para o fluxo nativo: o conteúdo entra no scrollback do terminal — rolagem com a roda, seleção de texto e cópia permanecem totalmente nativas. Padrão: `true`.

```php
public bool $mouse
```

Config (modo banda). Suporte a mouse — a roda rola a banda; a scrollbar aceita hover, clique e arrasto. A seleção de texto nativa pausa enquanto o reporting está ligado (`Ctrl+T` alterna; `Shift` bypassa). Padrão: `true`.

```php
public string $selection
```

Config (modo banda). O aviso mostrado na borda inferior enquanto o modo seleção está ativo. Padrão: `'Selection mode · Ctrl+T resumes the mouse'`.

```php
public array $triggers
```

Config. Triggers de menu de contexto — a chave é o símbolo (`'/'`, `'@'`, `'#'`, …), o valor é um conjunto estático de opções (comandos puros, pares `'value' => 'label'` ou `'command' => ['skeleton' => …, 'description' => …]`) ou uma `Closure (string $query): array` que recebe a query digitada sem o símbolo. Comandos são tokens completos incluindo o símbolo. Padrão: `[]` (menus desligados).

```php
public array $listing
```

Config. Partes mostradas ao lado de cada comando enquanto o menu lista opções — qualquer combinação de `'skeleton'` e `'description'`. Padrão: `['description']`.

```php
public array $resolution
```

Config. Partes mostradas quando resta uma única opção (comando resolvido) e enquanto os argumentos são digitados. Padrão: `['skeleton', 'description']`.

```php
public array $styles
```

Config. Estilização do frame por trigger — `símbolo => ['border' => markup, 'prompt' => marcador]`: enquanto o menu ou o hint de um símbolo está de pé, `border` recolore as linhas do frame e pinta o marcador, e `prompt` substitui o texto do marcador. Padrão: `[]`.

```php
public array $modes
```

Config. Símbolos de trigger absorvidos como prefixos de modo — digitado num input vazio, o símbolo vive no marcador em vez do buffer; `Backspace` no input vazio o libera e o Enter o reincorpora à linha submetida. Padrão: `[]` (símbolos ficam literais).

```php
public array $breaks
```

Config. Quebra de linha por trigger — `símbolo => bool`; `false` trava o input em linha única enquanto o símbolo está ativo (`Shift+Enter` é ignorado). Símbolos ausentes mantêm as quebras. Padrão: `[]`.

```php
public array $shortcuts
```

Config. Slots de dica de atalho abaixo do input — `tecla => ação`; tomam o lugar do `bottom['left']` quando definidos. Padrão: `[]`.

```php
public string $tint
```

Config. A pintura da tecla de atalho (token de markup) — a ação fica esmaecida. Padrão: `'@#White:'`.

```php
public private(set) Lines $Lines
```

Data. O buffer de entrada multilinha ([Lines](/manual/CLI/Terminal/Input/Lines/overview)) — uma [Line](/manual/CLI/Terminal/Input/Line/overview) por linha, mais o índice da linha ativa e um cursor virtual que percorre o buffer inteiro.

```php
public private(set) Scrollarea $Scrollarea
```

Data. A banda de conteúdo bufferizada acima do frame — as configs `capacity` e `scrollbar` dela são alcançáveis aqui (`clear()` a esvazia — o gancho que um comando `/clear` quer).

```php
public private(set) Flyout $Flyout
```

Data. O [Flyout](/manual/CLI/UI/Base/Flyout/overview) que encaixota os menus de trigger e o bottom sheet — com borda, largura total e fundo esmaecido por padrão; re-estilize-o aqui.

```php
public private(set) Listbox $Listbox
```

Data. O [Listbox](/manual/CLI/UI/Base/Listbox/overview) dentro dos menus de trigger — viewport 5, tint ciano, scrollbar e navegação circular por padrão; o `blink`, o `viewport` e as pinturas dele são alcançáveis aqui. O bottom sheet navega um clone dele, então a config visual se propaga.

```php
public private(set) array $entries
```

Data (somente leitura). As entradas do histórico, da mais antiga à mais nova.

```php
public private(set) bool $finished
```

Metadata (somente leitura). `true` após `finish()`.

### start()

```php
public function start (): void
```

Entra em modo raw — negociando o protocolo de teclado estendido, que é o que torna o `Shift+Enter` reportável — e desenha o frame de entrada (o modo banda também clipa a região de scroll do conteúdo e arma o mouse reporting). Invocado automaticamente por `prompting()`.

### feed()

```php
public function feed (string $content): void
```

Alimenta conteúdo do app acima do frame fixo no rodapé (escrita plana em saída não interativa). Fluxo nativo: o conteúdo rola para o scrollback do terminal enquanto o frame permanece fixo. Modo banda: o conteúdo bufferiza na Scrollarea — enquanto rolado para cima, a posição se mantém. Markup de Template é suportado. Sequências de escape alheias são sanitizadas: cores (SGR) passam, controles de cursor e apagamento caem — um output de `clear` alimentado não consegue varrer a banda por trás do buffer.

### prompting()

```php
public function prompting (): Generator
```

Entrega cada linha submetida até um duplo `Ctrl+C`, `Ctrl+D` ou EOF — uma entrada multilinha é entregue como uma única string, com as linhas unidas por `\n`. Entrada não interativa entrega linhas do stdin até EOF.

### pick()

```php
public function pick (array $options, null|string $title = null, null|string $hint = 'Enter selects · Esc cancels'): null|string
```

Abre o bottom sheet — o Flyout de largura total ancorado ao rodapé do terminal, substituindo o frame do input inteiro enquanto um Listbox navega as opções (`↑`/`↓` miram, Enter seleciona, Esc cancela — o `hint` esmaecido vai na última linha da tela; `null` o esconde). As opções usam a forma dos triggers, então `pick($Prompt->triggers['/'])` navega os comandos do próprio trigger. Chame-o entre os yields do `prompting()`; o frame do input se repinta ao fechar. Retorna o valor selecionado — `null` em cancelamento ou entrada não interativa.

### finish()

```php
public function finish (): void
```

Reseta a região de scroll (tela cheia), restaura as configurações de entrada e mostra o cursor. Idempotente — também invocado pelo destrutor.
