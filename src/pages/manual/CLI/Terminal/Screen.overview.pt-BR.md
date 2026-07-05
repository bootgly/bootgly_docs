# Terminal Screen

O componente `Screen` controla o buffer de tela do terminal: entra e sai da **tela alternativa** (o buffer em que TUIs full-screen desenham, preservando o scrollback do shell do usuário), limpa a tela, mede o tamanho do terminal e observa **redimensionamentos** (SIGWINCH).

Ele está disponível na facade do Terminal:

```php
use const Bootgly\CLI;

$Screen = CLI->Terminal->Screen;
```

## Entrando e saindo da tela alternativa

```php
use const Bootgly\CLI;

$Screen = CLI->Terminal->Screen;

$Screen->open();   // muda para o buffer alternativo e o limpa

// ... desenhe sua UI full-screen ...

$Screen->close();  // restaura o shell do usuário exatamente como estava
```

`open()` também registra uma restauração no shutdown: se o processo terminar com o buffer alternativo ativo — um `exit()`, um erro não tratado, um signal handler — a tela principal é restaurada mesmo assim. As duas chamadas são idempotentes: abrir um Screen já aberto (ou fechar um já fechado) não escreve nada.

## Reagindo a redimensionamentos do terminal

```php
use Bootgly\CLI\Terminal;

CLI->Terminal->Screen->watch(static function (int $columns, int $lines): void {
   Terminal::$width = $columns;
   Terminal::$height = $lines;
});
```

Cada redimensionamento mede o novo tamanho e o repassa ao handler — o handler decide o que atualizar. Passe `null` para restaurar o comportamento padrão do sinal.

## Medindo o terminal

```php
use Bootgly\CLI\Terminal\Screen;

[$columns, $lines] = Screen::measure();
```

A sondagem resolve primeiro as variáveis de ambiente `COLUMNS` / `LINES` (convenção do ncurses), depois `tput`, e por fim cai no padrão 80×30. A facade `Terminal` usa essa mesma sondagem para popular `Terminal::$width` / `Terminal::$height`.

---

## Referência

```php
public static function measure (): array
```

Mede o tamanho do terminal e o retorna como `[columns, lines]`. Ordem de resolução: ambiente `COLUMNS`/`LINES`, `tput cols`/`tput lines`, o padrão 80×30.

```php
public function open (): self
```

Entra no buffer de tela alternativo e o limpa. Registra a restauração no shutdown uma única vez, garantindo que a tela principal sempre volte — incluindo caminhos de `exit()` e sinais. Idempotente.

```php
public function close (): self
```

Sai do buffer de tela alternativo, restaurando o conteúdo da tela principal. Idempotente.

```php
public function clear (): self
```

Limpa o buffer de tela atual e posiciona o cursor na origem.

```php
public function watch (null|Closure $handler): bool
```

Observa redimensionamentos do terminal (SIGWINCH): cada resize mede a tela e chama `$handler(int $columns, int $lines)`. Um handler `null` restaura o comportamento padrão do sinal. Retorna `false` quando o controle de processos (`pcntl`) não está disponível.
