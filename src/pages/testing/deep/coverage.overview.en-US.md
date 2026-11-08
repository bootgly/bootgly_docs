# Code Coverage

Bootgly ships code coverage as part of `Bootgly\ACI\Tests`. It does not depend on PHPUnit or external libraries: `Coverage` owns the session, backends implement `Coverage\Driver`, and output formats implement `Coverage\Report`.

## Overview

Coverage measures which executable lines were reached while tests run and renders reports for humans or CI systems.

| Resource | Role |
| -------- | ---- |
| `Coverage` | Coverage session: starts, stops, filters and renders reports. |
| `Coverage\Driver` | Backend contract for collecting per-line hits. |
| `Coverage\Drivers\XDebug` | Uses `ext-xdebug` when coverage mode is enabled. |
| `Coverage\Drivers\PCOV` | Uses `ext-pcov` when the extension is available. |
| `Coverage\Drivers\Native` | Pure-PHP driver based on tokenizer and stream filters. |
| `Coverage\Drivers\Nothing` | No-op driver for smoke tests; it measures nothing, so the runner never reports or gates with it. |
| `Coverage\Gate` | Checks a measured hit map against a statements floor and the "no class at zero" rule. |
| `Coverage\Changes` | Reads the lines a git range changed, for a coverage diff. |
| `Coverage\Reports\Text` | Plain-text terminal report. |
| `Coverage\Reports\HTML` | Simple HTML report. |
| `Coverage\Reports\Clover` | Clover XML for CI. |

## CLI usage

Generate a text report with the auto-detected driver:

```bash :toolbar="true";
php bootgly test --coverage --coverage-report=text
```

Auto-detection picks Xdebug (in coverage mode), then PCOV. When neither can measure, the run stops **before any suite runs**, exits non-zero and writes no report — a CI job never receives a valid-looking clover with zero statements:

```text
[test] Coverage: no coverage driver is loaded — nothing would be measured, so no report is written.
[test] Load Xdebug (XDEBUG_MODE=coverage) or PCOV, or use the pure-PHP driver:
[test]    php -d opcache.enable_cli=0 bootgly test --coverage-driver=native
```

An extension that is loaded but cannot measure stops the run the same way, with its fix: Xdebug without `xdebug.mode=coverage`, or PCOV with `pcov.enabled=0` (the production default of many distributions — run `php -d pcov.enabled=1 bootgly test --coverage`). The `Native` driver is never auto-detected: it must start before the sources it measures load and needs `opcache.enable_cli=0`, so it is always chosen explicitly.

Select a driver explicitly:

```bash
php bootgly test 11 --coverage-driver=xdebug --coverage-report=text
php bootgly test 11 --coverage-driver=pcov --coverage-report=clover:/tmp/coverage.xml
php bootgly test 11 --coverage-driver=nothing --coverage-report=text
```

### Native driver

The `Native` driver is the extension-free backend. It instruments PHP files as Bootgly autoloads them.

```bash :toolbar="true";
php -d opcache.enable_cli=0 bootgly test 11 --coverage-driver=native --coverage-report=text
```

`Native` requires `opcache.enable_cli=0`, because OPcache can reuse bytecode that was not instrumented. It also measures only files loaded after the coverage session starts: an in-scope file loaded earlier (by the bootstrap) is absent from the report, with no message. With OPcache on, or an unknown `--coverage-native-mode`, the run stops at once with a `[test] Coverage:` line and exit code 1.

### Coverage diff

The `text` report can include a per-file diff with covered and uncovered lines:

```bash
php -d opcache.enable_cli=0 bootgly test 11 \
   --coverage-driver=native \
   --coverage-report=text \
   --coverage-diff
```

Give `--coverage-diff` a git range and the report measures **only the lines that range added or modified** — every format, not just `text`:

```bash :toolbar="true";
php bootgly test --coverage --coverage-diff=origin/main...HEAD
```

The range is anything `git diff` accepts as revisions: `origin/main...HEAD` (the changes of a branch), `HEAD~3..HEAD`, or a single revision such as `main` (compared with the working tree: uncommitted edits to tracked files are included, untracked new files are not). It is read in the working directory's repository; a range starting with `-` is refused. Only the changed lines count — local git settings (`diff.relative`, inter-hunk context, copy detection, `GIT_DIFF_OPTS`, pathspec and repository-location variables such as `GIT_DIR`) do not widen, narrow or move them, and content git would call binary (a NUL byte, a `-diff` attribute) is still read line by line; only PHP sources (`.php` in any case) are read, so a range that adds assets stays small. Coverage measures the checked-out working tree, so the range must end at it — `origin/main...HEAD` on a checkout of `HEAD`: a range whose new side is another commit (`main..feature` while `main` is checked out) names lines and files the run does not hold, and a changed PHP file the work tree lacks stops the run with an error instead of being skipped. A range over a merge commit (`<merge>^!`) is refused, because its combined diff leaves out files taken cleanly from one side: use the first-parent range, `<merge>^1..<merge>`.

A changed line counts through the statement it belongs to: a statement over several lines is executable on one of them, so a changed argument, array element, heredoc body or closing `);` measures that statement, while a comment or blank line measures nothing. A line in a control body measures its body statement, never the header (`if (…)`, `case …:`, `foreach (…):`), which runs whether or not the body does; a body statement takes its own executable line first, and one written only on its header's line cannot be told apart from it by line coverage, so it counts with that line's hits — as a one-line `if ($a) return;` does.

A changed PHP source that no test loaded is measured at zero hits instead of disappearing from the report. A changed source inside a resource directory (`examples/`, `fixtures/`, `stubs/`, `templates/`, `tests/`) is not code to cover and does not join when no test loaded it; test scripts never count. These directories are read below the working directory, so a checkout that itself sits in a `tests/` directory keeps its sources. With the `Native` driver, a changed source in scope that it never instruments (a path under `/tmp/`, `/vendor/` or `/storage/`, and the coverage engine itself, the framework's `Bootgly/ACI/Tests/Coverage/`) is reported as unmeasurable when a changed line holds code (a comment-only edit does not), and a gate fails instead of reading it as unchanged. The same holds without a range: a source a test loaded but `Native` never instruments is listed as unmeasurable, and a gate fails over it — except the coverage engine itself, which the runner always loads.

## Coverage gate

A gate turns a coverage run into a pass/fail check. The run still executes every suite and writes its report; then the gate checks the measured statements and, when a rule does not hold, the run fails: non-zero exit, the reasons on STDERR, a `FAILED … coverage failed` verdict, and — for AI agents — `"result":"failed"` with a `coverage` key in the JSON document:

```json
{"result":"failed", …, "coverage":{"gate":"failed","failures":["Coverage gate: 76.42% of 1830 statements covered (1398), below the floor of 80%."]}}
```

### Statements floor

Fail when the covered share of executable statements is below a percentage:

```bash :toolbar="true";
php bootgly test --coverage --coverage-floor=80
```

```text
[test] Coverage gate: 76.42% of 1830 statements covered (1398), below the floor of 80%.
```

A statement is an executable line; it is covered when it ran at least once. A floor equal to the measured share passes; a floor takes up to four decimals, compared exactly (`--coverage-floor=64.4` passes 161 of 250).

### No class at zero

Fail when a source that declares a class, trait or enum has executable statements and none of them ran:

```bash :toolbar="true";
php bootgly test --coverage --coverage-classes
```

```text
[test] Coverage gate: 2 class source(s) with no covered statement:
[test]   /app/Bootgly/ABI/Foo.php
[test]   /app/Bootgly/ABI/Bar.php
```

### Measure a whole directory

Xdebug and PCOV only report files the run loaded, so a source no test touched would be invisible to both rules. `--coverage-path` measures every PHP source under a directory: files the run never loaded join the report at zero hits.

```bash :toolbar="true";
php bootgly test --coverage --coverage-path=Bootgly/ --coverage-floor=80 --coverage-classes
```

- The path replaces the suite scopes of the report (any suite index still selects which tests run).
- Sources inside a resource directory below the path — `examples/`, `fixtures/`, `stubs/`, `templates/`, `tests/` (`Coverage::RESOURCES`) — stay out of the unloaded set; a resource file a test loads is still reported.
- Under the `Native` driver, sources it never instruments (see above) are listed as unmeasurable instead of joining at zero, and a gate fails over them: measure those paths with Xdebug or PCOV.
- A subdirectory the run cannot read is skipped; a path that is not a readable directory fails the run.
- The executable lines of an unloaded file are estimated by the static analyzer of the `Native` driver — compare floors measured with the same driver.

### Gate the changes of a pull request

Combine a range with a floor to require coverage of the new code only:

```bash :toolbar="true";
php bootgly test --coverage --coverage-path=Bootgly/ --coverage-diff=origin/main...HEAD --coverage-floor=90
```

Under a range, both rules apply to the changed statements: `--coverage-classes` flags a class whose changed statements all went unrun. A range that changed no statement in the measured scope (documentation or tests only) leaves nothing to gate: the run says so, reports `"gate":"skipped"` to agents, and passes.

### When a gate cannot pass

- A measurement with no executable statement fails every rule — the gate never passes on an empty report (the one exception is a range that changed nothing measured, above).
- A gate with `--coverage-driver=nothing` fails before any suite runs.
- `--coverage-floor` takes a number from `0` to `100` with up to four decimals; anything else stops the run before it starts.
- A changed source the driver cannot measure fails the gate (see above).

## Coverage in CI

Run every suite once under PCOV, gate the result and keep the clover report. On a pull request, the same command gates only the lines the pull request changed. A GitHub Actions job for a Kit:

```yaml
coverage:
  runs-on: ubuntu-24.04
  steps:
    - uses: actions/checkout@v5
      with:
        submodules: recursive   # the Kit's Bootgly, Console and Web
        fetch-depth: 0          # the pull request range needs its base branch
        persist-credentials: false
    - uses: shivammathur/setup-php@v2
      with:
        php-version: '8.4'
        coverage: pcov
        ini-values: pcov.enabled=1, pcov.directory=${{ github.workspace }}
    - name: Coverage gate
      working-directory: projects   # every registered project
      env:
        EVENT: ${{ github.event_name }}
        BASE: ${{ github.base_ref }}
      run: |
        set -- --coverage --coverage-driver=pcov --coverage-path=. \
           --coverage-floor=70 --coverage-report=clover:"$RUNNER_TEMP/coverage.xml"
        if [ "$EVENT" = pull_request ]; then
           set -- "$@" --coverage-diff="origin/$BASE...HEAD" --coverage-classes
        fi
        php ../bootgly test "$@"
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: coverage-clover
        path: ${{ runner.temp }}/coverage.xml
```

- Run from `projects/` (every registered project) or from one project's directory: where you stand decides the scope, and a headless run from the Kit root has none and stops. Paths given to `--coverage-path` are relative to that directory.
- Name the driver: a runner without PCOV then fails at once instead of measuring nothing.
- `pcov.enabled=1` turns collection on, and `pcov.directory` makes PCOV instrument the whole checkout.
- A pull request is checked out as its merge commit, so `origin/<base>...HEAD` ends at the measured tree.
- PCOV measures the test process only, from the moment the runner starts collecting: code that runs in forked server workers or in sub-processes, and lines that run before collection starts (the boot), count as uncovered. A pull request that only changes such code fails its gate however it is tested.
- Set the floor from a measured run, a little below it, and raise it as tests land — never lower it to let a change through.

### Bootgly's own gate

The framework gates itself the same way, measuring every PHP source in `Bootgly/`:

- every push to `main`: at least 65% of the statements covered;
- every pull request: the same floor over the lines it changed, and no changed class left without a covered statement;
- every release: the tree gate on the tag; when every suite and the gate pass, its clover report is attached to the GitHub release as `bootgly-<tag>-coverage.clover.xml`.

On the 1.2.0 tree, one run covers 69.8% of 69,266 statements. The "no class at zero" rule does not gate the whole tree yet: 66 class sources were at zero in that baseline.

## Programmatic API

Use the programmatic API when writing framework tooling or dedicated framework self-tests.

```php
<?php

use Bootgly\ACI\Tests\Coverage;
use Bootgly\ACI\Tests\Coverage\Drivers\Nothing;

$Coverage = new Coverage(new Nothing());
$Coverage->start();

// Run the subject under test here.

$Coverage->stop();

echo $Coverage->report('text');
```

Check the measured map against a gate:

```php
<?php

use Bootgly\ACI\Tests\Coverage\Gate;

$Gate = new Gate(floor: 80.0, classes: true);

if ($Gate->check($Coverage->data) === false) {
   foreach ($Gate->failures as $failure) {
      echo $failure, PHP_EOL;
   }
}

echo "{$Gate->covered}/{$Gate->statements} statements covered";
```

## Scope filters

A session can limit its report by include scope or exact target file.

```php
$Coverage->includes = ['Bootgly/ACI/Tests'];
$Coverage->targets = [BOOTGLY_ROOT_DIR . 'Bootgly/ACI/Tests/Fixture.php'];
```

- `includes` keeps files whose path contains one of the configured scopes.
- `targets` keeps only specific files when they exist in the raw map.
- Scripts inside lowercase `/tests/` directories are excluded from reports by default.

Two more inputs widen or narrow what is measured:

```php
use Bootgly\ACI\Tests\Coverage\Changes;

// Every PHP source under the directory counts, loaded or not.
$Coverage->paths = [BOOTGLY_ROOT_DIR . 'Bootgly/ACI'];

// Only the lines this range changed are measured.
$Coverage->changes = (new Changes('origin/main...HEAD', BOOTGLY_WORKING_DIR))->fetch();
```

Set both before `stop()`: it applies the filters, then adds the unloaded sources under `paths`, then keeps only the `changes` lines.

## Report formats

| Format | Recommended use |
| ------ | --------------- |
| `text` | Fast terminal reading and local debugging. |
| `html` | Simple browser visualization. |
| `clover` | CI tooling and coverage services. |

## Best practices

- Use `--coverage-driver=native` when coverage must run without extensions.
- Use `--coverage-driver=nothing` to test the report flow without instrumentation cost.
- Prefer `--coverage-report=clover:/path/coverage.xml` in CI.
- In CI, gate over a directory (`--coverage-path`) so untested sources lower the floor instead of hiding from it.
- On large projects, select a suite index to keep the report focused on the subject under test.

## Reference

### CLI options

| Option | Description |
| ------ | ----------- |
| `--coverage` | Enable coverage with the auto-detected driver (Xdebug, then PCOV; the run stops when neither can measure). |
| `--coverage-driver=<name>` | Force a driver: `xdebug`, `pcov`, `native` or `nothing`. |
| `--coverage-native-mode=<mode>` | Native driver mode: `strict` (default) or `parity`. |
| `--coverage-report=<format>[:<path>]` | Report format (`text`, `html`, `clover`); printed to stdout without a path. A bare `--coverage-report` means `text`; the format is case-insensitive. An unknown format, or a file path whose directory does not exist, is refused before any suite runs; a stream such as `php://stderr` is accepted; a report that cannot be written fails the run. |
| `--coverage-diff[=<range>]` | Bare: per-file covered/uncovered lines in the `text` report. With a git range: measure only the lines the range changed. |
| `--coverage-path=<dir>` | Measure every PHP source under `dir`; files no test loaded count at zero. |
| `--coverage-floor=<percent>` | Fail when covered statements are below `percent` (`0`–`100`). |
| `--coverage-classes` | Fail when a class, trait or enum source has no covered statement. |

### Coverage

```php
public static function detect (): Driver
```

Returns the Xdebug driver when coverage mode is on, else the PCOV driver when the extension is loaded, else `Nothing`. Throws `LogicException` when an extension is loaded but cannot measure (Xdebug without coverage mode, PCOV with `pcov.enabled=0`). `Native` is never returned.

```php
public array $paths = [];
```

Directories measured in full: PHP sources under them that the run never loaded join the report at zero hits (sources inside a `RESOURCES` directory below the path, and files the `includes`/`targets` filters reject stay out; under `Native`, sources it never instruments go to `$unmeasured`). `stop()` throws `LogicException` when an entry is not a readable directory.

```php
public null|array $changes = null;
```

Changed lines to measure, `[canonical_file => [line => true]]`, as `Changes::fetch()` returns them. When set, `stop()` adds each changed PHP source the run never loaded at zero hits (when the filters admit it and it is not inside a `RESOURCES` directory), then keeps only the statements these lines touch (a changed row inside a statement over several lines counts as that statement; a comment row counts as none) and drops every file without one; `null` measures every line.

```php
public private(set) array $unmeasured = [];
```

PHP sources in scope that the driver cannot measure (paths the `Native` driver never instruments) — sources a test loaded and sources under `$paths`; when `$changes` is set, only the changed ones whose changed lines hold code. The coverage engine is never listed for being loaded. Filled by `stop()`; the runner lists them and fails a gate over them.

```php
public const array RESOURCES = ['examples' => true, 'fixtures' => true, 'stubs' => true, 'templates' => true, 'tests' => true];
```

Resource directory names — `examples`, `fixtures`, `stubs`, `templates`, `tests` — whose unloaded PHP files never join the report.

```php
public const array REPORTS = ['clover' => Clover::class, 'html' => HTML::class, 'text' => Text::class];
```

Report formats `report()` renders, by name; `--coverage-report` accepts these names.

### Coverage\Gate

```php
public function __construct (null|float $floor = null, bool $classes = false)
```

Creates a gate. `floor` is the statements floor in percent; `classes` enables the "no class at zero" rule. Throws `InvalidArgumentException` when the floor is not a finite number from `0` to `100` or has more than four decimals.

```php
public function check (array $data): bool
```

Checks a hit map (`[file => [line => hits]]`, as `Coverage::$data` holds it) and returns `true` when every enabled rule passes. A map with no executable statement fails whenever a rule is enabled. Each call replaces the metrics below.

```php
public private(set) int $statements;
public private(set) int $covered;
public float $percent { get; }
```

Executable statements, covered statements and the covered share (in percent, `0.0` when nothing was measured) of the last `check()`.

```php
public private(set) array $zeros;
public private(set) array $failures;
```

The class sources found at zero (only while `classes` is on) and the human-readable failure lines of the last `check()` (empty on a pass).

### Coverage\Changes

```php
public function __construct (string $range, string $directory)
```

Describes a git range read from the repository that contains `directory`. Throws `InvalidArgumentException` when the range is empty, starts with `-` or holds whitespace or a control character.

```php
public function fetch (): array
```

Runs `git diff --unified=0` for the range (no shell, `GIT_DIFF_OPTS`/`GIT_EXTERNAL_DIFF` dropped, paths from the work-tree root) and returns the new-side lines it added or modified, `[canonical_file => [line => true]]`; the result is also kept in `$lines`. Deleted files and pure deletions contribute nothing. Reads content git would call binary as text (`--text`). Throws `RuntimeException` when git cannot run, the directory is missing, git rejects the range, or the range spans a merge (a combined diff).

```php
public static function parse (string $diff, string $root): array
```

Parses `git diff` output into the same map, resolving paths against the work-tree `root`; only `+` rows count (context rows, blank ones included, just advance the line number) and files that do not exist are skipped. Throws `RuntimeException` on a combined (`diff --cc`) diff.
