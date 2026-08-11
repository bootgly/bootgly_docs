# Classe Button

O componente `Button` renderiza uma pill pressionável de uma linha: um ícone/emoji, um label, ou ambos — com background opcional, uma pintura de hover que acende o background quando o ponteiro passa, e um trigger de press totalmente genérico (uma Closure) que pode acionar qualquer outro componente: abrir um Dialog, alimentar um Prompt, encerrar um loop, qualquer coisa.

É um **UI Atom** — uma primitiva sem dependência de outros componentes. Um demo ao vivo está disponível no [showcase](/manual/CLI/UI/Atoms/Button/showcase).

## Instância

Para utilizar o componente, crie uma instância passando a instância de `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Button;

$Button = new Button(CLI->Terminal->Output);
```

## Compor um botão

Um label sozinho renderiza sem estilo — um espaço de respiro de cada lado, cores do terminal. Um ícone compõe antes do label, e um ícone sozinho é de primeira classe:

```php
$Button->label = 'Docs';
$Button->render();
```

```text
 Docs 
```

```php
$Button->icon = '💾';
$Button->label = 'Save';
$Button->render();
```

```text
 💾 Save 
```

A medição é ciente de largura: emoji contam sua largura real (dupla) em colunas, então a pill nunca desalinha.

## Estilizar como pill

`style` aceita qualquer lista de códigos SGR e pinta o botão em repouso — atribuir um background transforma a linha sem estilo em uma pill:

```php
$Button->style = ['48;5;25', '97'];   // background azul, texto branco brilhante
$Button->render();
```

Um `style` vazio (o padrão) mantém o botão sem estilo — o background então só aparece no hover.

## Hover

`hover()` alterna a pintura de hover e repinta no lugar. Os códigos de hover padrão pintam um background escuro suave com texto branco brilhante — em um botão sem estilo, é isso que "cria o background" quando o ponteiro passa; em uma pill estilizada, o hover apenas troca as pinturas:

```php
$Button->hover = ['48;5;33', '97'];   // azul mais claro durante o hover

$Button->hover(true);    // ponteiro entrou — pintura de hover
$Button->hover(false);   // ponteiro saiu — pintura de repouso
```

O Button nunca arma o mouse — o host faz isso (`Terminal\Reporting\Mouse`) e roteia os reports SGR. O movimento aciona o hover através do predicado `hit()`:

```php
// dentro do handler de mouse reports do host:
$Button->hover($Button->hit($column, $line));
```

Um hover sem mudança não escreve nada, então rotear todos os reports de movimento é de graça.

## Press

`Action` é o trigger do press — uma Closure que recebe o próprio Button; seu valor de retorno volta através de `press()`:

```php
$Button->Action = function (Button $Button) {
   // abrir um Dialog, alimentar um Prompt, encerrar um loop — qualquer coisa
   return 'pressed';
};

$result = $Button->press();   // 'pressed'
```

O host mapeia um press esquerdo em um `hit()` (mouse) ou Enter/Espaço no botão focado (teclado) para `press()`:

```php
// dentro do handler de mouse reports do host, em um press esquerdo:
if ($Button->hit($column, $line) === true) {
   $Button->press();
}
```

O demo 61 (`bootgly demo 61`) monta o loop completo: movimento faz hover, click esquerdo pressiona, Tab cicla o botão em hover e Enter o pressiona.

## Posicionamento

O Button implementa o contrato `Boxing`. Sem posição (o padrão), `render()` escreve a linha em fluxo com uma quebra de linha ao final. Posicionado — `row` e `column` em coordenadas de tela 1-based — ele repinta no lugar em seu retângulo:

```php
$Button->row = 8;
$Button->column = 2;
$Button->render();   // pinta no retângulo, sem quebra de linha
```

`width` deriva do conteúdo no render e é armazenado de volta — então uma fileira de botões encadeia naturalmente:

```php
$column = 2;
foreach ($Buttons as $Button) {
   $Button->row = 8;
   $Button->column = $column;
   $Button->render();

   $column += $Button->width + 2;
}
```

Um `width` explícito preenche conteúdo mais curto e corta conteúdo mais longo com reticências.

## Saída não interativa

Em pipes e CI o render mantém a linha plana com **zero códigos de escape**, e `hover()` nunca pinta — não existe ponteiro sem um terminal interativo. `decoration` é um tri-state: `null` (padrão) segue o TTY, `false` força plano, `true` força estilizado.

## Reference

### Propriedades

```php
public null|bool $decoration = null;
```

Config. Decoração SGR — `null` segue o TTY, `false` força plano, `true` força estilizado.

```php
public string $icon = '';
```

Config. Ícone/emoji pintado antes do label — `''` significa nenhum; labels ficam sozinhos.

```php
public string $label = '';
```

Config. O label — `''` significa nenhum; botões só de ícone são de primeira classe.

```php
public array $style = [];
```

Config. Códigos SGR pintando o botão em repouso — vazio o mantém sem estilo (sem background, cores do terminal).

```php
public array $hover = ['48;2;58;58;58', '97'];
```

Config. Códigos SGR pintados durante o hover — o background suave padrão é o que acende um botão sem estilo quando o ponteiro passa.

```php
public int $row = 0;
```

Config. Linha da tela (1-based) — `0` mantém o botão sem posição (render em fluxo).

```php
public int $column = 0;
```

Config. Coluna da tela (1-based) — `0` mantém o botão sem posição.

```php
public int $width = 0;
```

Config. Colunas que o botão ocupa — `0` deriva do conteúdo no render (armazenado de volta); um width explícito preenche ou corta (reticências).

```php
public int $height = 1;
```

Config. Linhas que o botão ocupa — sempre `1` (um botão é uma pill de uma linha).

```php
public null|Closure $Action = null;
```

Data. O trigger do press — `function (Button $Button): mixed`; seu valor de retorno volta através de `press()`.

```php
public private(set) bool $hovered = false;
```

Metadata. Se o ponteiro está sobre o botão (pintura de hover ativa).

### hit()

```php
public function hit (int $column, int $line): bool
```

Verifica se uma coordenada de tela cai no retângulo do botão — um predicado puro: sem render, sem estado. Um botão sem posição não acerta nada.

### hover()

```php
public function hover (bool $over): void
```

Aplica (ou remove) o hover do botão — a pintura de hover repinta no lugar. Um hover sem mudança não escreve nada; saída plana nunca faz hover.

### press()

```php
public function press (): mixed
```

Pressiona o botão — dispara a `Action` com o próprio Button e devolve seu valor de retorno; `null` sem uma Action.

### invalidate()

```php
public function invalidate (): void
```

Invalida o botão (membro do Boxing) — um no-op: não há estado blitted, todo render repinta a linha inteira.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza a linha do botão. `WRITE_OUTPUT` pinta no lugar no retângulo quando posicionado, ou escreve a linha mais uma quebra de linha em fluxo quando não; `RETURN_OUTPUT` retorna a linha raw para o host posicionar. Conteúdo vazio não renderiza nada.
