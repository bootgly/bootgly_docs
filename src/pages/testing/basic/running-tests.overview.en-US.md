# Running Tests

Bootgly ships its own built-in test framework — no PHPUnit, no Composer scripts. Tests run through the `bootgly` CLI, the same executable used to boot every other Bootgly project.

## Requirements

- PHP 8.4+
- Bootgly installed locally (run via `php bootgly`) or globally (run via `bootgly` after `sudo php bootgly setup`)

## Run all suites

Run every registered suite from the repository root:

```bash :toolbar="true";
php bootgly test
```

The runner loads `tests/autoboot.php`, iterates over each suite directory, and prints the summary at the end. The exit code is non-zero when at least one specification fails.

## Run a specific suite

Each suite directory listed in `tests/autoboot.php` is addressable by its 1-based index:

```bash :toolbar="true";
php bootgly test 16
```

The example above runs only suite `16`. Indexes follow the order declared inside the root `tests/autoboot.php` `Suites(...)` constructor.

## Run a single test case

Pass the suite index followed by the test (case) index to execute one specification:

```bash :toolbar="true";
php bootgly test 16 1
```

Both indexes are 1-based. Use this form to focus on a single failing case during development without re-running the whole suite.

## Help

List the accepted arguments and options straight from the terminal:

```bash :toolbar="true";
php bootgly test --help
```

`-h` is the short form of the same flag. The help prints the argument and option tables and exits with success — no suite is executed. For benchmark-specific options, use `php bootgly test benchmark --help` (see the Benchmarks section below).

## View

Choose how results are rendered with `--view=`:

```bash :toolbar="true";
php bootgly test --view=heatmap
```

| Mode | Behavior |
| ---- | -------- |
| `list` | Prints each case as it runs and stops at the first failing case. Default for targeted runs (`php bootgly test <suite>` / `<suite> <case>`). |
| `heatmap` | Renders one dashboard card per suite — rounded frame, a progress gauge and one colored square per assertion (green passed, soft-red failed, beige skipped). The gauge fills deterministically by **test cases** (their count is known upfront), while the squares are the individual **assertions** discovered as each case runs — so a suite of 63 cases can show 254 assertions. On interactive terminals the card paints live as cases run. All suites run to the end, failures are listed under each card — along with any debug output (`dump()`) the failing case captured — and the exit code is non-zero when any case failed. Default for full runs (`php bootgly test`). |

The card is composed by the runner from three components: a [Fieldset](/manual/CLI/UI/Base/Fieldset) boxes a [Charts Meter](/manual/CLI/UI/Components/Charts) (the cases progress) and a [Heatmap](/manual/CLI/UI/Components/Heatmap) (the assertions grid). AI agents (`AI_AGENT=1`) always receive the JSON results document, regardless of the view.

## Coverage

The runner accepts coverage flags handled by `Bootgly\ACI\Tests\Coverage`:

| Option | Description |
| ------ | ----------- |
| `--coverage` | Enable coverage with the auto-detected driver. |
| `--coverage-driver=<name>` | Force a driver: `xdebug`, `pcov`, `native`, or `nothing`. |
| `--coverage-native-mode=<mode>` | Native driver mode (default `strict`). |
| `--coverage-report=<format>[:<path>]` | Report format (`text`, `html`, `clover`). When `path` is omitted the report is printed to stdout. |
| `--coverage-diff` | Restrict the report to lines changed against the working tree. |

Example — native driver, text report to stdout, scoped to suite `8`:

```bash
php -d opcache.enable_cli=0 bootgly test 8 \
   --coverage-driver=native \
   --coverage-report=text
```

The native driver requires `opcache.enable_cli=0` so that source files are not pre-compiled before the coverage filter can instrument them.

## Benchmarks

The `benchmark` subcommand runs performance cases under `benchmarks/`:

```bash
php bootgly test benchmark <CASE> --opponents=bootgly --loads=<set>:*
```

Use `--help` after the case name to inspect runner-specific options:

```bash
php bootgly test benchmark <CASE> --help
```

## Static analysis

Test files must remain free of static-analysis errors. Run PHPStan with the project configuration after writing or changing tests:

```bash :toolbar="true";
vendor/bin/phpstan analyse -c @/phpstan.neon
```

## Common patterns

- Re-run a failing test in isolation with `php bootgly test <suite> <case>` before pushing.
- Pair `--coverage-diff` with a specific suite index to verify that new or changed lines are covered.
- For CI, prefer the global form `bootgly test` — `proc_open` subprocesses inherit CI environment variables (e.g. `GITHUB_ACTIONS`), which can change suite registration if your tests rely on `Environment::CI_CD`.
