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

## Frames customizados

Os frames da animação são strings simples — troque por qualquer charset:

```php
$Spinner->frames = ['-', '\\', '|', '/'];
$Spinner->throttle = 0.12;
```

## Saída não interativa

Em pipes e CI, `start()` imprime a descrição uma vez, `spin()` é no-op e `finish()` imprime a linha de resolução — uma linha cada, sem repaints, determinístico.

## Referência

### Propriedades

```php
public array $frames
```

Config. Os frames da animação (uma string por tick). Padrão: pontos braille (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`).

```php
public float $throttle
```

Config. Segundos mínimos entre repaints. Padrão: `0.08`.

```php
public string $template
```

Config. O template do frame com os tokens `@spinner;` e `@description;`. Padrão: `'@spinner; @description;'`.

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

Inicia o spinner: registra a descrição, reserva a linha e esconde o cursor. Saída não interativa renderiza a descrição uma vez.

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
