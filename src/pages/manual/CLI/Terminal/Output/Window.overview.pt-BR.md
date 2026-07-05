# Window

`Window` é a calculadora de janela visível por trás das listas roláveis do Bootgly — estado puro, **sem I/O de stream**. Dado um `size` de janela e um `total` de lista, ele rastreia qual fatia de linhas está visível e desliza essa fatia para seguir uma linha mirada. Seu código fatia e renderiza; o `Window` só faz a matemática. O viewport do [Menu](/manual/CLI/UI/Components/Menu/overview), o dropdown de sugestões do [Question](/manual/CLI/UI/Components/Question/overview) e a janela de linhas do [Textarea](/manual/CLI/UI/Components/Textarea/overview) são todos construídos sobre ele.

## Janelando uma lista

Crie-o com o tamanho visível e o total da lista, use `slide()` em direção à linha que o usuário mirar, e então renderize apenas as linhas entre `first` e `last`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Output\Window;

$Output = CLI->Terminal->Output;

$items = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf'];

$Window = new Window(size: 3, total: count($items));

$aimed = 5; // ex.: movido pelas teclas ↑/↓

$Window->slide($aimed);

// @ Renderiza apenas a fatia visível
for ($index = $Window->first; $index <= $Window->last; $index++) {
   $marker = $index === $aimed ? '>' : ' ';

   $Output->write("{$marker} {$items[$index]}\n");
}
// >  a fatia mostra: Delta, Echo, > Foxtrot
```

`slide()` só move a janela quando a linha mirada sairia dela — mirar dentro da fatia atual é um no-op, então a lista permanece visualmente estável enquanto o usuário navega. A janela é sempre restringida ao intervalo válido: nunca mostra além do fim nem antes do início.

Dois casos de borda são tratados de graça: com `size` em `0` o janelamento é desabilitado, e quando a lista inteira cabe (`total <= size`) a janela fixa no topo — em ambos os casos `first` é `0` e `last` cobre tudo o que está disponível.

Quando a lista cresce ou encolhe (um filtro, um feed ao vivo), atualize `total` e chame `slide()` de novo para re-restringir.

## Reference

`Bootgly\CLI\Terminal\Output\Window` expõe `size` (`int` — linhas visíveis; `0` desabilita o janelamento), `total` (`int` — total de linhas) e os limites computados: `first` (`int`, somente leitura — índice da primeira linha visível) e `last` (`int`, somente leitura — índice da última linha visível, derivado de `first`, `size` e `total`).

```php
public function __construct (int $size = 0, int $total = 0)
```

Cria a janela com seu tamanho visível e o total da lista. A janela começa no topo (`first` é `0`).

```php
public function slide (int $aimed): self
```

Desliza a janela o mínimo necessário para manter a linha mirada dentro de `[first, last]`, restringida ao intervalo válido. Com o janelamento desabilitado ou quando tudo cabe, redefine `first` para `0`.
