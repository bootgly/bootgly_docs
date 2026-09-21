# Monitor

Construa o **Monitor**, um dashboard de sistema ao vivo para o seu terminal: medidores de CPU e memória com um sparkline do histórico de CPU, os processos que mais usam memória e o uso de cada disco montado — três telas trocadas com uma tecla, mais uma barra de status, uma sobreposição de ajuda e uma paleta de comandos que a plataforma Console te dá de graça.

Você vai escrever 8 arquivos curtos (uns 20 minutos) e aprender como um `Console\App` inicia, como telas são arquivos simples que devolvem uma string, como funcionam os atalhos e a barra de status, como os widgets do core renderizam dentro de uma tela e como um projeto é testado com `bootgly test`.

```text
CPU                                                       12.5%
■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■

Memory                                     11.0 GB / 15.5 GB
■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■

 Load average  1.11  0.75  0.47
 CPU history   ▁▆▅█▅▃▂▂▄

 Press r to refresh — the status bar lists the screens, ? lists every key.

 Monitor  ▏ omni          1 Overview · 2 Processes · 3 Disks  ? help · q quit
```

<d-block-stepper>
  <d-block-step title="Instale o Bootgly">

Um comando instala tudo no Linux (ou WSL2): ele verifica **git** e **PHP 8.4+**, oferece instalar o que faltar pelo seu gerenciador de pacotes e clona o Bootgly Kit em `./bootgly.kit`. `--no-wizard` pula o wizard interativo de projetos — o próximo passo cria o projeto com um comando explícito.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash -s -- --no-wizard
cd bootgly.kit
```

> [!TIP]
> O instalador também pergunta se deve instalar o comando `bootgly` globalmente — qualquer resposta serve, todas as páginas aqui usam `php bootgly …`. Já tem um kit? O instalador retoma o que encontrar em `./bootgly.kit` e oferece movê-lo para a release atual — aceite, estas páginas assumem a 1.0.2 ou mais nova — depois entre nele com `cd` e vá para o próximo passo. Todos os comandos abaixo rodam da pasta do kit como `php bootgly …` — se você instalou a CLI globalmente (`php bootgly setup`), `bootgly …` também funciona. O guia [Começando](/guide/getting-started/overview/) explica o instalador e a estrutura do kit.

  </d-block-step>

  <d-block-step title="Crie o projeto">

Crie um projeto **CLI** chamado `Monitor` na plataforma **Console**. Na primeira execução isso também configura a plataforma (o submódulo git e os exemplos embarcados), então leva um momento:

```bash :toolbar="true";
php bootgly projects create Monitor --platform=console --interfaces=CLI --yes
```

O projeto nasce em `projects/Monitor/` — um repositório git próprio (o scaffold vira o primeiro commit assim que o git souber seu nome e e-mail):

```text
projects/Monitor/
├── .gitignore
├── Monitor.Project.php     ← a assinatura do projeto: metadados + a função de boot
├── schedule.php            ← tarefas estilo cron (não usadas aqui)
└── tests/
    ├── autoboot.php        ← o registro de testes do projeto
    └── example/            ← uma suíte de exemplo (removida do registro no último passo; apague quando quiser)
```

Tudo o que você escrever a seguir vai dentro de `projects/Monitor/`.

  </d-block-step>

  <d-block-step title="Escreva as sondas do sistema">

O dashboard lê os arquivos do `/proc` do Linux: `/proc/stat` para o tempo de CPU, `/proc/meminfo` e `/proc/loadavg` para memória e carga, `/proc/[pid]/stat` para processos e `/proc/mounts` para discos. Uma classe simples mantém isso fora das telas.

As telas são renderizadas muitas vezes por segundo, então cada sonda relê no máximo uma vez por segundo (`elapse()`) e devolve a última leitura no intervalo:

**Arquivo** `projects/Monitor/System.php`

```php :filename="projects/Monitor/System.php";
<?php

namespace Monitor;


use const FILE_IGNORE_NEW_LINES;
use function array_slice;
use function array_sum;
use function array_values;
use function basename;
use function count;
use function dirname;
use function disk_free_space;
use function disk_total_space;
use function explode;
use function file;
use function file_get_contents;
use function glob;
use function hrtime;
use function in_array;
use function is_dir;
use function max;
use function preg_match;
use function preg_split;
use function round;
use function sprintf;
use function str_replace;
use function str_starts_with;
use function strpos;
use function strrpos;
use function substr;
use function trim;
use function usort;


/**
 * System probes over /proc — CPU, memory, load, processes and disks.
 * Every probe re-reads at most once per `$interval` seconds, so screens
 * can call them on every frame.
 */
class System
{
   // * Config
   /** Seconds between two readings of the same probe */
   public float $interval = 1.0;
   /** CPU history length (samples) */
   public int $depth = 40;

   // * Data
   /** CPU usage since the previous sample (%) */
   public float $CPU = 0.0;
   /** @var array<int,float> Recent CPU samples (%) */
   public array $history = [];
   /** @var array<int,float> Load average (1, 5, 15 min) */
   public array $load = [0.0, 0.0, 0.0];
   /** @var array{total:int,used:int,available:int} Memory in KB */
   public array $memory = ['total' => 0, 'used' => 0, 'available' => 0];

   // * Metadata
   /** @var array<string,float> Last reading time per probe (seconds) */
   private array $readings = [];
   private int $busy = 0;
   private int $total = 0;
   /** @var array<int,array{pid:int,name:string,state:string,rss:int,cpu:float}> */
   private array $processes = [];
   /** @var array<int,array{mount:string,type:string,total:float,used:float,percent:float}> */
   private array $disks = [];


   /**
    * Sample CPU, load average and memory.
    */
   public function sample (): void
   {
      // ?
      if ($this->elapse('sample') === false) {
         return;
      }

      // @ CPU — /proc/stat first line: cpu user nice system idle iowait irq softirq steal
      $line = file('/proc/stat', FILE_IGNORE_NEW_LINES)[0] ?? 'cpu';
      $fields = preg_split('/\s+/', trim($line)) ?: [];
      $values = [];
      foreach (array_slice($fields, 1) as $field) {
         $values[] = (int) $field;
      }
      $total = array_sum($values);
      $busy = $total - ($values[3] ?? 0) - ($values[4] ?? 0);
      if ($this->total > 0 && $total > $this->total) {
         $this->CPU = round(($busy - $this->busy) / ($total - $this->total) * 100, 1);
      }
      $this->total = $total;
      $this->busy = $busy;
      $this->history[] = $this->CPU;
      $this->history = array_slice($this->history, -$this->depth);

      // @ Load average
      $load = explode(' ', trim((string) file_get_contents('/proc/loadavg')));
      $this->load = [(float) ($load[0] ?? 0), (float) ($load[1] ?? 0), (float) ($load[2] ?? 0)];

      // @ Memory — /proc/meminfo in KB
      $info = [];
      foreach (file('/proc/meminfo', FILE_IGNORE_NEW_LINES) ?: [] as $row) {
         if (preg_match('/^(\w+):\s+(\d+)/', $row, $matches) === 1) {
            $info[$matches[1]] = (int) $matches[2];
         }
      }
      $total = $info['MemTotal'] ?? 0;
      $available = $info['MemAvailable'] ?? 0;
      $this->memory = ['total' => $total, 'used' => $total - $available, 'available' => $available];
   }

   /**
    * Rank processes by resident memory.
    *
    * @return array<int,array{pid:int,name:string,state:string,rss:int,cpu:float}>
    */
   public function rank (int $limit = 15): array
   {
      // ?
      if ($this->elapse('rank') === false) {
         return array_slice($this->processes, 0, $limit);
      }

      $uptime = (float) explode(' ', (string) file_get_contents('/proc/uptime'))[0];
      $ticks = 100;  // clock ticks per second (Linux default)
      $page = 4096;  // bytes per memory page

      $processes = [];
      foreach (glob('/proc/[0-9]*/stat') ?: [] as $file) {
         $stat = file_get_contents($file);
         if ($stat === false) {
            continue;
         }

         // ! The name sits in parentheses and may contain spaces
         $open = (int) strpos($stat, '(');
         $close = (int) strrpos($stat, ')');
         $name = substr($stat, $open + 1, $close - $open - 1);
         $fields = explode(' ', trim(substr($stat, $close + 2)));
         // after the name: 0 state … 11 utime, 12 stime … 19 starttime … 21 rss
         if (count($fields) < 22) {
            continue;
         }

         $elapsed = max($uptime - (int) $fields[19] / $ticks, 1.0);

         $processes[] = [
            'pid' => (int) basename(dirname($file)),
            'name' => $name,
            'state' => $fields[0],
            'rss' => (int) $fields[21] * $page,
            'cpu' => round(((int) $fields[11] + (int) $fields[12]) / $ticks / $elapsed * 100, 1)
         ];
      }
      usort($processes, static fn (array $a, array $b): int => $b['rss'] <=> $a['rss']);

      $this->processes = $processes;

      return array_slice($processes, 0, $limit);
   }

   /**
    * Measure the usage of the mounted filesystems.
    *
    * @return array<int,array{mount:string,type:string,total:float,used:float,percent:float}>
    */
   public function measure (): array
   {
      // ?
      if ($this->elapse('measure') === false) {
         return $this->disks;
      }

      // ! Block devices, plus the root filesystems containers and VMs mount without one —
      //   minus read-only images (snaps, discs), which always read as 100% full
      $roots = ['overlay', 'fuse.fuse-overlayfs', 'virtiofs', '9p', 'erofs'];
      $images = ['squashfs', 'iso9660'];

      $disks = [];
      foreach (file('/proc/mounts', FILE_IGNORE_NEW_LINES) ?: [] as $row) {
         [$device, $mount, $type] = explode(' ', $row) + [1 => '', 2 => ''];
         $mount = str_replace('\\040', ' ', $mount);

         if (
            (str_starts_with($device, '/dev/') === false && in_array($type, $roots, true) === false)
            || in_array($type, $images, true) || isset($disks[$mount]) || is_dir($mount) === false
         ) {
            continue;
         }

         $total = (float) disk_total_space($mount);
         $free = (float) disk_free_space($mount);
         if ($total <= 0.0) {
            continue;
         }

         $disks[$mount] = [
            'mount' => $mount,
            'type' => $type,
            'total' => $total,
            'used' => $total - $free,
            'percent' => round(($total - $free) / $total * 100, 1)
         ];
      }

      $this->disks = array_values($disks);

      return $this->disks;
   }

   /**
    * Forget the reading times, so the next call of every probe reads again.
    */
   public function reset (): void
   {
      $this->readings = [];
   }

   /**
    * Format bytes for humans (KB, MB, GB, TB).
    */
   public function format (float $bytes): string
   {
      foreach (['B', 'KB', 'MB', 'GB', 'TB'] as $unit) {
         if ($bytes < 1024.0 || $unit === 'TB') {
            return sprintf($unit === 'B' ? '%d %s' : '%.1f %s', $bytes, $unit);
         }
         $bytes /= 1024.0;
      }

      return '';
   }

   // ---

   /**
    * Check whether `$interval` seconds elapsed since the probe's last reading
    * — and stamp the reading when they did.
    */
   private function elapse (string $probe): bool
   {
      $now = hrtime(true) / 1e9;
      $last = $this->readings[$probe] ?? 0.0;

      // ?
      if ($last > 0.0 && $now - $last < $this->interval) {
         return false;
      }

      $this->readings[$probe] = $now;

      return true;
   }
}
```

`namespace Monitor;` espelha a pasta do projeto — é assim que o Bootgly carrega suas classes (`projects/Monitor/System.php` é `Monitor\System`). Os imports `use function …` são o estilo Bootgly para funções globais dentro de um namespace.

  </d-block-step>

  <d-block-step title="Escreva a classe do app">

`Console\App` é o shell TUI: tela alternativa, entrada de teclado em modo raw, um loop de renderização, a barra de status, toasts, a sobreposição de ajuda (`?`) e a paleta de comandos (`Ctrl+P`). Estenda-o para que toda tela alcance as mesmas sondas por `$App->System`:

**Arquivo** `projects/Monitor/Monitor.php`

```php :filename="projects/Monitor/Monitor.php";
<?php

namespace Monitor;


use Console\App;


/**
 * The Monitor app — the Console App shell carrying the System probes,
 * so every screen reads the same samples through `$App->System`.
 */
class Monitor extends App
{
   // * Data
   public System $System;


   public function __construct ()
   {
      parent::__construct();

      $this->System = new System;
      $this->System->sample(); // baseline — the first frame already shows a CPU delta
   }
}
```

O construtor colhe uma primeira amostra na hora, então o primeiro frame já mostra um delta de CPU.

  </d-block-step>

  <d-block-step title="Escreva a assinatura do projeto">

Substitua o `Monitor.Project.php` gerado. A função `boot` é o que `php bootgly project Monitor start` executa: ela carrega a pasta de telas, associa uma tecla numérica por tela cujo arquivo já existe (`is_file` — assim uma tecla nunca aponta para uma tela que você ainda não escreveu), preenche a barra de status com essas teclas e entrega o controle ao loop do app.

**Arquivo** `projects/Monitor/Monitor.Project.php`

```php :filename="projects/Monitor/Monitor.Project.php";
<?php

use Bootgly\API\Projects\Project;

use Monitor\Monitor;


return new Project(
   // # Project Metadata
   name: 'Monitor',
   description: 'Live system dashboard — Console platform App',
   version: '1.0.0',
   author: 'Cookbook',
   exportable: true,

   // # Project Boot Function
   boot: function (array $arguments = [], array $options = []): void
   {
      $App = new Monitor;

      // @ Screens (one file per screen in screens/)
      $App->Screens->load(__DIR__ . '/screens');

      // @ Keymaps — one number per screen whose file exists (q, ? and Ctrl+P come with the shell)
      $labels = [];
      foreach (['1' => 'Overview', '2' => 'Processes', '3' => 'Disks'] as $key => $screen) {
         if (is_file(__DIR__ . "/screens/{$screen}.php") === true) {
            $App->Keymaps->bind($key, $screen, fn () => $App->Screens->switch($screen));
            $labels[] = "{$key} {$screen}";
         }
      }
      $App->Keymaps->bind('r', 'Refresh now', function () use ($App): void {
         $App->System->reset();
         $App->Toasts->add('Refreshed');
      });

      // @ Status bar
      $App->Statusbar->left = ['Monitor', gethostname()];
      $App->Statusbar->right = [implode(' · ', $labels), '? help · q quit'];

      $App->boot();
      $App->run('Overview');
   }
);
```

`boot()` instala três atalhos próprios — `q` sai, `?` abre a sobreposição de ajuda gerada a partir dos seus atalhos e `Ctrl+P` abre a paleta — e `run('Overview')` escolhe a primeira tela.

  </d-block-step>

  <d-block-step title="Escreva a primeira tela">

As telas vivem em `screens/`: um manifesto com os três nomes de tela mais um arquivo por tela — o manifesto pode nomear um arquivo antes de você escrevê-lo, a função de boot só associa as teclas dos arquivos que existem:

**Arquivo** `projects/Monitor/screens/screens.index.php`

```php :filename="projects/Monitor/screens/screens.index.php";
<?php

return [
   'Overview',
   'Processes',
   'Disks'
];
```

Uma tela é uma closure que recebe o app e o seu objeto `Screen`, e devolve o conteúdo do frame como string — uma linha por fileira; o app ajusta cada linha à largura do terminal.

A tela **Overview** renderiza dois widgets do core — um medidor `Meter` para CPU e memória e um `Sparkline` para o histórico de CPU. Qualquer widget não interativo renderiza para uma string com `Component::RETURN_OUTPUT`, e assim pode fazer parte do frame:

**Arquivo** `projects/Monitor/screens/Overview.php`

```php :filename="projects/Monitor/screens/Overview.php";
<?php

use Bootgly\API\Component;
use Bootgly\CLI\Terminal;
use Bootgly\CLI\UI\Components\Chart\Gradient;
use Bootgly\CLI\UI\Components\Charts\Meter;
use Bootgly\CLI\UI\Components\Charts\Sparkline;
use Console\App\Screens\Screen;

use Monitor\Monitor;


return static function (Monitor $App, Screen $Screen): string {
   $System = $App->System;
   $System->sample();

   $width = max(20, min(Terminal::$width - 4, 60));
   $Gradient = new Gradient(['#00c853', '#ffd600', '#ff1744']);

   // @ CPU gauge
   $CPU = new Meter($App->Output);
   $CPU->width = $width;
   $CPU->Gradient = $Gradient;
   $CPU->heading = '@#White:CPU@;';
   $CPU->summary = "{$System->CPU}%";
   $CPU->value = $System->CPU;

   // @ Memory gauge
   $memory = $System->memory;
   $percent = $memory['total'] > 0 ? round($memory['used'] / $memory['total'] * 100, 1) : 0.0;

   $Memory = new Meter($App->Output);
   $Memory->width = $width;
   $Memory->Gradient = $Gradient;
   $Memory->heading = '@#White:Memory@;';
   $Memory->summary = $System->format($memory['used'] * 1024) . ' / ' . $System->format($memory['total'] * 1024);
   $Memory->value = $percent;

   // @ CPU history
   $History = new Sparkline($App->Output);
   $History->series = $System->history;

   return implode("\n", [
      '',
      (string) $CPU->render(Component::RETURN_OUTPUT),
      '',
      (string) $Memory->render(Component::RETURN_OUTPUT),
      '',
      ' Load average  ' . implode('  ', $System->load),
      ' CPU history   ' . (string) $History->render(Component::RETURN_OUTPUT),
      '',
      ' Press r to refresh — the status bar lists the screens, ? lists every key.'
   ]);
};
```

  </d-block-step>

  <d-block-step title="Rode">

Inicie o projeto a partir da pasta do kit:

```bash :toolbar="true";
php bootgly project Monitor start
```

O terminal muda para a tela alternativa e você vê o Overview atualizando a cada segundo. Pressione `?` para a ajuda, `Ctrl+P` para a paleta, `r` para atualizar na hora e `q` para sair — o seu shell volta exatamente como estava, scrollback incluído.

> [!NOTE]
> Sem um terminal (um pipe, CI, um agente de IA) o app renderiza um único frame e sai, então `php bootgly project Monitor start | head` é um jeito seguro de conferir uma tela.

A barra de status mostra só `1 Overview`: as outras duas teclas aparecem assim que os arquivos das telas existirem, nos próximos dois passos.

  </d-block-step>

  <d-block-step title="Adicione a tela Processes">

Ordene os processos por memória residente e renderize-os como tabela. O widget `Markdown` transforma uma tabela Markdown em uma tabela de terminal alinhada, então a tela só monta texto:

**Arquivo** `projects/Monitor/screens/Processes.php`

```php :filename="projects/Monitor/screens/Processes.php";
<?php

use Bootgly\API\Component;
use Bootgly\CLI\Terminal;
use Bootgly\CLI\UI\Components\Markdown;
use Console\App\Screens\Screen;

use Monitor\Monitor;


return static function (Monitor $App, Screen $Screen): string {
   $System = $App->System;
   $limit = max(5, Terminal::$height - 6);

   $source = "| PID | Name | State | Memory | CPU % |\n";
   $source .= "|----:|:-----|:-----:|-------:|------:|\n";
   foreach ($System->rank($limit) as $process) {
      $source .= sprintf(
         "| %d | %s | %s | %s | %.1f |\n",
         $process['pid'],
         $process['name'],
         $process['state'],
         $System->format($process['rss']),
         $process['cpu']
      );
   }

   $Markdown = new Markdown($App->Output);
   $Markdown->source = $source;

   return (string) $Markdown->render(Component::RETURN_OUTPUT);
};
```

`Terminal::$height` mantém a lista dentro do painel (a barra de status ocupa a última fileira).

  </d-block-step>

  <d-block-step title="Adicione a tela Disks">

Um medidor por sistema de arquivos montado, com os rótulos de canto que o `Meter` oferece — heading e summary acima da barra, caption e note abaixo:

**Arquivo** `projects/Monitor/screens/Disks.php`

```php :filename="projects/Monitor/screens/Disks.php";
<?php

use Bootgly\API\Component;
use Bootgly\CLI\Terminal;
use Bootgly\CLI\UI\Components\Chart\Gradient;
use Bootgly\CLI\UI\Components\Charts\Meter;
use Console\App\Screens\Screen;

use Monitor\Monitor;


return static function (Monitor $App, Screen $Screen): string {
   $System = $App->System;
   $width = max(20, min(Terminal::$width - 4, 60));
   $Gradient = new Gradient(['#00c853', '#ffd600', '#ff1744']);

   $lines = [''];
   foreach ($System->measure() as $disk) {
      $Meter = new Meter($App->Output);
      $Meter->width = $width;
      $Meter->Gradient = $Gradient;
      $Meter->heading = "@#White:{$disk['mount']}@; ({$disk['type']})";
      $Meter->summary = "{$disk['percent']}%";
      $Meter->caption = $System->format($disk['used']) . ' used';
      $Meter->note = $System->format($disk['total']) . ' total';
      $Meter->value = $disk['percent'];

      $lines[] = (string) $Meter->render(Component::RETURN_OUTPUT);
      $lines[] = '';
   }

   return implode("\n", $lines);
};
```

Inicie o projeto de novo e pressione `2` e `3`:

```bash :toolbar="true";
php bootgly project Monitor start
```

```text
    PID │ Name         │ State │   Memory │ CPU %
────────┼──────────────┼───────┼──────────┼───────
  97750 │ node         │   S   │   1.0 GB │   2.7
  18216 │ msedge       │   S   │ 781.4 MB │   2.7
   3274 │ plasmashell  │   S   │ 516.6 MB │   0.9
```

  </d-block-step>

  <d-block-step title="Teste">

Um projeto carrega as próprias suítes. Substitua o registro gerado para que ele liste uma suíte `System`, depois escreva a suíte e um teste — a API Básica é um generator que faz `yield` de um `assert()` nativo por verificação:

**Arquivo** `projects/Monitor/tests/autoboot.php`

```php :filename="projects/Monitor/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/system/',
   ]
);
```

**Arquivo** `projects/Monitor/tests/system/autoboot.php`

```php :filename="projects/Monitor/tests/system/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suite;


return new Suite(
   // * Config
   autoBoot: __DIR__,
   autoInstance: true,
   autoReport: true,
   autoSummarize: true,
   exitOnFailure: true,
   // * Data
   suiteName: 'System',
   tests: [
      '1.1-probes',
   ]
);
```

**Arquivo** `projects/Monitor/tests/system/1.1-probes.Test.php`

```php :filename="projects/Monitor/tests/system/1.1-probes.Test.php";
<?php

use Bootgly\ACI\Tests\Suite\Test;

use Monitor\System;


return new Test(
   description: 'System probes read /proc',
   test: function () {
      $System = new System;
      $System->sample();

      yield assert(
         assertion: $System->memory['total'] > 0,
         description: 'memory total is known'
      );

      // @ A second reading (the interval waived) gives the first CPU delta
      usleep(50_000);
      $System->reset();
      $System->sample();
      yield assert(
         assertion: count($System->history) === 2 && $System->CPU >= 0.0 && $System->CPU <= 100.0,
         description: 'the second sample yields a CPU usage within 0..100 %'
      );

      $processes = $System->rank(5);
      yield assert(
         assertion: count($processes) > 0 && count($processes) <= 5,
         description: 'ranks at most 5 processes'
      );

      yield assert(
         assertion: $System->measure() !== [],
         description: 'measures at least one filesystem'
      );
   }
);
```

Rode as suítes do projeto de dentro da pasta dele — o launcher está dois níveis acima, na raiz do kit:

```bash :toolbar="true";
cd projects/Monitor && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Próximos passos

- Adicione uma tela: crie `screens/Network.php` (leia `/proc/net/dev`), liste-a em `screens/screens.index.php` e associe uma tecla em `Monitor.Project.php`.
- Empilhe uma tela em vez de trocar — `$App->Screens->push('Details', ['pid' => 42])` a sobrepõe e `pop()` volta; a tela empilhada lê `$Screen->state['pid']`.
- Acompanhe um log dentro do app com o widget `Tail`, ou troque a tabela de processos por um gráfico `Bars`.
- Faça commit do seu trabalho: o projeto é um repositório git próprio — `git -C projects/Monitor status`; se o commit do scaffold foi pulado, defina `git config --global user.name`/`user.email` e rode `git -C projects/Monitor commit -m "chore: scaffold"`.

## Referência

- [Console App](/manual/Console/App/overview/) — `App`, `Screens`, `Router`, `Keymaps`, `Statusbar`, `Toasts`, `Palette`, `Tail`.
- [Charts](/manual/CLI/UI/Components/Charts/overview/) — `Meter`, `Sparkline`, `Bars`, `Graph` e `Gradient`.
- [Markdown](/manual/CLI/UI/Components/Markdown/overview/) — o renderizador de Markdown para terminal usado na tabela de processos.
- [Projects](/manual/Bootgly/essential/projects/overview/) — flags de `projects create`, a assinatura do projeto e os namespaces do autoloader.
- [Testes](/testing/about/testing/overview/) — suítes, as APIs de asserção Básica e Avançada e `bootgly test`.
