# Storage

O Bootgly traz uma camada de storage nativa e sem dependências em
`Bootgly\ABI\Resources\Storage`. Um facade, **disks** nomeados e **drivers** plugáveis —
**Local** (sistema de arquivos), **Memory** (em processo) e **S3** (remoto) já inclusos —
atrás de uma única API de arquivos: `write`, `read`, `check`, `list`, `copy`, `move`,
`delete` e mais.

**`write` e `read` trabalham com streams.** O `write` recebe um stream *legível* como origem
e o `read` despeja o arquivo armazenado em um stream *gravável* que você fornece. Os bytes
trafegam em pedaços limitados, então mesmo um arquivo de vários gigabytes nunca cai inteiro na
memória do PHP.

> [!NOTE]
> A pasta de dados de runtime do Bootgly é `storage/` (renomeada de `workdata/`). Seu caminho
> absoluto é a constante `BOOTGLY_STORAGE_DIR`, que você pode pré-definir antes do boot (por
> exemplo, apontando para um volume montado). O disk **local** padrão é ancorado nela.

## Armazenar e buscar arquivos

`write(path, $source)` copia um **stream legível** para o storage; `read(path, $sink)` copia
o arquivo armazenado para um **stream gravável**. As origens e destinos naturais são os que
você já tem em mãos — um upload, um arquivo aberto, o corpo da requisição ou da resposta:

```php
use Bootgly\ABI\Resources\Storage;

$Storage = new Storage();   // disk 'local' padrão, ancorado em storage/

// armazena o corpo bruto da requisição sem bufferizá-lo na memória
$Storage->write('uploads/avatar.png', fopen('php://input', 'r'));

// transmite um arquivo armazenado direto para a resposta (ou qualquer stream gravável)
$Storage->read('uploads/avatar.png', fopen('php://output', 'w'));

$Storage->check('uploads/avatar.png');   // true enquanto o caminho existir
$Storage->delete('uploads/avatar.png');
```

`write()` retorna `true` em caso de sucesso e é atômico no disk local (arquivo temporário +
rename), então leitores nunca veem um arquivo escrito pela metade. `read()` retorna `false`
quando o caminho está ausente ou ilegível (e nada é escrito no sink).

### Strings pequenas

Quando você só tem uma string, envolva-a em um stream em memória; para capturar um arquivo
pequeno, leia para dentro de um e rebobine:

```php
// escrever uma string
$source = fopen('php://temp', 'r+');
fwrite($source, 'olá');
rewind($source);
$Storage->write('reports/daily.txt', $source);

// ler de volta para uma string
$sink = fopen('php://temp', 'r+');
$Storage->read('reports/daily.txt', $sink);
rewind($sink);
$body = stream_get_contents($sink);   // 'olá'
```

Por brevidade, os exemplos abaixo geram strings com este pequeno helper:

```php
function stream (string $contents) {
   $Stream = fopen('php://temp', 'r+');
   fwrite($Stream, $contents);
   rewind($Stream);
   return $Stream;
}
```

## Listar, copiar, mover

```php
$Storage->write('a.txt', stream('1'));
$Storage->write('logs/app.log', stream('...'));

$Storage->list();          // ['a.txt']                  — apenas arquivos imediatos
$Storage->list('', true);  // ['a.txt', 'logs/app.log']  — recursivo, relativo ao disk

$Storage->copy('a.txt', 'backup/a.txt');
$Storage->move('a.txt', 'archive/a.txt');   // origem removida
```

`list()` retorna caminhos relativos ao disk. Passe `recursive: true` para percorrer
subdiretórios.

## Inspecionar e gerenciar

```php
$Storage->measure('archive/a.txt');     // bytes, ou false quando ausente
$Storage->inspect('archive/a.txt');     // ['size' => …, 'modified' => …] ou false

$Storage->make('exports');             // cria um diretório (recursivamente)
$Storage->clear('exports');            // esvazia um diretório, mantendo-o
$Storage->clear();                     // esvazia o disk inteiro
```

## Arquivos grandes

Como `write`/`read` trabalham com streams por design, o pico de memória é limitado pelo
tamanho do pedaço, não pelo tamanho do arquivo:

- **Local** copia via `stream_copy_to_stream` com um buffer de tamanho fixo.
- **S3** envia um objeto pequeno em uma única requisição e troca automaticamente para um
  **Multipart Upload** quando o objeto é grande — partes de ~16 MiB, então o pico de memória
  fica em torno de uma parte, independente do total. Downloads transmitem a resposta direto
  para o seu sink.

```php
// envia um export de vários GB para o S3 sem bufferizá-lo
$Storage->open('cdn')->write('exports/2026.csv', fopen('/data/2026.csv', 'r'));

// transmite de volta para um arquivo local
$Storage->open('cdn')->read('exports/2026.csv', fopen('/data/restore.csv', 'w'));
```

> [!NOTE]
> O driver **Memory** mantém os objetos em um array PHP, então ele bufferiza valores inteiros
> por natureza — use-o para testes e dados pequenos por requisição, não para arquivos grandes.

## Persistir um upload HTTP

No servidor HTTP um upload `multipart/form-data` é transmitido para um arquivo temporário conforme
chega; o `$Request->store()` então move esse arquivo temporário para um disco do Storage — Local,
S3 ou qualquer driver registrado — transmitindo os bytes (memória constante) e removendo o
temporário em caso de sucesso:

```php
use Bootgly\ABI\Resources\Storage;

$Storage = new Storage([
   'disks' => ['uploads' => ['driver' => 's3', 'bucket' => 'assets', /* … */]],
]);

// em um handler de rota
$Request->download();
$path = $Request->store('avatar', 'users/1/avatar.png', $Storage->open('uploads'));
// o caminho armazenado em caso de sucesso, false caso contrário — o motivo fica no `error` do disk
```

O `store()` repassa as mesmas opções de escrita do driver (`type`/`meta` do S3), e um upload grande
para o S3 usa o caminho multipart automático, então a memória do worker permanece limitada
independentemente do tamanho do arquivo. Veja a
[referência do Request](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/) para a assinatura completa.

## Múltiplos disks

Um disk é um driver nomeado mais suas opções. Configure quantos precisar e acesse-os pelo
nome com `open()`; o disk padrão é o que sustenta os próprios métodos do facade:

```php
$Storage = new Storage([
   'default' => 'local',
   'disks' => [
      'local'   => ['driver' => 'local', 'root' => BOOTGLY_STORAGE_DIR],
      'uploads' => ['driver' => 'local', 'root' => BOOTGLY_STORAGE_DIR . 'uploads'],
      'scratch' => ['driver' => 'memory'],
   ],
]);

$Storage->write('x.txt', stream('...'));            // → disk 'local' padrão
$Storage->open('uploads')->write('y.txt', stream('...'));
$Storage->open('scratch')->write('z.txt', stream('...'));   // em processo, sem sistema de arquivos
```

O driver de cada disk é construído uma vez, sob demanda, no primeiro acesso e fica preso
(jailed) dentro do seu próprio `root`: travessias como `../` são normalizadas e fixadas, e um
check de `realpath()` rejeita symlinks que escapariam do root.

## Escolher um driver

| Driver | `driver` | Escopo | Use para |
|---|---|---|---|
| Local  | `local` (padrão) | Por host, em disco | Sempre disponível; padrão seguro |
| Memory | `memory` | Por processo, efêmero | Testes e espaço temporário por requisição |
| S3     | `s3` | Remoto (AWS / compatível com S3) | Object storage, CDNs, arquivos duráveis entre hosts |

### Amazon S3 (e compatíveis com S3)

O driver `s3` é **embutido** — fala a API REST do S3 sobre um socket bloqueante, assinado
com SigV4 nativo (sem SDK). Basta configurar um disk:

```php
use Bootgly\ABI\Resources\Storage;

$Storage = new Storage([
   'disks' => [
      'cdn' => [
         'driver' => 's3',
         'bucket' => 'assets',
         'region' => 'us-east-1',
         'key'    => '…',
         'secret' => '…',
         // Compatível com S3 (MinIO / Cloudflare R2 / Wasabi): aponte um endpoint próprio
         // 'endpoint'   => 'https://…',
         // 'path_style' => true,
         // 'insecure'   => true,   // exigido para permitir http:// ou verify => false (teste/MinIO)
      ],
   ],
]);

$Storage->open('cdn')->write('logo.png', fopen('logo.png', 'r'), ['type' => 'image/png']);
$Storage->open('cdn')->read('logo.png', fopen('php://output', 'w'));
```

Passe `type` (Content-Type) e `meta` (um mapa `x-amz-meta-*`) como opções de escrita para o
objeto ser servido corretamente; Local/Memory ignoram. Quando uma operação retorna `false`, o
motivo fica no driver — `$Storage->open('cdn')->error` (drivers não logam direto; a ABI não
pode depender do logger da ACI, então a falha é exposta para uma camada superior logar).

```php
$Storage->open('cdn')->write('report.csv', $source, ['type' => 'text/csv', 'meta' => ['owner' => 'reports']]);
```

O `root` de um disk funciona como prefixo de chave.

### Registre seu próprio driver

```php
$Storage->Drivers->register('custom', MyDriver::class);   // classe estende Storage\Driver
$Storage->Config->disks['x'] = ['driver' => 'custom'];
```

## Eventos

O facade emite eventos de domínio através do `Emitter::$Instance` compartilhado, então um
write/read/delete é observável com zero alocação quando ninguém está escutando:

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ABI\Resources\Storage\Events;

Emitter::$Instance->listen(Events::Written, function (Emission $Emission) {
   [$path, $written] = $Emission->payload;
});
Emitter::$Instance->listen(Events::Read, function (Emission $Emission) {
   [$path, $found] = $Emission->payload;
});
```

`Events::Written` carrega `[path, written]`, `Events::Read` carrega `[path, found]` e
`Events::Deleted` carrega `[path, deleted]`.

## Referência

### Facade

```php
public function open (string $name = ''): Driver
```

Abre um disk pelo nome, construindo o seu driver uma vez no primeiro acesso. Sem
argumento, retorna o disk padrão. Os próprios métodos de arquivo do facade (abaixo) delegam
ao disk padrão.

### Contrato do Driver

Drivers concretos estendem `Bootgly\ABI\Resources\Storage\Driver`. Todo caminho é relativo ao
disk e resolvido contra o `root` do driver. `$source`/`$sink` são resources de stream do PHP.

```php
public function write (string $path, $source, array $options = []): bool
```

Transmite o resource legível `$source` para `$path`, criando diretórios pai conforme
necessário. No S3 é um único PUT para objetos pequenos e um Multipart Upload automático
(partes em paralelo) para objetos grandes. `$options` são específicas do driver — o S3 lê
`type` (Content-Type) e `meta` (mapa `x-amz-meta-*`); Local/Memory ignoram. Retorna `true` em
caso de sucesso; em `false`, o motivo fica no driver (`$Storage->open()->error`).

```php
public function read (string $path, $sink): bool
```

Transmite o arquivo em `$path` para o resource gravável `$sink`. Retorna `false` quando o
caminho está ausente ou ilegível (nada é escrito em `$sink`), `true` caso contrário.

```php
public function delete (string $path): bool
```

Remove um arquivo. Retorna `true` quando o caminho não existe mais (um caminho ausente é um
sucesso no-op).

```php
public function check (string $path): bool
```

Se um arquivo ou diretório existe no caminho.

```php
public function list (string $path = '', bool $recursive = false): array
```

Lista caminhos de arquivo (relativos ao disk) sob um diretório. Com `recursive: true`,
percorre subdiretórios; caso contrário, retorna apenas os arquivos imediatos.

```php
public function copy (string $from, string $to): bool
```

Copia um arquivo dentro do disk, criando os diretórios pai do destino. Retorna `false` quando
a origem está ausente.

```php
public function move (string $from, string $to): bool
```

Move (renomeia) um arquivo dentro do disk. Retorna `false` quando a origem está ausente.

```php
public function measure (string $path): int|false
```

Tamanho do arquivo em bytes, ou `false` quando o caminho está ausente.

```php
public function inspect (string $path): array|false
```

Metadados do arquivo — `['size' => int, 'modified' => int]` (bytes e mtime Unix), ou `false`
quando o caminho está ausente.

```php
public function make (string $path): bool
```

Cria um diretório recursivamente. Retorna `true` quando ele existe ao final.

```php
public function clear (string $path = ''): bool
```

Remove toda entrada sob um diretório, mantendo o diretório em si. Sem argumento, esvazia o
disk inteiro.

### Camadas

- **Facade vs driver** — `Storage` expõe o registry `Drivers`
  (`$Storage->Drivers->register('name', MyDriver::class)`) e o cache de drivers por disk. Os
  drivers embutidos são `local`, `memory` e `s3`.
- **Componente ABI** — storage é um recurso da ABI, então o driver Local é bloqueante. Os
  caminhos internos de runtime do Bootgly (sessões, PIDs, cache, estado do schedule) usam a
  constante `BOOTGLY_STORAGE_DIR` diretamente, e não este facade, mantendo caminhos quentes e
  baseados em lock sem overhead.

## Próximas referências

- **[Cache](/guide/cache/overview/)** — o facade de recurso ABI irmão (TTL, tags, drivers).
- **[Configuração](/guide/configuration/overview/)** — carregue configs com escopo e valores `.env`.
- **[Docker](/guide/docker/overview/)** — persista `storage/` entre containers com um volume.
