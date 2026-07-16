# Componente Statusbar

O componente `Statusbar` renderiza uma barra de status de linha única: segmentos à esquerda separados por um divisor, segmentos à direita alinhados à borda do terminal — o equivalente do footer `help` do Bubbles, onde hints de keybinding são só segmentos. Foi promovido do App shell da plataforma Bootgly Console, que agora consome este Atom como sua status row fixa.

É um **UI Atom** — uma primitiva sem dependência de outros componentes. Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Atoms/Statusbar/showcase).

## Instância

Para usar o componente, crie uma instância passando a instância do `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Statusbar;

$Statusbar = new Statusbar(CLI->Terminal->Output);
```

## Renderize uma barra

Segmentos à esquerda unem-se com o divisor; segmentos à direita alinham à borda. O gap preenche automaticamente até a largura do terminal:

```php
$Statusbar->left = ['Dashboard', 'main'];
$Statusbar->right = ['^P palette', '? help', 'q quit'];

$Statusbar->render();
```

```text
 Dashboard  ▏ main                    ^P palette  ? help  q quit
```

Segmentos são strings simples — mas podem carregar suas próprias cores SGR: a medição é escape-aware, então escapes embutidos nunca desalinham a barra.

## Estilo

A barra pinta por default um fundo cinza escuro 256-color com texto branco bright. `style` aceita qualquer lista de códigos SGR:

```php
$Statusbar->style = ['44', '97'];   // fundo azul, texto branco bright
$Statusbar->divider = ' • ';

$Statusbar->render();
```

## Posicionamento

`render()` escreve a linha (mais um newline) para scripts lineares. Hosts que compõem o próprio frame — última linha fixa, painel embutido — usam `RETURN_OUTPUT` e posicionam a linha crua:

```php
use Bootgly\API\Component;

$row = $Statusbar->render(Component::RETURN_OUTPUT);   // sem newline final
```

É exatamente assim que o App shell da plataforma Console a compõe na última linha do frame.

## Saída não-interativa

Em pipes e CI o render mantém o alinhamento com **zero escape codes** — a pintura da barra é pulada e escapes embutidos nos segmentos são removidos. `decoration` é tri-state: `null` (default) segue o TTY, `false` força plano, `true` força estilizado.

## Reference

### Propriedades

```php
public null|bool $decoration = null;
```

Config. Decoração SGR — `null` segue o TTY, `false` força plano, `true` força estilizado.

```php
public array $left = [];
```

Config. Segmentos à esquerda, separados pelo divisor.

```php
public array $right = [];
```

Config. Segmentos à direita, alinhados à borda.

```php
public string $divider = '  ▏ ';
```

Config. Divisor entre os segmentos à esquerda.

```php
public null|int $width = null;
```

Config. Largura da barra, em colunas — `null` segue a largura do terminal.

```php
public array $style = ['48', '5', '236', '97'];
```

Config. Códigos SGR pintando a barra (fundo + texto) — qualquer lista de códigos.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza a linha da barra. `WRITE_OUTPUT` escreve a linha mais um newline no `Output` e retorna `null`; `RETURN_OUTPUT` retorna a linha crua (sem newline) para o host posicionar.
