# Componente Dialog

O componente `Dialog` é uma caixa modal pintada **sobre** a interface em execução: o corpo renderiza através de um [Frame](/manual/CLI/UI/Components/Frame/overview) interno em coordenadas absolutas enquanto uma sessão interativa é dona de cada tecla — nada mais lê o stdin até ela fechar. Ao fechar, a tela é restaurada repintando os componentes [Boxing](/manual/CLI/UI/Components/Frame/overview) que ele cobria — ou o buffer principal inteiro, quando a sessão envolve a tela alternativa. Variantes prontas respondem os casos comuns: `confirm()`, `alert()` e `prompt()`.

Ele é diferente do componente UI [Alert](/manual/CLI/UI/Components/Alert/overview), que é inline: um `Alert` é um banner tipado escrito no fluxo normal de saída (não bloqueante, não posicionado), enquanto `Dialog::alert()` bloqueia sobre a interface até ser reconhecido e restaura o que cobria.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UX/Dialog/showcase).

## Instância

Crie uma instância passando o `Input` e o `Output` do terminal (a assinatura dos compostos UX). Por padrão a caixa se auto-centraliza contra o terminal; desabilite `centered` para posicioná-la explicitamente. O estilo passa pelo Frame interno — título, bordas, cores:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Dialog;

$Terminal = CLI->Terminal;

$Dialog = new Dialog($Terminal->Input, $Terminal->Output);
$Dialog->width = 44;
$Dialog->height = 7;
$Dialog->Frame->title = 'Deploy';
```

## Confirmando

`confirm()` faz uma pergunta modal de sim/não: `y`/`n` respondem; Enter, Esc e EOF assumem o padrão. A caixa abre, captura o teclado e fecha restaurando a tela — tudo em uma chamada:

```php
if ($Dialog->confirm('Deploy the app to production?', default: true) === true) {
   // ... deploy ...
}
```

## Alertando

`alert()` mostra uma mensagem modal reconhecida por qualquer tecla:

```php
$Dialog->alert('Deploy complete.');
```

## Perguntando

`prompt()` pede uma linha de texto modal com o editor de linha completo (setas, Home/End, Backspace/Delete, kill keys). Enter submete o valor com trim — um submit vazio (ou só espaços) mantém o padrão; Esc e EOF mantêm o padrão:

```php
$tag = $Dialog->prompt('Release tag', default: 'v1.0.0');
```

## Cobrindo componentes

Um terminal não consegue ler suas próprias células de volta, então um modal não consegue fotografar o que está embaixo dele. Em vez disso, `cover()` registra os componentes que o retângulo sobrepõe — no `close()` o retângulo é apagado com espaços e cada componente coberto se repinta (eles mantêm seus próprios buffers de conteúdo enquanto escondidos):

```php
use Bootgly\CLI\UI\Components\Frame;

$App = new Frame($Terminal->Output);
// ... geometria + conteúdo ...
$App->render();

$Dialog->cover($App);

$Dialog->confirm('Quit?');   // fechar repinta $App sobre o vazio
```

Qualquer implementador de `Boxing` funciona — `Frame`, `Tabs`, as células de um `Grid` ou outro `Dialog`. Cubra tudo o que a caixa sobrepõe; cobrir a mais só custa comparações do diff-blit.

## Hospedagem genérica

As variantes cobrem os casos comuns; para o resto, o dialog é um host de Frame. `open()` pinta e devolve o controle — escreva em `$Dialog->Frame->Output` (linhas completas terminadas em `\n`), re-renderize à vontade e chame `close()` ao terminar:

```php
$Dialog->open();

$Dialog->Frame->Output->write("Working...\n");
$Dialog->render();

// ... trabalho ...

$Dialog->close();
```

Uma variante chamada entre `open()` e `close()` reusa a caixa aberta, restaura o corpo hospedado ao final e deixa a caixa aberta — combinável com um ciclo de vida controlado pelo chamador. Nessas sessões aninhadas os modos do terminal e o cursor continuam responsabilidade do chamador (um chamador rodando seu próprio loop raw de teclas o mantém).

## Sessões standalone

Sobre saída rolada em fluxo livre não há componentes para cobrir. Defina `screen` e a sessão envolve o [buffer de tela alternativa](/manual/CLI/Terminal/overview): o próprio terminal preserva e restaura a tela principal inteira:

```php
$Dialog->screen = true;

$Dialog->confirm('Continue?');   // a tela principal restaura intocada
```

Quando `screen` está definido, os componentes cobertos não são repintados — o terminal restaura o buffer sozinho.

## Redimensionando

`resize()` casa com a assinatura do handler do `Screen::watch` — recentraliza (a menos que `centered` esteja desabilitado) e, enquanto a caixa está pintada, limpa a tela e repinta os componentes cobertos e a caixa. Um dialog fechado apenas recentraliza — a tela pertence ao seu dono:

```php
$Terminal->Screen->watch($Dialog->resize(...));
```

## Saída não interativa

Em pipes e CI nenhuma caixa é pintada: `confirm()` e `prompt()` mantêm a semântica do [Question](/manual/CLI/UI/Components/Question/overview) (uma linha do stdin; EOF e respostas vazias assumem o padrão) e `alert()` escreve a mensagem diretamente. O mesmo código roda interativamente e em scripts.

## Referência

### Propriedades

```php
public Input $Input
```

O Input do terminal usado pelas sessões interativas.

```php
public Output $Output
```

O Output do terminal onde a caixa é pintada.

```php
public int $row
```

Config. Linha superior da tela (baseada em 1). Sobrescrita enquanto `centered` está ativo. Padrão: `1`.

```php
public int $column
```

Config. Coluna esquerda da tela (baseada em 1). Sobrescrita enquanto `centered` está ativo. Padrão: `1`.

```php
public int $width
```

Config. Largura externa, em colunas. Padrão: `50`.

```php
public int $height
```

Config. Altura externa, em linhas. Padrão: `7`.

```php
public bool $centered
```

Config. Auto-centraliza contra o terminal no `open()`/`resize()`. Padrão: `true`.

```php
public string $color
```

Config. Cor das dicas de teclas (marcação Template). Padrão: `'@#Black:'`.

```php
public bool $screen
```

Config. Envolve a sessão no buffer de tela alternativa — o terminal restaura a tela principal inteira ao fechar. Padrão: `false`.

```php
public float $throttle
```

Config. Segundos por tick interativo — teclas seguradas nunca aceleram o relógio. Padrão: `0.05`.

```php
public private(set) Frame $Frame
```

Data (somente leitura). O host do corpo — escreva no Output isolado dele; estilize através do `title`, `Borders` e `color` dele.

```php
public private(set) array $Covered
```

Data (somente leitura). Os componentes cobertos, repintados no `close()` em ordem de pintura.

```php
public private(set) bool $opened
```

Metadata (somente leitura). Se a caixa está pintada agora.

```php
public private(set) null|bool $confirmed
```

Metadata (somente leitura). A última resposta do `confirm()` — `null` enquanto nenhuma.

```php
public private(set) string $answer
```

Metadata (somente leitura). A última resposta do `prompt()`.

### cover()

```php
public function cover (Boxing ...$Boxes): self
```

Registra os componentes cobertos pelo modal — cada um repinta quando o dialog fecha, em ordem de pintura.

### open()

```php
public function open (): self
```

Abre o dialog: centraliza contra o terminal (a menos que `centered` esteja desabilitado), entra na tela alternativa quando `screen` pede e pinta a caixa. Não bloqueante — o chamador mantém o controle.

### close()

```php
public function close (): self
```

Fecha o dialog restaurando o que ele cobria: sai da tela alternativa ou apaga o retângulo com espaços e repinta os componentes cobertos. Idempotente.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza a caixa — pintura pura: o diff-blit do Frame interno escreve apenas as linhas alteradas. `RETURN_OUTPUT` retorna o retângulo em vez de escrever.

### invalidate()

```php
public function invalidate (): void
```

Invalida a caixa — o próximo render repinta o retângulo completo (tela limpa externamente, sobreposta, ...).

### resize()

```php
public function resize (int $columns, int $lines): void
```

Redimensiona contra um novo tamanho de terminal: recentraliza e, enquanto a caixa está pintada, limpa a tela e repinta os componentes cobertos e a caixa (um dialog fechado apenas recentraliza). A assinatura casa com o handler de resize do `Screen::watch`.

### confirm()

```php
public function confirm (string $prompt, bool $default = false): bool
```

Faz uma confirmação modal de sim/não: `y`/`n` respondem; Enter, Esc e EOF assumem o padrão. Entrada não interativa mantém a semântica do Question.

### alert()

```php
public function alert (string $message): void
```

Mostra uma mensagem modal reconhecida por qualquer tecla (ou EOF). Saída não interativa escreve a mensagem e retorna imediatamente.

### prompt()

```php
public function prompt (string $prompt, string $default = ''): string
```

Pede uma linha de texto modal com o editor Line: Enter submete o valor com trim — um submit vazio mantém o padrão; Esc e EOF mantêm o padrão. Entrada não interativa mantém a semântica do Question.
