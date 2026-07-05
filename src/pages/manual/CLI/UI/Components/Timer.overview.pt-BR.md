# Componente Timer

O componente `Timer` renderiza uma contagem regressiva com callback de conclusão. O tempo restante sempre deriva do relógio de parede — nunca de contagem de ticks — então drift de `usleep` nunca o dessincroniza. Quando a contagem chega a zero, a Closure `Handler` dispara exatamente uma vez. Em saída não interativa (pipes, CI) renderiza apenas os frames inicial e final.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Components/Timer/showcase).

## Instância

Para usar o componente, é necessário criar uma instância passando como parâmetro a instância do componente `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Timer;

$Timer = new Timer(CLI->Terminal->Output);
```

## Rodando uma contagem

Defina `seconds` e um `Handler`, e deixe `run()` conduzir o ciclo inteiro sincronamente:

```php
$Timer->seconds = 5.0;
$Timer->Handler = static function (Timer $Timer): void {
   // dispara uma vez, no zero
};

$Timer->run('Launching...');
```

## Conduzindo os ticks você mesmo

Para contagens dentro de um loop existente, chame `start()` uma vez e `tick()` por iteração — o repaint é limitado e chegar a zero finaliza automaticamente:

```php
$Timer->seconds = 30.0;
$Timer->start('Waiting for the server...');

while ($working) {
   poll(); // trabalho real

   $Timer->tick();
}

$Timer->finish(); // opcional: força o zero antes
```

## Templating

O template do frame aceita os tokens `@description;`, `@remaining;`, `@elapsed;` e `@percent;`:

```php
$Timer->template = '⏳ @remaining;s (@percent;%) @description;';
$Timer->precision = 1;
```

## Saída não interativa

Em pipes e CI, `start()` renderiza o frame inicial uma vez, `tick()` fica silencioso (mas ainda conta e finaliza no zero) e `finish()` renderiza o frame final — determinístico, sem repaints.

## Referência

### Propriedades

```php
public float $seconds
```

Config. O total da contagem, em segundos. Padrão: `0.0`.

```php
public float $throttle
```

Config. Segundos mínimos entre repaints. Padrão: `0.1`.

```php
public int $precision
```

Config. Casas decimais de `@remaining;` e `@elapsed;`. Padrão: `2`.

```php
public null|Closure $Handler
```

Config. Invocado exatamente uma vez quando a contagem finaliza, recebendo a instância do `Timer`. Padrão: `null`.

```php
public string $template
```

Config. O template do frame. Padrão: `'⏳ @remaining;s @description;'`.

```php
public private(set) float $remaining
```

Metadata (somente leitura). Segundos restantes, derivados do relógio de parede.

```php
public private(set) float $elapsed
```

Metadata (somente leitura). Segundos decorridos desde `start()`.

```php
public private(set) float $percent
```

Metadata (somente leitura). Progresso rumo ao zero (0–100).

```php
public private(set) bool $finished
```

Metadata (somente leitura). `true` após a contagem finalizar.

### start()

```php
public function start (string $description = ''): void
```

Arma a contagem (`remaining = seconds`), reserva as linhas do frame, esconde o cursor e pinta o primeiro frame. Saída não interativa pinta uma vez.

### tick()

```php
public function tick (): void
```

Recalcula o tempo restante pelo relógio de parede e repinta (com throttle). Chegar a zero invoca `finish()`.

### run()

```php
public function run (string $description = ''): void
```

Roda a contagem sincronamente (start + loop de tick) até finalizar.

### describe()

```php
public function describe (string $description): void
```

Atualiza a descrição da contagem (limpa textos mais curtos com padding).

### finish()

```php
public function finish (): void
```

Força o frame final (remaining `0`, percent `100`), mostra o cursor e invoca o `Handler` uma vez. Idempotente; um Timer nunca iniciado é no-op.
