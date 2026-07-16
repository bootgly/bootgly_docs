# Line

`Line` é o motor de edição de linha única por trás das entradas interativas do Bootgly — uma máquina de estados pura de teclas/buffer com um cursor virtual. Ele **não faz I/O de stream**: seu código é dono do loop de leitura, alimenta os bytes imprimíveis, encaminha as teclas de controle e escreve o frame renderizado. Essa pureza é o que o torna testável e reutilizável — o editor de sugestões do [Question](/manual/CLI/UI/Components/Question/overview), as linhas do [Textarea](/manual/CLI/UI/Components/Textarea/overview) e a linha de entrada do [Prompt](/manual/CLI/UX/Components/Prompt/overview) são todos guiados por ele.

## Editando uma linha

Coloque o [Input](/manual/CLI/Terminal/Input/overview) em modo raw e bombeie as teclas para o motor — imprimíveis vão para `feed()`, todo o resto para `control()`, e cada iteração repinta com `render()`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Input\Line;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Input->configure(blocking: true, canonical: false, echo: false);

$Line = new Line;
$Line->width = 40;

while (true) {
   $Output->render("\r\e[K> {$Line->render()}");

   $key = $Input->read(16);

   // ? Teclas de controle (setas, Home/End, kills…) — false significa Enter (submeter)
   if ($Line->control($key) === false) {
      break;
   }

   // @ Entrada imprimível entra no buffer na posição do cursor virtual
   $Line->feed($key);
}

$Output->write("\nVocê digitou: {$Line->value}\n");
```

`feed()` entende UTF-8 — insere caracteres completos na posição do cursor e ignora silenciosamente bytes de controle, então é seguro repassar a ele o que `control()` não consumiu. `render()` marca a célula do cursor em vídeo inverso e, quando o valor excede `width`, mantém o cursor dentro de uma janela deslizante com um `…` esmaecido em cada borda truncada.

O motor entende o vocabulário usual de edição de linha do [Keystrokes](/manual/CLI/Terminal/Input/Keystrokes/overview):

| Teclas | Ação |
|---|---|
| `←` / `→`, `Ctrl+B` / `Ctrl+F` | movem o cursor um caractere |
| `Home` / `End`, `Ctrl+A` / `Ctrl+E` | saltam para o início / fim |
| `Backspace`, `Delete` | apagam ao redor do cursor |
| `Ctrl+U` / `Ctrl+K` | matam até o início / fim da linha |
| `Ctrl+W`, `Alt+Backspace` | cortam a palavra antes do cursor |
| `Enter` | submete — `control()` retorna `false` |

## Mascarando entrada secreta

Defina `mask` para renderizar um caractere substituto por caractere digitado — o valor real permanece intacto em `value`:

```php
$Line = new Line;
$Line->mask = '•';

$Line->feed('hunter2');

echo $Line->value;    // hunter2
// render() exibe: •••••••
```

Para iniciar uma nova leitura com a mesma configuração, `reset()` limpa o buffer e retorna o cursor ao início.

## Reference

`Bootgly\CLI\Terminal\Input\Line` expõe três propriedades: `width` (`null|int` — colunas visíveis; `null` renderiza o valor inteiro), `mask` (`null|string` — caractere substituto para entrada secreta) e `value` (`string` — o buffer editado). A posição do cursor virtual pode ser lida em `cursor` (`int`, em codepoints — somente leitura).

```php
public function feed (string $input): self
```

Insere entrada imprimível na posição do cursor virtual, com suporte a UTF-8. Caracteres de controle (C0 e DEL) nunca entram no valor — são ignorados, então a leitura completa da tecla pode ser repassada.

```php
public function control (string $key): bool
```

Trata uma tecla de edição (bytes crus — setas chegam como sequências de escape) e informa se a edição continua: `false` no `Enter` (submeter), `true` caso contrário.

```php
public function render (): string
```

Retorna a fatia visível do valor com a célula do cursor em vídeo inverso. Com `width` definido, a fatia desliza para manter o cursor visível e bordas truncadas renderizam um `…` esmaecido; com `mask` definido, cada caractere renderiza como a máscara.

```php
public function reset (): self
```

Limpa o buffer e retorna o cursor virtual ao início, mantendo `width` e `mask`.
