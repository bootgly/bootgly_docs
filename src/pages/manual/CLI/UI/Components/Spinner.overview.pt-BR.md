# Componente Spinner

O componente `Spinner` renderiza um indicador de atividade indeterminada — frames animados ao lado de uma descrição — enquanto seu código trabalha. É guiado por tick: o loop de trabalho chama `spin()` e o componente limita os repaints; sem fork de processo, sem sinais. Em saída não interativa (pipes, CI), renderiza a descrição uma vez e a linha de resolução ao final — logs permanecem limpos.

Para trabalho determinado (total conhecido), use [Progress](/manual/CLI/UI/Components/Progress/overview). Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Components/Spinner/showcase).

## Instância

Para usar o componente, é necessário criar uma instância passando como parâmetro a instância do componente `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Spinner;

$Spinner = new Spinner(CLI->Terminal->Output);
```

## Girando enquanto trabalha

Chame `start()` com uma descrição, conduza `spin()` no loop de trabalho e `finish()` com uma linha de resolução:

```php
$Spinner->start('Resolving dependencies...');

foreach ($packages as $package) {
   fetch($package); // trabalho real

   $Spinner->spin();
}

$Spinner->finish('@#Green:✔@; Dependencies ready.');
```

`spin()` é limitado (80ms por padrão) — chame quantas vezes quiser; só repinta quando devido.

## Atualizando a descrição

`describe()` troca o texto da atividade no meio do caminho (textos mais curtos limpam o anterior com padding):

```php
$Spinner->describe('Downloading packages...');
```

## Sets de animação nomeados

Os visuais são **sets nomeados** resolvidos do registry `Spinner::$Sets` — builtins `braille` (padrão), `star` (estilo assistente), `line`, `arc` e `dots`. Registre o seu e selecione pelo nome; `$frames` continua disponível como escape hatch raw:

```php
$Spinner->set = 'star';                         // ✢ ✳ ✶ ✻ ✽ …

Spinner::$Sets['clock'] = ['🕐', '🕑', '🕒'];    // registre…
$Spinner->set = 'clock';                        // …e selecione

$Spinner->frames = ['-', '\\', '|', '/'];        // ou frames raw direto
```

Nomes desconhecidos lançam `ValueError`.

## Status ao vivo

`status` renderiza um parêntese esmaecido após a descrição — reatribua a qualquer momento, o próximo repaint carrega o valor. O token `@elapsed;` formata o tempo decorrido automaticamente (`47s`, `2m 07s`):

```php
$Spinner->status = '@elapsed; · ↓ 2.1k tokens';

// depois, no loop de trabalho — atualiza em tempo real:
$Spinner->status = '@elapsed; · ↓ 4.7k tokens';
```

```text
✶ Processing… (47s · ↓ 2.1k tokens)
```

## Tips

`tips` renderiza uma linha-guia esmaecida abaixo do spinner e rotaciona pelo pool enquanto o trabalho roda (`rotation` segundos cada):

```php
$Spinner->tips = [
   'Tip: você controla o tamanho do workflow em /config.',
   'Tip: pressione Esc para interromper a execução.'
];
$Spinner->rotation = 10.0;
```

```text
✶ Processing… (47s · ↓ 2.1k tokens)
  └ Tip: você controla o tamanho do workflow em /config.
```

## Efeitos de texto

`effect` anima a descrição com um efeito do [Text](/manual/CLI/UI/Atoms/Text): `Effects::Shimmer` desliza uma onda clara sobre o texto esmaecido (estilo assistente) e `Effects::Fade` respira dim → normal → bold:

```php
use Bootgly\CLI\UI\Atoms\Text\Effects;

$Spinner->effect = Effects::Shimmer;
```

O efeito anima o texto plano da descrição (markup embutido é removido para a onda).

## Saída não interativa

Em pipes e CI, `start()` imprime a descrição uma vez, `spin()` é no-op e `finish()` imprime a linha de resolução — uma linha cada, sem repaints, sem status/tips/efeitos, determinístico.

## Referência

### Propriedades

```php
public static array $Sets
```

Config. O registry de sets de animação nomeados — builtins `braille`, `star`, `line`, `arc` e `dots`; registre o seu (`nome` → array de frames).

```php
public string $set
```

Config. O set de animação nomeado — resolvido de `Spinner::$Sets`, escreve em `$frames`. Nomes desconhecidos lançam `ValueError`. Padrão: `'braille'`.

```php
public array $frames
```

Config. Os frames da animação (uma string por tick) — o escape hatch raw sob `$set`. Padrão: pontos braille (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`).

```php
public float $throttle
```

Config. Segundos mínimos entre repaints. Padrão: `0.08`.

```php
public string $status
```

Config. O status ao vivo — renderizado esmaecido entre parênteses após a descrição; o token `@elapsed;` resolve para o tempo decorrido formatado a cada repaint. Padrão: `''` (sem segmento).

```php
public array $tips
```

Config. As linhas de tip rotativas — renderizadas como linha-guia `└` esmaecida abaixo do spinner. Padrão: `[]` (sem linha).

```php
public float $rotation
```

Config. Segundos que cada tip permanece antes de rotacionar. Padrão: `10.0`.

```php
public null|Effects $effect
```

Config. O efeito de texto da descrição — `Effects::Shimmer` (onda clara deslizante) ou `Effects::Fade` (pulso dim → normal → bold). Padrão: `null` (plano).

```php
public string $template
```

Config. O template do frame com os tokens `@spinner;`, `@description;` e `@status;`. Padrão: `'@spinner; @description;@status;'`.

```php
public private(set) int $frame
```

Metadata (somente leitura). A contagem de ticks da animação.

```php
public private(set) string $description
```

Metadata (somente leitura). A descrição atual da atividade.

```php
public private(set) bool $finished
```

Metadata (somente leitura). `true` após `finish()`.

### start()

```php
public function start (string $description = ''): void
```

Inicia o spinner: registra a descrição, reserva as linhas (spinner + tip) e esconde o cursor. Saída não interativa renderiza a descrição uma vez.

### spin()

```php
public function spin (): void
```

Avança a animação e repinta, com throttle — chame no loop de trabalho. No-op em saída não interativa.

### describe()

```php
public function describe (string $description): void
```

Atualiza a descrição da atividade (limpa textos mais curtos com padding).

### finish()

```php
public function finish (string $resolution = ''): void
```

Finaliza o spinner: substitui sua linha pela resolução (ex.: `✔ done`) e mostra o cursor. Idempotente — também invocado pelo destrutor.
