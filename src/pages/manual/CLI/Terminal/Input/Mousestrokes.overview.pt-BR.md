# Mousestrokes

Quando o [Mouse Reporting](/manual/CLI/Terminal/Reporting/Mouse/overview) está habilitado, o terminal codifica cada evento de mouse como uma sequência de escape SGR no stream de entrada:

```text
\e[<{action};{column};{row}{state}
```

- `{action}` — um código numérico identificando o que aconteceu (qual botão, movimento, scroll, teclas modificadoras);
- `{column}` / `{row}` — as coordenadas de célula com base 1;
- `{state}` — `M` quando o botão está pressionado, `m` quando é solto.

O enum `Mousestrokes` dá nome às duas partes: os **códigos de ação** e as duas **letras de estado**. Você raramente faz o parse da sequência manualmente — o `Mouse->reporting()` faz isso e entrega ao seu callback um case de `Mousestrokes` já resolvido.

## Reagindo a eventos de mouse

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Input\Mousestrokes;
use Bootgly\CLI\Terminal\Reporting\Mouse;

$Mouse = CLI->Terminal->Mouse;

$Mouse->reporting(function (Mousestrokes $Action, array $coordinate, bool $clicking) {
   [$column, $row] = $coordinate;

   match ($Action) {
      Mousestrokes::LEFT_CLICK  => print("clique esquerdo em [$column, $row]\n"),
      Mousestrokes::SCROLL_UP   => print("scroll para cima\n"),
      Mousestrokes::SCROLL_DOWN => print("scroll para baixo\n"),
      default                   => null,
   };

   // ? O clique direito encerra o loop de reporting
   return $Action !== Mousestrokes::RIGHT_CLICK;
});
```

Para resolver um código de ação raw manualmente, use o valor de backing:

```php
$Action = Mousestrokes::tryFrom('35'); // Mousestrokes::NONE_CLICK_WITH_MOVEMENT
```

## Veja ao vivo

O [showcase de Mouse Reporting](/manual/CLI/Terminal/Reporting/Mouse/showcase) decodifica essas sequências em tempo real em PHP 8.4 WebAssembly — cada nome de case abaixo aparece na tela conforme você move, clica e rola.

## Reference

`Bootgly\CLI\Terminal\Input\Mousestrokes` é um enum com backing de string. Os cases de ação carregam o código numérico do payload SGR; os cases de estado carregam a letra terminadora.

### Cliques

| Case | Código |
|---|---|
| `LEFT_CLICK` / `MIDDLE_CLICK` / `RIGHT_CLICK` | `0` / `1` / `2` |
| `..._WITH_SHIFT` | `4` / `5` / `6` |
| `..._WITH_ALT` | `8` / `9` / `10` |
| `..._WITH_SHIFT_ALT` | `12` / `13` / `14` |
| `..._WITH_CTRL` | `16` / `17` / `18` |
| `..._WITH_SHIFT_CTRL` | `20` / `21` / `22` |
| `..._WITH_ALT_CTRL` | `24` / `25` / `26` |

### Movimentos

Os códigos de movimento seguem o mesmo layout, deslocados em 32 — com uma quarta variante para movimento sem nenhum botão pressionado:

| Case | Código |
|---|---|
| `LEFT_CLICK_WITH_MOVEMENT` / `MIDDLE_...` / `RIGHT_...` / `NONE_CLICK_WITH_MOVEMENT` | `32` / `33` / `34` / `35` |
| `..._WITH_MOVEMENT_WITH_SHIFT` | `36` – `39` |
| `..._WITH_MOVEMENT_WITH_ALT` | `40` – `43` |
| `..._WITH_MOVEMENT_WITH_SHIFT_ALT` | `44` – `47` |
| `..._WITH_MOVEMENT_WITH_CTRL` | `48` – `51` |
| `..._WITH_MOVEMENT_WITH_SHIFT_CTRL` | `52` – `55` |
| `..._WITH_MOVEMENT_WITH_ALT_CTRL` | `56` – `59` |

### Scroll

| Case | Código |
|---|---|
| `SCROLL_UP` / `SCROLL_DOWN` | `64` / `65` |
| `SCROLL_UP_WITH_ALT` / `SCROLL_DOWN_WITH_ALT` | `72` / `73` |
| `SCROLL_UP_WITH_CTRL` / `SCROLL_DOWN_WITH_CTRL` | `80` / `81` |

### Estados

| Case | Letra |
|---|---|
| `CLICKED` | `M` (botão pressionado) |
| `UNCLICKED` | `m` (botão solto) |
