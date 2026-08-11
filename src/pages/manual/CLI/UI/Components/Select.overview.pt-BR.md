# Componente Select

O componente `Select` é a lista de opções "escolha e confirme": **↑/↓** miram, **Espaço** alterna, **Enter** confirma. Ele seleciona **uma** opção por padrão — marcas radio `●`/`○` — ou **várias** com `multiple` ligado — marcas checkbox `◼`/`◻`. Listas longas se janelam em torno da mira, digitar filtra as opções incrementalmente, e linhas travadas ficam visíveis mas fora de alcance.

As linhas são janeladas e pintadas pelo motor [Listbox](/manual/CLI/UI/Base/Listbox/overview) — o viewport, os marcadores `↑/↓ N more`, a scrollbar da borda direita e o acento de busca vêm juntos. O estado é por instância: dois Selects nunca compartilham uma seleção.

## Instância

Para usar o componente, crie uma instância passando as instâncias de `Input` e `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Select;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Select = new Select($Input, $Output);
```

## Escolha uma opção

As opções são labels de texto simples. `selecting()` roda a interação até o Enter; os índices selecionados ficam em `$Select->selected`:

```php
$Select->title = "@#Cyan:Escolha um driver de banco@;\n@#Black:(↑/↓ para mover, Enter para confirmar)@;";
$Select->options = ['MySQL', 'PostgreSQL', 'SQLite'];

foreach ($Select->selecting() as $ignored);

$driver = $Select->options[$Select->selected[0] ?? 0];
```

Enter com a **seleção vazia confirma a opção mirada** — sem precisar de Espaço. Com uma seleção explícita (Espaço), o Enter a mantém e ignora a mira. No modo single, Espaço em outra opção **troca** a seleção.

## Escolha várias opções

Ligue `multiple` — Espaço acumula, Espaço de novo desmarca, e as marcas viram checkboxes:

```php
$Select->multiple = true;
$Select->options = ['Cache', 'Logs', 'Metrics', 'Tracing'];

foreach ($Select->selecting() as $ignored);

foreach ($Select->selected as $index) {
   // cada opção alternada, na ordem de seleção
}
```

## Mire um padrão

`aim()` define a mira inicial (o marcador `❯`) — combine com o Enter-confirma para tornar uma opção o padrão:

```php
$Select->options = ['Console', 'Web'];
$Select->aim(1); // a mira começa em `Web`
```

## Trave linhas só-exibição

`locked` guarda índices de opções que renderizam sempre marcadas mas nunca seguram a mira, nunca entram na seleção e nunca saem da view filtrada — linhas fixadas "já ativas":

```php
$Select->options = ['Core (sempre ativo)', 'Cache', 'Logs'];
$Select->locked = [0];
```

## Viewport (listas longas)

Defina `viewport` para janelar listas longas em N opções visíveis. A janela desliza com a mira e indicadores esmaecidos `↑/↓ N more` contam as opções ocultas:

```php
$Select->viewport = 5; // 5 opções visíveis por vez
```

Prefere uma barra na borda direita em vez dos marcadores? O Listbox por baixo a expõe:

```php
$Select->Listbox->scrollbar = true;
```

## Filtro type-ahead

Digitar letras filtra as opções incrementalmente: a mira pula para o primeiro match e as opções sem match ficam ocultas enquanto o filtro está ativo. Uma dica esmaecida `/filtro` renderiza sob o título. Backspace remove o último caractere; `Esc` puro limpa o filtro. Espaço sempre seleciona — nunca entra no filtro.

Um filtro sem nenhum match deixaria um bloco vazio silencioso, então o Select avisa — e diz como sair dele:

```
Escolha um país
/zzz
(no matches — Backspace erases, Esc clears)
```

## Coluna de detalhes

`details` leva uma coluna de descrição esmaecida por índice de opção, alinhada após o label mais largo — uma capacidade herdada do Listbox:

```php
$Select->options = ['MySQL', 'SQLite'];
$Select->details = ['em rede, padrão de produção', 'zero-config, baseado em arquivo'];
```

## Hospede os frames (streaming)

Hosts que posicionam os frames por conta própria — um Fieldset, um layout custom — pinam o modo de render: `selecting()` então nunca pinta e passa a fazer yield de cada frame composto como string:

```php
$Select->render = Select::RETURN_OUTPUT;

foreach ($Select->selecting() as $frame) {
   $Fieldset->content = $frame;
   $Fieldset->render();
}
```

## Entrada não-interativa

Em pipes e CI o Select renderiza uma vez e finaliza — `selected` mantém o que estava pré-definido (geralmente vazio, então quem chama cai num índice padrão). Determinístico em scripts.

## Restilize

As marcas são Config simples, e o motor Listbox fica exposto para todo o resto — marcador, cores, acento de busca, sua Scrollbar:

```php
$Select->marks = ['◉', '◯'];          // [selecionada, não selecionada]
$Select->Listbox->marker = '→ ';
$Select->Listbox->color = '@#Green:';
```

## Veja ao vivo

Os demos oficiais do Select rodam no [showcase ao vivo](/manual/CLI/UI/Components/Select/showcase) — código real do framework em PHP 8.4 WebAssembly, no seu navegador, direto desta página.

## Referência

### Propriedades

```php
public string $title = '';
```

Config. A linha de título acima da lista (`''` = nenhuma; markup suportado — um `\n` embutido renderiza um cabeçalho multi-linha).

```php
public bool $multiple = false;
```

Config. Seleção múltipla (Espaço acumula) — `false` mantém seleção única: o conjunto confirmado guarda no máximo um índice.

```php
public int $viewport = 0;
```

Config. Máximo de opções visíveis (`0` renderiza todas) — as bordas cortadas dizem `↑/↓ N more`, ou a scrollbar do Listbox as substitui.

```php
public null|array $marks = null;
```

Config. O par de glifos de marca `[selecionada, não selecionada]` — `null` deriva do modo: `●`/`○` single, `◼`/`◻` multiple.

```php
public array $locked = [];
```

Config. Índices de opções só-exibição — sempre marcadas, sempre visíveis, nunca miradas nem selecionadas.

```php
public array $options = [];
```

Data. As opções, de cima para baixo (labels de texto simples).

```php
public array $details = [];
```

Data. Coluna de detalhe esmaecida por índice de opção.

```php
public private(set) Listbox $Listbox;
```

Metadata. O motor de lista de opções janelada — a superfície de restilo (sua Scrollbar vem junto).

```php
public private(set) array $selected = [];
```

Metadata. Os índices das opções selecionadas (o resultado).

```php
public private(set) string $filter = '';
```

Metadata. O filtro type-ahead incremental.

```php
public private(set) int $aimed = 0;
```

Metadata. O índice da opção mirada.

### aim()

```php
public function aim (int $index): self
```

Mira uma opção pelo índice — opções travadas nunca seguram a mira (a mira avança para a próxima destravada). Um índice fora do intervalo mantém a mira atual.

### control()

```php
public function control (string $char): bool
```

Controla a seleção com uma tecla: setas miram, Espaço alterna, teclas imprimíveis filtram, Backspace remove do filtro, `Esc` puro o limpa. Retorna se a seleção continua — `false` no Enter (tanto `\n` quanto `\r`).

### selecting()

```php
public function selecting (): Generator
```

Roda a seleção até o Enter confirmar (ou a entrada terminar): renderiza um frame, espera uma tecla, controla o estado — fazendo yield da seleção viva após cada tecla. Com o pin de `render` em `RETURN_OUTPUT` o loop nunca pinta: faz yield de cada frame composto como string para o host posicionar. Em entrada não-interativa renderiza uma vez e finaliza.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza um frame: o título, a dica do type-ahead e as linhas do Listbox — cada opção prefixada pela sua marca de seleção; linhas travadas sempre marcadas. Um filtro sem match avisa em vez de deixar um bloco vazio silencioso.
