# Componente Timeline

O componente `Timeline` renderiza um fluxo guiado multi-etapas com estado por etapa — pending, active, done ou failed — como uma lista vertical conectada por `│`. Terminais interativos repintam o frame no lugar conforme o fluxo avança; saída não interativa (pipes, CI) anexa uma linha simples por transição, mantendo os logs limpos. O wizard do `bootgly project create` o usa para acompanhar suas fases.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Components/Timeline/showcase).

## Instância

Para usar o componente, é necessário criar uma instância passando como parâmetro a instância do componente `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Timeline;

$Timeline = new Timeline(CLI->Terminal->Output);
```

## Declarando etapas e avançando

Adicione as etapas antes, `start()` ativa a primeira, e `advance()` após cada fase concluir (opcionalmente anotando-a). Avançar além da última etapa finaliza o fluxo:

```php
$Timeline->add('Resolve');
$Timeline->add('Download');
$Timeline->add('Deploy');

$Timeline->start();      // ◉ Resolve

resolve();
$Timeline->advance('12 packages'); // ✔ Resolve (12 packages) · ◉ Download

download();
$Timeline->advance();

deploy();
$Timeline->advance('v1.0.0 live'); // fluxo completo
```

## Falhando uma etapa

`fail()` marca a etapa ativa como falha e para o fluxo — etapas seguintes permanecem pendentes:

```php
if ($error !== null) {
   $Timeline->fail('permission denied'); // ✖ Download (permission denied)

   return;
}
```

## Fluxos que escrevem entre etapas

O repaint no lugar assume que nada mais escreve no terminal entre transições. Para fluxos que perguntam ou imprimem entre etapas — como o wizard de projetos — defina `append` e cada transição imprime uma linha simples, preservando a saída ao redor:

```php
$Timeline->append = true;
```

## Saída não interativa

Em pipes e CI a timeline é sempre append-only: uma linha `✔`/`◉`/`✖` por transição, sem conectores, sem repaints — determinístico.

## Referência

### Propriedades

```php
public array $glyphs
```

Config. Os glifos de estado, chaveados por `pending`, `active`, `done` e `failed`. Padrão: `○ ◉ ✔ ✖`.

```php
public bool $append
```

Config. Transições append-only (uma linha simples cada) mesmo em terminais interativos — para fluxos que escrevem saída entre etapas. Padrão: `false`.

```php
public Steps $Steps
```

Data. A coleção de `Step` (array `$Steps->Steps`, `$Steps->count`, `$Steps->current`). Cada `Step` expõe `public string $label`, `public private(set) States $State` e `public private(set) string $note`.

```php
public private(set) bool $finished
```

Metadata (somente leitura). `true` após o fluxo completar ou falhar.

### States

```php
enum Bootgly\CLI\UI\Components\Timeline\States
{
   case Pending;
   case Active;
   case Done;
   case Failed;
}
```

O estado por etapa.

### add()

```php
public function add (string $label): Step
```

Adiciona uma etapa à timeline e a retorna.

### start()

```php
public function start (): void
```

Ativa a primeira etapa e pinta o frame (ou anexa sua linha).

### advance()

```php
public function advance (string $note = ''): void
```

Completa a etapa ativa (anotando-a com `note`) e ativa a próxima. Avançar além da última etapa finaliza o fluxo.

### fail()

```php
public function fail (string $note = ''): void
```

Marca a etapa ativa como falha e para o fluxo.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza o frame da timeline — compostos (como o [Wizard](/manual/CLI/UX/Wizard/overview)) obtêm o frame de markup raw com `RETURN_OUTPUT` e assumem a apresentação.

### Steps->insert()

```php
public function insert (string $label, int $at): Step
```

Insere um Step em uma posição 0-based — os Steps seguintes deslocam para frente; posições no Step atual ou antes dele são ajustadas para logo depois dele (o prefixo já percorrido é imutável).
