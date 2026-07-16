# Tree

Visão hierárquica com expandir/recolher e filhos lazy. A mesma árvore renderiza como **saída estática de relatório** (estilo Rich, segura em pipes) e comanda um **seletor interativo**: `↑`/`↓` mira, `→` expande, `←` recolhe, `Space` alterna, `Enter` seleciona (ou roda uma ação programável), `Esc` cancela.

## Renderize uma árvore

Construa nós fluentemente — `add()` retorna o novo filho, então ramos encadeiam naturalmente — e renderize:

```php
use Bootgly\CLI\UI\Components\Tree;

$Tree = new Tree($Input, $Output);

$Root = $Tree->add('bootgly');
$CLI = $Root->add('Bootgly')->add('CLI');
$CLI->add('Terminal');
$CLI->add('UI');
$Root->add('composer.json');

$Tree->render();
```

```text
▾ bootgly
├─ ▾ Bootgly
│  └─ ▾ CLI
│     ├─ · Terminal
│     └─ · UI
└─ · composer.json
```

Nós começam expandidos, então uma construção simples despeja a hierarquia inteira — chame `collapse()` em qualquer ramo para dobrá-lo (os filhos saem da saída). Labels aceitam markup de Template (`@#Cyan:src@;`) e as guias de conexão renderizam esmaecidas. Use `guides = false` para indentação simples.

## Selecione um nó interativamente

`navigate()` abre uma sessão de input raw e retorna o `Node` confirmado — ou `null` quando o usuário cancela com `Esc`:

```php
$Tree->prompt = 'Escolha um caminho';
$Tree->viewport = 12;   // janela em árvores longas com marcadores ↑/↓ N more
$Tree->blink = true;    // pisca o marcador de mira => (ajuda a localizar o cursor)

$Selected = $Tree->navigate();

if ($Selected !== null) {
   echo "Escolhido: {$Selected->value}\n";
}
```

Cada nó carrega um payload livre em `value` — coloque caminhos, ids ou objetos inteiros ali e leia-os do nó retornado. Em saída não interativa (pipes, CI) `navigate()` degrada para um único dump estático e retorna `null`.

## Rode ações no Enter

Defina uma `Closure` em `$Node->action` e o `Enter` a executa em vez de confirmar. Retorne `false` para confirmar e encerrar; qualquer outro retorno continua navegando — a ação pode mutar a árvore e as linhas re-achatam:

```php
$Branch->action = static fn (Node $Node): Node => $Node->toggle();   // Enter dobra/desdobra
```

O retorno `false` confirma mesmo quando `$Node->selectable` é `false` — a decisão explícita em runtime vence a flag estática. `selectable` sozinho controla apenas o confirm simples, sem ação.

## Carregue filhos sob demanda

Dê um `resolver` a um nó e seus filhos são construídos no **primeiro expand** — perfeito para varreduras de diretório e listagens remotas:

```php
use Bootgly\CLI\UI\Components\Tree\Node;

$Tree->add('vendor', value: 'vendor', resolver: static function (Node $Node): void {
   foreach (new \DirectoryIterator($Node->value) as $Entry) {
      if ($Entry->isDot()) {
         continue;
      }

      $Child = $Node->add($Entry->getFilename(), value: $Entry->getPathname());
      $Child->glyph = $Entry->isDir() ? '📁' : '📄';
   }
});
```

Ramos não resolvidos renderizam dobrados (`▸`) — pressionar `→` roda o resolver exatamente uma vez e desdobra no lugar. Um resolver que lança exceção desfaz a trava, então o expand continua repetível. Um resolver que não adiciona nada converte o nó em folha.

Combinado com `action` e `glyph` por nó (qualquer string — emojis incluídos), este é o kit completo para um explorador de arquivos: diretórios lazy, `Enter` abrindo arquivos, ícones por tipo de entrada.

## Notas

- **A saída estática não carrega marcador de mira** — `render()` é seguro para relatórios; a coluna `=>` aparece só dentro de `navigate()`.
- **Largura**: linhas não são cortadas na v1 — árvores muito fundas podem exceder larguras estreitas (mesma limitação do Menu). Compressão de guias e crop são follow-ups planejados.
- Os glifos `▾ ▸ ·` vêm do array Config `glyphs` — troque-os globalmente, ou por nó via `$Node->glyph`.

## Referência

### Tree

```php
public function __construct (Input $Input, Output $Output)
```

Cria o componente ligado ao `Input` do terminal (sessão interativa) e ao `Output`.

```php
public function add (string $label, mixed $value = null, null|Closure $resolver = null): Node
```

Adiciona um nó raiz e o retorna. `label` aceita markup de Template; `value` é um payload livre do consumidor; `resolver` torna o nó lazy.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza a árvore visível — apenas nós expandidos. `RETURN_OUTPUT` retorna o frame como string em vez de escrevê-lo.

```php
public function control (string $key): bool
```

Aplica uma tecla ao estado da árvore — uma máquina de estados pura (sem I/O). Retorna `false` quando a interação termina (confirm com `Enter` ou cancel com `Esc`). Miras obsoletas são clampadas de volta ao intervalo visível, então mutações externas da árvore entre chamadas são seguras.

```php
public function navigate (): null|Node
```

Abre a sessão interativa (input raw, cursor escondido, repaint relativo) e retorna o nó confirmado — `null` em `Esc`, `EOF` ou saída não interativa. O terminal sempre restaura, mesmo quando um resolver ou uma ação lança exceção.

Config: `string $prompt` (linha de cabeçalho), `bool $guides` (guias de conexão, padrão `true`), `bool $blink` (marcador de mira piscante, padrão `false`), `null|int $viewport` (máximo de linhas visíveis), `array $glyphs` (marcadores `expanded`/`collapsed`/`leaf`). Estado somente leitura: `array $Nodes`, `int $aimed`, `null|Node $selected`, `Window $Window`.

### Tree\Node

```php
public function add (string $label, mixed $value = null, null|Closure $resolver = null): Node
```

Adiciona um nó filho, ligando seu `Parent` e `depth`, e o retorna.

```php
public function expand (): self
```

Expande o nó. O primeiro expand de um nó lazy roda seu resolver uma vez; um resolver que lança exceção desfaz a trava e continua repetível.

```php
public function collapse (): self
```

Dobra o nó — seus filhos saem da árvore visível.

```php
public function toggle (): self
```

Alterna entre aberto e dobrado. Um nó lazy não resolvido conta como dobrado, então alterná-lo resolve e abre.

Config: `string $label`, `mixed $value`, `string $glyph` (override do marcador — emojis funcionam), `bool $selectable`, `null|Closure $action` (ação do Enter), `null|Closure $resolver` (filhos lazy). Estado somente leitura: `array $Nodes`, `bool $expanded`, `null|Node $Parent`, `int $depth`, `bool $resolved`, `bool $leaf`, `bool $open`.
