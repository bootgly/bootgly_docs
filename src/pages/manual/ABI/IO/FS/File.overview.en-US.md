# File

`File` is Bootgly's file primitive: it resolves a path (optionally inside a `base` jail), reads
its metadata lazily and opens, reads, writes and deletes it. Two operations make it safe to share
a file between processes: `replace()` swaps the whole contents atomically and durably, and
`lock()` / `unlock()` take advisory locks so writers wait for each other.

## Replace a file atomically

```php
use Bootgly\ABI\IO\FS\File;

$Settings = new File('/var/app/storage/settings.json');

$Settings->replace(json_encode(['theme' => 'dark']), 0644); // true
```

`replace()` never writes into the file it replaces. It writes the data to a hidden sibling with a
random name (`.<random>.tmp`, created exclusively in the same directory), syncs it to the disk,
renames it over the target and syncs the directory. A reader, in this process or any other, sees
either the whole old file or the whole new one — never a truncated or half-written file.

The directory sync comes after the rename, when the new contents are already in place, so it is
best effort: a directory that cannot be opened or synced does not turn the replace into a
failure — `replace()` still returns `true`; only the new entry's survival of a power loss in the
next instants is not guaranteed.

`replace()` acts on exactly the path you gave the constructor. The reading side of `File`
normalizes a path (a backslash becomes a separator, `..` is folded) and converts a missing name
to its `.php` or `/index.php` sibling; `replace()` does neither: `new File('/srv/app/snap')`
replaces `/srv/app/snap`, even when `/srv/app/snap.php` exists, and `link/..` is resolved the way
the kernel resolves it.

The new file gets the permissions you pass — `0600` (owner only) by default — before its first
byte is written, whatever the process umask. The temporary is created under a umask that adds to
the process umask every bit you did not ask for: it never holds a bit beyond yours, and since the
umask is shared by the whole process, a file created elsewhere in that instant never gets a bit
the process umask removes. When the mode created differs from the one you asked for — the process
umask removed one of your bits, you asked for execute bits (a new file is created from `0666`), or
a default ACL on the directory overrides the umask — the temporary is `chmod()`ed to your mode
before its first byte, through its own open descriptor (`/proc/self/fd` on Linux), never through a
name that someone may have swapped (elsewhere through its name, checked before and after the
call). When the mode created is already yours, no `chmod()` runs. On a
filesystem that ignores `chmod()` (modes fixed by mount options), a
different mode is accepted only when you asked for the mode a plain write gives
(`0666 & ~umask()`); any other request is refused. Only the permission bits are accepted (`0` to
`0777`): setuid, setgid and sticky are refused.

It returns `false`, and leaves the target untouched, when:

- the directory does not exist or is not writable;
- the path is not a local one (a stream wrapper such as `php://memory` or `file://…`, or a NUL
  byte);
- the path does not name an entry: it ends in `/`, its last segment is `.` or `..`, or that
  segment holds a backslash (a separator on another system, which a normalizer would turn into a
  climb out of the directory);
- the `base` jail does not contain the directory (see below);
- the permissions cannot be given to the temporary;
- writing or syncing the temporary fails — the temporary is removed.

A symlink at the target is replaced by the new file; the file it points to is never written. A
process killed in the middle of `replace()` leaves the target intact, but it cannot remove its
temporary: a hidden `.<random>.tmp` sibling stays behind.

After a replace, the `File` describes the new file: `$file` names it, and every cached property
— `$contents`, `$size`, `$permissions`, `$readable`, `$writable`, `$executable`, `$owner`,
`$group`, `$MIME`, the times, `$inode` and `$link` — is refreshed.

Inside the framework, the environment file, compiled templates, the project registry,
observability dumps and `bootgly lint --fix` replace durably; the File cache and the File queue
replace without syncing. Not migrated yet — they still write through their own temporary and
rename, and move to `replace()` in later releases: the ACME client and AutoTLS certificate
stores, the Session file handler, the Storage `Local` driver, the process state file
(`ACI/Process/State`) and the benchmark artifacts and child results (`ACI/Tests/Benchmark`).

## Skip the syncs for records you can rebuild

The two syncs are what make `replace()` survive a power loss or a kernel crash, and they are its
cost: each one waits for the disk. For records you can regenerate — cache entries, compiled
artifacts, transient jobs — pass `durable: false`:

```php
$Entry = new File('/var/app/storage/cache/ab/abcdef.cache');

$Entry->replace(serialize(['hits' => 42]), 0644, durable: false); // true
```

Everything else stays the same: the exclusive hidden temporary, the permissions before the first
byte, the rename, the jail and the cleanup. Readers still see the whole old file or the whole new
one. What changes is a crash of the machine: right after one, the target may hold the old
contents or, on some filesystems, an empty file. Keep the default (`durable: true`) for anything
that cannot be rebuilt — configuration, credentials, user data.

A record that is not rebuilt by itself is not regenerable, even in a queue: the File queue moves
a released or recovered job back by rewriting it without a sync and then deleting its reserved
copy, so a power loss right after may leave an empty job file, which the queue skips — that job
is lost.

## Serialize writers with a lock

`replace()` makes every write whole, but two processes that read, change and replace the same
file can still lose each other's change. Hold a lock around the read-change-replace cycle:

```php
use Bootgly\ABI\IO\FS\File;

$Lock = new File('/var/app/storage/counter.lock');

if ($Lock->lock()) {            // waits while another process holds it
   $Counter = new File('/var/app/storage/counter.txt');
   $count = (int) @file_get_contents('/var/app/storage/counter.txt');

   $Counter->replace((string) ($count + 1), 0644);

   $Lock->unlock();
}
```

Lock a separate lock file, never the file you replace: `replace()` puts a new file at the path,
so the next process would open — and lock — the new file while you still hold the lock on the
old one.

`lock()` opens the file itself when it has no open handle — exactly the path you gave, never a
`.php` or `/index.php` sibling — in a mode that never truncates (read/write, creating a missing
lock file; read-only when the file is not writable). From then on the `File` describes the file
it locked: `$file` names it, `read()` and `delete()` act on it, and every cached property is
refreshed — even when a read before the lock had resolved the name to its `.php` sibling. The
lock is released by `unlock()`, by `close()` and when the process ends.

### Do not wait

Pass `wait: false` to give up at once when someone else holds the lock:

```php
$Lock = new File('/var/app/run/report.lock');

if ($Lock->lock(wait: false) === false) {
   echo "Another report is running.\n";

   return;
}

// ... build the report ...

$Lock->close(); // releases the lock
```

### Readers and writers

An exclusive lock (the default) admits one holder. A shared lock — `lock(exclusive: false)` —
admits any number of shared holders, and no exclusive one while they hold it:

| Held | Requested | Result |
|---|---|---|
| exclusive | exclusive or shared | waits (or `false` with `wait: false`) |
| shared | shared | granted |
| shared | exclusive | waits (or `false` with `wait: false`) |

Locks are advisory: they bind only code that also calls `lock()`. Two `File` objects in the same
process conflict exactly like two processes do. `$locked` tells whether the `File` holds a lock.

Asking for the other type on a handle that already holds a lock converts it, and a conversion is
not atomic: Linux drops the held lock before it tries the new one. When the conversion fails —
`lock(exclusive: true, wait: false)` while another process shares the lock — the handle is left
with no lock at all, and `$locked` turns `false` to say so. Take the lock you need once, or
`unlock()` and wait for the new one.

## Inside a jail

A `File` built with a `base` directory never acts outside it. `replace()` judges the directory
the new file lands in — a path that leaves the jail, by `..` or through a symlinked directory, is
refused; a symlink inside the jail is replaced as the link itself:

```php
$Upload = new File('/var/app/storage/../config/app.php', base: '/var/app/storage');

$Upload->replace('<?php return [];'); // false — the directory is outside the jail
```

`lock()` opens its handle through the same jail: a lock file outside it is neither created nor
locked.

The jail is judged when the call runs, on the directory's path. PHP has no `openat()`, so the
temporary and the rename still name that directory by its path: a writer inside the jail who can
swap one of its directories for a link between the check and the write can still redirect them.
The jail confines the paths your code hands to `File`; it does not make a tree shared with an
untrusted writer safe.

## Reference

```php
public function replace (string $data, int $permissions = 0600, bool $durable = true): bool
```

Replaces the file's contents with `$data` durably and atomically, on exactly the path given to
the constructor (never normalized, never converted to `.php` / `/index.php`): a randomly named
temporary sibling is created exclusively, gets `$permissions` before its first byte, is written
fully, synced, renamed over the target, and the directory is synced on a best-effort basis (the
swap has already happened). With `$durable` set to `false` both syncs are skipped — the swap
stays atomic for readers, but a power loss or a kernel crash may leave the old contents or an
empty file. A symlink at the target is replaced, not followed. Returns `true` when the target
holds the new contents; `false` on any failure before the rename — permissions outside
`0`–`0777`, a non-local path, a path that names no entry (a trailing `/`, a last segment `.`,
`..` or holding a backslash), a missing or read-only directory, a directory outside the `base`
jail, permissions that cannot be applied, a failed write — with the temporary removed and the
target untouched. The replaced entry becomes the File's `$file`; every cached property
(`$contents`, `$size`, `$readable`, `$MIME`, `$modified`, …) is refreshed. An open handle keeps
pointing to the replaced file.

```php
public function lock (bool $exclusive = true, bool $wait = true): bool
```

Takes an advisory lock (`flock()`) on the File's open handle — exclusive or shared. Without an
open handle it opens one on exactly the path given to the constructor that never truncates
(`c+`, or `r` when the file is not writable); a stream wrapper or a NUL byte is refused, and a
handle opened here is closed again when the lock is not taken. With `$wait` it blocks until the
lock is free; without it, returns `false` at once when the lock is busy. Returns `true` when the
lock is held. A failed `lock()` leaves `$locked` false: a failed conversion between shared and
exclusive drops the lock the handle held (Linux). A handle opened here becomes the File's entry:
`$file` names it and every cached property is refreshed.

```php
public function unlock (): bool
```

Releases the lock taken by `lock()` and keeps the handle open. Returns `false` when there is no
open handle or the release fails.

```php
public protected(set) bool $locked
```

`true` while the File holds a lock taken by `lock()`; cleared by `unlock()`, `close()` and any
failed `lock()`.

```php
public protected(set) null|bool $readable
```

Whether the File's entry is readable by this process, read lazily and cached. Declared
`null|bool`, it always reads as a `bool`: a missing file reads `false`. `replace()` and a
`lock()` that opens its own handle refresh it.

```php
public protected(set) null|bool $writable
```

Whether the File's entry is writable by this process — same declaration, caching and refresh as
`$readable`: it always reads as a `bool`.

```php
public protected(set) null|bool $executable
```

Whether the File's entry is executable by this process — same declaration, caching and refresh as
`$readable`: it always reads as a `bool`.
