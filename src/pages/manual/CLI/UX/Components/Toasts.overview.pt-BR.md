# Componente Toasts

O componente `Toasts` mostra notificações transientes e **não-modais**: cada toast é uma caixa com borda auto-dimensionada, empilhada em uma posição da tela, viva até seu deadline. A pilha é dirigida por tick — `add()` enfileira, o loop do app chama `render()` a cada frame e toasts expirados se descartam sozinhos, apagando suas células com espaços e repintando os componentes cobertos (um terminal não consegue ler suas próprias células de volta). Diferente de um [Dialog](/manual/CLI/UX/Components/Dialog/overview), um toast nunca captura o teclado: o app continua rodando enquanto notificações vêm e vão.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UX/Components/Toasts/showcase).

## Instância

Crie uma instância passando o `Output` do terminal — toasts nunca leem entrada, então nenhum `Input` é necessário:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Toasts;

$Toasts = new Toasts(CLI->Terminal->Output);
```

## Notificando em um loop de tick

`add()` enfileira (nunca pinta); `render()` é o tick — chame a cada frame do loop do app. Um tick ocioso escreve zero bytes (diff-blit), então tickar é barato:

```php
$Toasts->add('Build started...');

while ($running) {
   // ... trabalho do app ...

   $Toasts->render();

   usleep(50_000);
}
```

Cada toast vive `TTL` segundos (padrão `3.0`) — sobrescreva por toast:

```php
$Toasts->add('Slow query detected', TTL: 6.0);
```

Mensagens são texto plano de uma linha — caracteres de controle (quebras de linha, escapes) são removidos, e a caixa se auto-dimensiona por contagem de caracteres, então mantenha-as em texto single-width (glyphs CJK/emoji double-width podem não dimensionar exatamente, seguindo o modelo de largura do `Frame`).

## One-liner bloqueante

Para scripts lineares sem loop de tick, `flash()` pinta, espera a vida do toast e restaura a tela em uma chamada:

```php
$Toasts->flash('Deploy complete!');
```

## Severidade

O segundo argumento é o `Type` do [Alert](/manual/CLI/UI/Components/Alert/overview) — a cor da borda e o glyph inicial o seguem:

```php
use Bootgly\CLI\UI\Components\Alert\Type;

$Toasts->add('Cache warmed', Type::Success);       // ✔ verde
$Toasts->add('Disk almost full', Type::Attention); // ▲ amarelo
$Toasts->add('Worker died', Type::Failure);        // ✖ vermelho
$Toasts->add('New version available');             // ● azul (Default)
```

## Escolhendo a posição

`Positions` ancora a pilha em uma de sete posições da tela (padrão `TopRight`): `TopLeft`, `TopCenter`, `TopRight`, `Center`, `BottomLeft`, `BottomCenter` e `BottomRight`. O toast visível mais antigo fica colado na âncora e os novos crescem se afastando dela — adições nunca movem as caixas existentes:

```php
use Bootgly\CLI\UX\Components\Toasts\Positions;

$Toasts->Positions = Positions::BottomRight;
$Toasts->gap = 1;      // linhas em branco entre as caixas
$Toasts->limit = 4;    // máx. visíveis — os mais antigos se escondem até os novos expirarem
```

Posições top crescem para baixo, bottom para cima e `Center` centraliza o bloco inteiro verticalmente. Posições à direita alinham a borda direita de cada caixa à borda da tela; posições center centralizam cada caixa horizontalmente. Terminais baixos reduzem a contagem visível em vez de sobrepor.

## Cobrindo componentes

No descarte, as células desocupadas são apagadas com espaços e os componentes cobertos se repintam. Registre tudo o que a âncora sobrepõe com `cover()` — cobrir a mais só custa comparações do diff-blit:

```php
use Bootgly\CLI\UI\Base\Frame;

$App = new Frame(CLI->Terminal->Output);
// ... geometria + conteúdo ...
$App->render();

$Toasts->cover($App);
```

Qualquer implementador de `Boxing` funciona — `Frame`, `Tabs`, as células de um `Grid` ou um `Dialog`. Células desocupadas fora de qualquer componente coberto ficam em branco (mesmo contrato do Dialog).

## Redimensionando

`resize()` casa com a assinatura do handler do `Screen::watch` — limpa a tela, repinta os componentes cobertos e re-ancora a pilha no novo tamanho:

```php
CLI->Terminal->Screen->watch($Toasts->resize(...));
```

## Saída não interativa

Em pipes e CI nenhuma caixa é posicionada: `add()` e `flash()` escrevem uma linha classificada — `[SUCCESS] Cache warmed` — e `render()` não escreve nada. O mesmo código roda interativamente e em scripts.

## Referência

### Propriedades

```php
public Output $Output
```

O Output do terminal onde a pilha é pintada.

```php
public Positions $Positions
```

Config. A posição da tela que ancora a pilha. Padrão: `Positions::TopRight`.

```php
public float $TTL
```

Config. Vida padrão do toast, em segundos. Padrão: `3.0`.

```php
public int $limit
```

Config. Máximo de toasts visíveis — os mais antigos se escondem até os novos expirarem. Padrão: `3`.

```php
public null|int $width
```

Config. Teto da largura externa da caixa, em colunas — `null` deriva metade da largura do terminal. Caixas se auto-dimensionam à mensagem até esse teto. Padrão: `null`.

```php
public int $gap
```

Config. Linhas em branco entre as caixas empilhadas. Padrão: `0`.

```php
public float $throttle
```

Config. Segundos por tick do `flash()`. Padrão: `0.05`.

```php
public private(set) array $Covered
```

Data (somente leitura). Os componentes cobertos, repintados no reflow em ordem de pintura.

```php
public protected(set) array $queue
```

Data (somente leitura). Os toasts enfileirados, mais antigo primeiro — cada entrada guarda `message`, `Type`, `until` e seu `Frame`.

### cover()

```php
public function cover (Boxing ...$Boxes): self
```

Registra os componentes cobertos pela âncora da pilha — cada um repinta quando um reflow desocupa células, em ordem de pintura.

### add()

```php
public function add (string $message, Type $Type = Type::Default, null|float $TTL = null, null|float $at = null): self
```

Enfileira um toast com seu deadline de descarte — a pintura acontece no próximo tick de `render()`. Saída não interativa escreve uma linha classificada imediatamente. `$at` injeta o relógio (microtime) para testes determinísticos.

### expire()

```php
public function expire (null|float $at = null): void
```

Expira os toasts cujo deadline passou — mutação pura da fila, sem pintura (o próximo `render()` apaga e restaura). Chamado internamente pelo `render()`.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT, null|float $at = null): null|string
```

O tick: expira toasts mortos, apaga as células desocupadas, repinta os componentes cobertos uma vez por reflow e faz diff-blit das caixas de pé. Um tick ocioso escreve zero bytes. `RETURN_OUTPUT` retorna as caixas concatenadas em vez de escrever.

### flash()

```php
public function flash (string $message, Type $Type = Type::Default, null|float $TTL = null): void
```

Mostra um toast e bloqueia até ele expirar — pintar, esperar, descartar em uma chamada. Outros toasts enfileirados continuam expirando no prazo durante a espera. Saída não interativa escreve a linha e retorna imediatamente.

### clear()

```php
public function clear (): void
```

Descarta todos os toasts — esvazia a fila, apaga as células pintadas e repinta os componentes cobertos.

### invalidate()

```php
public function invalidate (): void
```

Invalida todas as caixas — o próximo render repinta os retângulos completos (tela limpa externamente, sobreposta, ...).

### resize()

```php
public function resize (int $columns, int $lines): void
```

Redimensiona contra um novo tamanho de terminal — limpa a tela, repinta os componentes cobertos e re-ancora a pilha. A assinatura casa com o handler de resize do `Screen::watch`.
