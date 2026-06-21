# Storage

Bootgly ships a native, dependency-free storage layer at `Bootgly\ABI\Resources\Storage`.
One facade, named **disks**, and pluggable **drivers** — **Local** (filesystem), **Memory**
(in-process) and **S3** (remote) out of the box — behind a single file API: `write`, `read`,
`check`, `list`, `copy`, `move`, `delete`, and more.

**`write` and `read` are stream-based.** `write` takes a *readable* stream as its source and
`read` pumps the stored file into a *writable* stream you provide. Bytes move in bounded
chunks, so even a multi-gigabyte file never lands whole in PHP memory.

> [!NOTE]
> Bootgly's runtime data folder is `storage/` (renamed from `storage/`). Its absolute path
> is the `BOOTGLY_STORAGE_DIR` constant, which you can pre-define before boot (e.g. to point
> at a mounted volume). The default **local** disk is rooted there.

## Store and fetch files

`write(path, $source)` copies a **readable stream** into storage; `read(path, $sink)` copies
the stored file into a **writable stream**. The natural sources and sinks are the ones you
already have — an upload, an open file, the request or response body:

```php
use Bootgly\ABI\Resources\Storage;

$Storage = new Storage();   // default 'local' disk, rooted at storage/

// store the raw request body without buffering it in memory
$Storage->write('uploads/avatar.png', fopen('php://input', 'r'));

// stream a stored file straight to the response (or any writable stream)
$Storage->read('uploads/avatar.png', fopen('php://output', 'w'));

$Storage->check('uploads/avatar.png');   // true while the path exists
$Storage->delete('uploads/avatar.png');
```

`write()` returns `true` on success and is atomic on the local disk (temp file + rename), so
readers never observe a half-written file. `read()` returns `false` when the path is missing
or unreadable (and writes nothing to the sink).

### Small strings

When all you have is a string, wrap it in an in-memory stream; to capture a small file, read
into one and rewind:

```php
// write a string
$source = fopen('php://temp', 'r+');
fwrite($source, 'hello');
rewind($source);
$Storage->write('reports/daily.txt', $source);

// read back into a string
$sink = fopen('php://temp', 'r+');
$Storage->read('reports/daily.txt', $sink);
rewind($sink);
$body = stream_get_contents($sink);   // 'hello'
```

For brevity, the examples below seed strings with this tiny helper:

```php
function stream (string $contents) {
   $Stream = fopen('php://temp', 'r+');
   fwrite($Stream, $contents);
   rewind($Stream);
   return $Stream;
}
```

## List, copy, move

```php
$Storage->write('a.txt', stream('1'));
$Storage->write('logs/app.log', stream('...'));

$Storage->list();          // ['a.txt']                  — immediate files only
$Storage->list('', true);  // ['a.txt', 'logs/app.log']  — recursive, disk-relative

$Storage->copy('a.txt', 'backup/a.txt');
$Storage->move('a.txt', 'archive/a.txt');   // source removed
```

`list()` returns disk-relative paths. Pass `recursive: true` to walk subdirectories.

## Inspect and manage

```php
$Storage->measure('archive/a.txt');     // bytes, or false when missing
$Storage->inspect('archive/a.txt');     // ['size' => …, 'modified' => …] or false

$Storage->make('exports');             // create a directory (recursively)
$Storage->clear('exports');            // empty a directory, keeping it
$Storage->clear();                     // empty the whole disk
```

## Large files

Because `write`/`read` stream by design, peak memory is bounded by the chunk size, not the
file size:

- **Local** copies through `stream_copy_to_stream` with a fixed-size buffer.
- **S3** uploads a small object in a single request and automatically switches to a
  **Multipart Upload** for a large one — parts of ~16 MiB, so peak memory stays around one
  part regardless of the total. Downloads stream the response straight into your sink.

```php
// move a multi-GB export up to S3 without buffering it
$Storage->open('cdn')->write('exports/2026.csv', fopen('/data/2026.csv', 'r'));

// stream it back down to a local file
$Storage->open('cdn')->read('exports/2026.csv', fopen('/data/restore.csv', 'w'));
```

> [!NOTE]
> The **Memory** driver keeps objects in a PHP array, so it buffers whole values by nature —
> use it for tests and small, request-scoped data, not large files.

## Persist an HTTP upload

In the HTTP server a `multipart/form-data` upload is streamed to a temp file as it arrives;
`$Request->store()` then moves that temp file into a Storage disk — Local, S3, or any registered
driver — streaming the bytes (constant memory) and removing the temp on success:

```php
use Bootgly\ABI\Resources\Storage;

$Storage = new Storage([
   'disks' => ['uploads' => ['driver' => 's3', 'bucket' => 'assets', /* … */]],
]);

// in a route handler
$Request->download();
$path = $Request->store('avatar', 'users/1/avatar.png', $Storage->open('uploads'));
// the stored path on success, false otherwise — the reason is on the disk's `error`
```

`store()` forwards the same write options as the driver (S3 `type`/`meta`), and a large upload to
S3 takes the automatic multipart path, so worker memory stays bounded regardless of file size. See
the [Request reference](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/) for the full signature.

## Multiple disks

A disk is a named driver plus its options. Configure as many as you need and address them by
name with `open()`; the default disk backs the facade's own methods:

```php
$Storage = new Storage([
   'default' => 'local',
   'disks' => [
      'local'   => ['driver' => 'local', 'root' => BOOTGLY_STORAGE_DIR],
      'uploads' => ['driver' => 'local', 'root' => BOOTGLY_STORAGE_DIR . 'uploads'],
      'scratch' => ['driver' => 'memory'],
   ],
]);

$Storage->write('x.txt', stream('...'));            // → default 'local' disk
$Storage->open('uploads')->write('y.txt', stream('...'));
$Storage->open('scratch')->write('z.txt', stream('...'));   // in-process, no filesystem
```

Each disk's driver is built once, lazily, on first access and jailed inside its own `root`:
`../` traversal is normalized away and clamped, and a `realpath()` check rejects symlinks that
would escape the root.

## Choose a driver

| Driver | `driver` | Scope | Use it for |
|---|---|---|---|
| Local  | `local` (default) | Per-host, on disk | Always available; safe default |
| Memory | `memory` | Per-process, ephemeral | Tests and request-scoped scratch space |
| S3     | `s3` | Remote (AWS / S3-compatible) | Object storage, CDNs, cross-host durable files |

### Amazon S3 (and S3-compatible)

The `s3` driver is **built in** — it speaks the S3 REST API over a blocking socket, signed
with native SigV4 (no SDK). Just configure a disk:

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
         // S3-compatible (MinIO / Cloudflare R2 / Wasabi): point at a custom endpoint
         // 'endpoint'   => 'https://…',
         // 'path_style' => true,
         // 'insecure'   => true,   // required to allow http:// or verify => false (test/MinIO only)
      ],
   ],
]);

$Storage->open('cdn')->write('logo.png', fopen('logo.png', 'r'), ['type' => 'image/png']);
$Storage->open('cdn')->read('logo.png', fopen('php://output', 'w'));
```

Pass `type` (Content-Type) and `meta` (a `x-amz-meta-*` map) as write options so the stored
object is served correctly; Local/Memory ignore them. When an operation returns `false`, the
reason is on the driver — `$Storage->open('cdn')->error` (drivers can't log directly; ABI
cannot depend on the ACI logger, so failures are surfaced for a higher layer to log).

```php
$Storage->open('cdn')->write('report.csv', $source, ['type' => 'text/csv', 'meta' => ['owner' => 'reports']]);
```

A disk's `root` acts as a key prefix.

### Register your own driver

```php
$Storage->Drivers->register('custom', MyDriver::class);   // class extends Storage\Driver
$Storage->Config->disks['x'] = ['driver' => 'custom'];
```

## Events

The facade emits domain events through the shared `Emitter::$Instance`, so a write/read/delete
is observable with zero allocation when nobody is listening:

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

`Events::Written` carries `[path, written]`, `Events::Read` carries `[path, found]`, and
`Events::Deleted` carries `[path, deleted]`.

## Reference

### Facade

```php
public function open (string $name = ''): Driver
```

Opens a disk by name, building its driver once on first access. With no argument it
returns the default disk. The facade's own file methods (below) proxy to the default disk.

### Driver contract

Concrete drivers extend `Bootgly\ABI\Resources\Storage\Driver`. Every path is disk-relative
and resolved against the driver's `root`. `$source`/`$sink` are PHP stream resources.

```php
public function write (string $path, $source, array $options = []): bool
```

Streams the readable resource `$source` into `$path`, creating parent directories as needed.
On S3 this is a single PUT for a small object and an automatic Multipart Upload (parallel
parts) for a large one. `$options` are driver-specific — S3 reads `type` (Content-Type) and
`meta` (a `x-amz-meta-*` map); Local/Memory ignore them. Returns `true` on success; on `false`
the reason is on the driver (`$Storage->open()->error`).

```php
public function read (string $path, $sink): bool
```

Streams the file at `$path` into the writable resource `$sink`. Returns `false` when the path
is missing or unreadable (nothing is written to `$sink`), `true` otherwise.

```php
public function delete (string $path): bool
```

Removes one file. Returns `true` when the path no longer exists (a missing path is a no-op
success).

```php
public function check (string $path): bool
```

Whether a file or directory exists at the path.

```php
public function list (string $path = '', bool $recursive = false): array
```

Lists file paths (disk-relative) under a directory. With `recursive: true` it walks
subdirectories; otherwise it returns immediate files only.

```php
public function copy (string $from, string $to): bool
```

Copies a file within the disk, creating the target's parent directories. Returns `false` when
the source is missing.

```php
public function move (string $from, string $to): bool
```

Moves (renames) a file within the disk. Returns `false` when the source is missing.

```php
public function measure (string $path): int|false
```

File size in bytes, or `false` when the path is missing.

```php
public function inspect (string $path): array|false
```

File metadata — `['size' => int, 'modified' => int]` (bytes and Unix mtime), or `false` when
the path is missing.

```php
public function make (string $path): bool
```

Creates a directory recursively. Returns `true` when it exists afterwards.

```php
public function clear (string $path = ''): bool
```

Removes every entry under a directory, keeping the directory itself. With no argument it
empties the whole disk.

### Layering

- **Facade vs driver** — `Storage` exposes the `Drivers` registry
  (`$Storage->Drivers->register('name', MyDriver::class)`) and the per-disk driver cache.
  Built-in drivers are `local`, `memory` and `s3`.
- **ABI component** — storage is an ABI resource, so the Local driver is blocking. Bootgly's
  internal runtime paths (sessions, PIDs, cache, schedule state) use the `BOOTGLY_STORAGE_DIR`
  constant directly rather than this facade, keeping hot, lock-based paths overhead-free.

## Next references

- **[Cache](/guide/cache/overview/)** — the sibling ABI resource facade (TTL, tags, drivers).
- **[Configuration](/guide/configuration/overview/)** — load scoped configs and `.env` values.
- **[Docker](/guide/docker/overview/)** — persist `storage/` across containers with a volume.
