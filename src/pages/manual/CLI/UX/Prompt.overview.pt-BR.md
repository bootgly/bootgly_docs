# Componente Prompt

O componente `Prompt` fixa uma linha de entrada no rodapé do terminal enquanto o conteúdo rola acima — como Claude Code, Codex ou OpenCode. Por padrão a área de conteúdo é uma banda [Scrollarea](/manual/CLI/UI/Components/Scrollarea/overview) bufferizada: a roda do mouse e `PgUp`/`PgDn` a rolam, a scrollbar da borda direita aceita hover, clique e arrasto, e **`Ctrl+T` alterna o modo seleção** — libera o mouse para a seleção/cópia de texto nativa funcionar, e retoma no próximo toggle. Alternativamente, `buffered = false` troca para o fluxo nativo: o conteúdo entra no scrollback do terminal e tudo que envolve mouse permanece nativo, sem scrollbar interna. `prompting()` entrega cada linha submetida, com histórico `↑`/`↓` e entrada multilinha com `Alt+Enter`. Em entrada não interativa (pipes, CI) degrada para um loop simples de linhas do stdin — o código consumidor permanece idêntico.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UX/Prompt/showcase).

## Instância

Para usar o componente, é necessário criar uma instância passando como parâmetros as instâncias dos componentes `Input` e `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Prompt;

$Terminal = CLI->Terminal;

$Prompt = new Prompt($Terminal->Input, $Terminal->Output);
$Prompt->prompt = '>_ ';
```

## Prompt em loop

Conduza `prompting()` com um `foreach` — cada iteração é uma linha submetida. Use `feed()` para toda saída do app, para que entre na banda de conteúdo acima da entrada fixa (chame `start()` antes ao alimentar antes do loop — a banda é dona da área de conteúdo):

```php
$Prompt->start();
$Prompt->feed('Bem-vindo — digite linhas; `exit` sai.');

foreach ($Prompt->prompting() as $line) {
   if (trim($line) === 'exit') {
      break;
   }

   $Prompt->feed("echo: {$line}");
}

$Prompt->finish();
```

`Ctrl+D` ou EOF encerram o loop imediatamente. `Ctrl+C` pede confirmação: o primeiro toque mostra um aviso na borda inferior — pressione `Ctrl+C` de novo em até 2 segundos para encerrar; caso contrário o aviso expira (qualquer outra tecla também o descarta) e a edição continua. O texto do aviso é a config `interruption`. Sempre deixe `finish()` rodar (também roda no destruct) — ele reseta a região de scroll; uma região vazada quebra o terminal.

## Bordas e textos fixos

A linha de entrada é emoldurada por bordas acima e abaixo, com quatro slots de texto fixo — esquerda e direita, acima da borda superior e abaixo da borda inferior. Os textos aceitam markup de Template e podem ser atualizados a qualquer momento (o próximo repaint os reflete):

```php
$Prompt->top = ['left' => '@#Cyan:Bootgly REPL@;', 'right' => '@#Black:v0.20@;'];
$Prompt->bottom = ['left' => '@#Black:? for help@;', 'right' => '@#Black:0 lines@;'];
$Prompt->border = '─';
```

```text
[conteúdo rola aqui...]
Bootgly REPL                                v0.20
─────────────────────────────────────────────────
>_ digite aqui█
─────────────────────────────────────────────────
? for help                                0 lines
```

Slots `top`/`bottom` vazios pulam sua linha de texto — o frame encolhe e a região de conteúdo cresce.

## Rolando o conteúdo

**Banda bufferizada (padrão).** A área de conteúdo é uma banda [Scrollarea](/manual/CLI/UI/Components/Scrollarea/overview) (1000 linhas visuais por padrão; linhas longas quebram): `PgUp`/`PgDn` paginam, a **roda do mouse** rola três linhas por clique e a scrollbar da borda direita é interativa — o cursor destaca no hover e aceita clique e arrasto (clique no trilho salta a visão). Enquanto rolado para cima, novos feeds mantêm a posição; submeter uma linha (ou alcançar a última) gruda a visão de volta no rodapé. O frame de entrada nunca se move.

**Modo seleção (`Ctrl+T`).** O mouse reporting é global por design do terminal — enquanto ligado, a seleção de texto nativa pausa. `Ctrl+T` alterna o modo seleção: o mouse é liberado (um aviso aparece na borda inferior) e selecionar/copiar funciona nativamente — mova, clique e arraste à vontade; digitar continua funcionando e `PgUp`/`PgDn` seguem rolando a banda. `Ctrl+T` de novo retoma o mouse (roda + scrollbar). `Shift` também bypassa o reporting a qualquer momento; use `$Prompt->mouse = false;` para manter o mouse totalmente nativo na sessão inteira.

**Fluxo nativo (`$Prompt->buffered = false;`).** O conteúdo alimentado entra no fluxo do próprio terminal enquanto o frame permanece fixo no rodapé: cada feed limpa o frame (as linhas dele nunca poluem o scrollback), escreve o conteúdo acima e rola a tela pela última linha — o único caminho para o scrollback real — e então repinta o frame no rodapé. Tudo que envolve mouse permanece nativo (sem mouse reporting, sem scrollbar interna) — estilo Claude Code.

## Histórico e multilinha

`↑`/`↓` percorrem o histórico de linhas submetidas (o rascunho atual é preservado e volta com `↓`). `Alt+Enter` acumula a linha atual e limpa a entrada — o Enter então submete todas as linhas acumuladas unidas por `\n`; um hint esmaecido `…+N` marca as linhas pendentes.

## Entrada não interativa

Em pipes e CI não há região nem histórico: `prompting()` entrega linhas do stdin até EOF e `feed()` escreve plano — determinístico, sem ruído de escapes.

## Referência

### Propriedades

```php
public string $prompt
```

Config. O prefixo da linha de entrada. Padrão: `'>_ '`.

```php
public int $history
```

Config. Máximo de entradas do histórico (ring limitado). Padrão: `100`.

```php
public string $border
```

Config. O caractere da linha de borda renderizada acima e abaixo da linha de entrada. Padrão: `'─'`.

```php
public array $top
```

Config. Textos fixos acima da borda superior — `['left' => ..., 'right' => ...]` (markup de Template suportado; ambos vazios pulam a linha). Padrão: ambos vazios.

```php
public array $bottom
```

Config. Textos fixos abaixo da borda inferior — mesmo formato do `top`. Padrão: ambos vazios.

```php
public string $interruption
```

Config. O aviso mostrado na borda inferior após o primeiro `Ctrl+C` — um segundo toque em até 2 segundos encerra o loop; caso contrário o aviso expira. Padrão: `'Press Ctrl+C again to exit'`.

```php
public bool $buffered
```

Config. Banda de conteúdo bufferizada (scrollbar interna + mouse reporting; `Ctrl+T` alterna o modo seleção). `false` troca para o fluxo nativo: o conteúdo entra no scrollback do terminal — rolagem com a roda, seleção de texto e cópia permanecem totalmente nativas. Padrão: `true`.

```php
public bool $mouse
```

Config (modo banda). Suporte a mouse — a roda rola a banda; a scrollbar aceita hover, clique e arrasto. A seleção de texto nativa pausa enquanto o reporting está ligado (`Ctrl+T` alterna; `Shift` bypassa). Padrão: `true`.

```php
public string $selection
```

Config (modo banda). O aviso mostrado na borda inferior enquanto o modo seleção está ativo. Padrão: `'Selection mode · Ctrl+T resumes the mouse'`.

```php
public private(set) Line $Line
```

Data. O engine editor de linha por trás da linha de entrada.

```php
public private(set) Scrollarea $Scrollarea
```

Data. A banda de conteúdo bufferizada acima do frame — as configs `capacity` e `scrollbar` dela são alcançáveis aqui.

```php
public private(set) array $entries
```

Data (somente leitura). As entradas do histórico, da mais antiga à mais nova.

```php
public private(set) bool $finished
```

Metadata (somente leitura). `true` após `finish()`.

### start()

```php
public function start (): void
```

Entra em modo raw e desenha o frame de entrada (o modo banda também clipa a região de scroll do conteúdo e arma o mouse reporting). Invocado automaticamente por `prompting()`.

### feed()

```php
public function feed (string $content): void
```

Alimenta conteúdo do app acima do frame fixo no rodapé (escrita plana em saída não interativa). Fluxo nativo: o conteúdo rola para o scrollback do terminal enquanto o frame permanece fixo. Modo banda: o conteúdo bufferiza na Scrollarea — enquanto rolado para cima, a posição se mantém. Markup de Template é suportado.

### prompting()

```php
public function prompting (): Generator
```

Entrega cada linha submetida até um duplo `Ctrl+C`, `Ctrl+D` ou EOF. Entrada não interativa entrega linhas do stdin até EOF.

### finish()

```php
public function finish (): void
```

Reseta a região de scroll (tela cheia), restaura as configurações de entrada e mostra o cursor. Idempotente — também invocado pelo destrutor.
