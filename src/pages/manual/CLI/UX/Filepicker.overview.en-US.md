# Filepicker

Filesystem picker — asks the user "which file?" without them typing a path. A [Tree](/manual/CLI/UI/Components/Tree/overview) preconfigured for the filesystem: lazy directory scans, per-entry icons, extension filtering. `pick()` opens the browser and returns the chosen **absolute path**, guaranteed to exist.

## Pick a file

```php
use Bootgly\CLI\UX\Filepicker;

$Filepicker = new Filepicker($Input, $Output);
$Filepicker->prompt = 'Pick the TLS certificate';
$Filepicker->root = '/etc/ssl';
$Filepicker->extensions = ['pem', 'crt'];

$path = $Filepicker->pick();

if ($path !== null) {
   echo "Certificate: {$path}\n";
}
```

```text
Pick the TLS certificate
=> 📁 /etc/ssl
   ├─ 📁 certs
   │  ├─ 📄 ca.pem
   │  └─ 📄 server.pem
   └─ 📁 private
```

`↑`/`↓` aim, `Enter` on a directory **drills into it** (scanned lazily on the first open), `Enter` on a file confirms it, `Esc` cancels returning `null`. Only files matching `extensions` are listed (empty array lists every file); dotfiles stay hidden unless `hidden = true`.

## Pick a directory

Set `directories = true` and the picker flips to directory mode: files are not listed, `Enter` **selects** the aimed directory and `→` keeps drilling:

```php
$Filepicker = new Filepicker($Input, $Output);
$Filepicker->prompt = 'Where should the project be created?';
$Filepicker->root = getcwd();
$Filepicker->directories = true;

$target = $Filepicker->pick();
```

## Non-interactive input

On pipes and CI `pick()` degrades to a typed line (Question semantics): the user types the path, which is validated with `realpath` — a non-existing or empty answer returns `null`. Scripts stay automatable:

```bash
echo "/etc/ssl/certs/server.pem" | php installer.php
```

## Notes

- Directories are scanned **lazily** — huge trees cost nothing until a branch is opened.
- Unreadable directories (permissions) resolve as empty branches instead of aborting the session.
- Icons come from the `glyphs` Config (`directory`/`file`) — swap for other emojis or plain markers.
- `viewport` (default 12) windows long listings with `↑/↓ N more` markers; `blink` makes the aim marker blink.
- Pasting a path with Ctrl+V is a planned follow-up (bracketed paste mode in the terminal Input).

## Reference

### Filepicker

```php
public function __construct (Input $Input, Output $Output)
```

Creates the picker bound to the terminal `Input` and `Output`.

```php
public function pick (): null|string
```

Opens the filesystem browser and returns the chosen absolute path — `null` on cancel (`Esc`, `EOF`), on an unreachable `root`, or when a non-interactive typed path does not exist. The last result also stays exposed on the read-only `$picked` property.

Config: `string $prompt` (header line), `string $root` (start directory, default `.`), `array $extensions` (lowercase, no dot — `[]` lists every file), `bool $hidden` (list dotfiles, default `false`), `bool $directories` (directory mode, default `false`), `null|int $viewport` (max visible rows, default `12`), `bool $blink` (blinking aim marker, default `false`), `array $glyphs` (`directory`/`file` icons).
