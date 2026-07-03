# Terminal Reporting

Reporting é a parte do Terminal que faz o terminal *responder de volta*. Um reporter pede ao emulador de terminal que comece a codificar eventos — atividade do mouse, por exemplo — como sequências de escape no stream de entrada, para que seu código PHP possa reagir a eles em tempo real.

Todo reporter segue o mesmo contrato: é construído a partir do `Input` e do `Output` do Terminal, e é ligado e desligado com o `report()`.

## Ligando e desligando um reporter

O primeiro (e por enquanto único) reporter embutido é o reporter de [Mouse](/manual/CLI/Terminal/Reporting/Mouse/overview), disponível diretamente no Terminal:

```php
use const Bootgly\CLI;

$Mouse = CLI->Terminal->Mouse;

$Mouse->report(true);   // o terminal passa a reportar eventos de mouse no stdin
// ... leia e decodifique os eventos ...
$Mouse->report(false);  // terminal de volta ao normal
```

Helpers de mais alto nível como o `Mouse->reporting()` encapsulam esse ciclo para você: habilitam o reporting, decodificam cada evento em um case de [Mousestrokes](/manual/CLI/Terminal/Input/Mousestrokes/overview), invocam seu callback e restauram o terminal quando o callback retorna `false`.

## Veja ao vivo

O [showcase de Mouse Reporting](/manual/CLI/Terminal/Reporting/Mouse/showcase) executa o reporter real em PHP 8.4 WebAssembly — mova, clique e role sobre o terminal e veja cada evento ser decodificado pelo PHP.

## Reference

Reporters implementam a interface `Bootgly\CLI\Terminal\Reporting`:

```php
public function __construct (Input &$Input, Output &$Output)
```

Um reporter é vinculado ao `Input` do Terminal (onde o terminal escreve os eventos codificados) e ao `Output` (onde o reporter escreve as sequências de escape de habilitação/desabilitação).

```php
public function report (bool $enabled): void
```

Pede ao emulador de terminal que comece (`true`) ou pare (`false`) de reportar os eventos que este reporter trata. Enquanto habilitado, os eventos chegam intercalados com as teclas normais no stream de entrada.
