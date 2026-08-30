# Running Tests

Bootgly ships its own built-in test framework — no PHPUnit, no Composer scripts. Tests run through the `bootgly` CLI, the same executable used to boot every other Bootgly project.

## Requirements

- PHP 8.4+
- Bootgly installed locally (run via `php bootgly`) or globally (run via `bootgly` after `php bootgly setup`)

## Run all suites

Run every registered suite from a framework or platform checkout root (in a **Kit**, where you stand decides the scope — see below):

```bash :toolbar="true";
php bootgly test
```

The runner loads the registry of the **resolved scope** (see below), iterates over each suite directory, and prints the summary at the end. A human run opens with that scope — `[test] scope: …` followed by the registry it resolved, or the project set when a merged `projects/` run has no single registry; agent runs read the JSON results document instead. The exit status is non-zero for any failing or incomplete run.

## Where you stand decides the scope

In a **Bootgly Kit**, `bootgly test` has no flags to memorize: the working
directory selects what runs.

| Working directory | What runs |
| ----------------- | --------- |
| inside a project (e.g. `projects/App`) | that project's suites — its `tests/autoboot.php` registry; the longest registered path wins, so a nested `projects/App/API` is its own scope |
| `projects/` | **every** registered project, merged into one run — the set is printed first, and the totals report *registered vs executed* |
| an unregistered directory under `projects/` | refused, naming the directory and the registry — register the project first |
| the kit root (or anywhere else) | on a terminal, a picker asks which project (or all); headless, the registered projects and their `cd`-based invocations are printed on `stderr` and the run exits non-zero |

The platform flags override the working directory everywhere: `--bootgly` runs
the framework suites, `--console` and `--web` the platform suites. In a
framework or platform checkout, `bootgly test` keeps running that checkout's
own `tests/autoboot.php`.

A project's `tests/autoboot.php` **always** returns a `Suites` registry listing
its suite directories, and each of those directories holds the `autoboot.php`
that returns the `Suite` itself (`bootgly project create` scaffolds exactly
that: a registry plus `tests/example/`). A registry that returns a `Suite`
instead is refused, naming the file — that file would have to be read twice,
once as the registry and once as the suite bootstrap it stood for, which makes
any `class`, `function` or `define()` inside it fatal and runs every
`pretest()` twice. A shipped example imported into a kit before this contract
still carries the old layout — re-import it with
`bootgly project create <Name> --from=<Name> --refresh`.

## Run a specific suite

Each suite directory listed in the resolved registry is addressable by its 1-based index:

```bash :toolbar="true";
php bootgly test 16
```

The example above runs only suite `16`. Indexes follow the order declared inside the resolved registry's `Suites(...)` constructor — in a merged `projects/` run, the printed set shows each project's index range.

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

## Verbosity

Raise the detail of assertion **failure** messages with the global `-v` option:

```bash :toolbar="true";
php bootgly test -v
```

`-v`/`-vv`/`-vvv` is the same global verbosity option every Bootgly command accepts (see [Commands](/manual/CLI/Commands)). On `test` it is fed into the assertion failure Fallbacks: at the default level a failure prints redacted placeholders (`actual`, `expected`); with `-v` the real scalar values are shown and arrays are JSON-encoded; `-vv` also serializes objects into the message. Assertions that do not implement graded detail always print their values.

## View

Choose how results are rendered with `--view=`:

```bash :toolbar="true";
php bootgly test --view=heatmap
```

| Mode | Behavior |
| ---- | -------- |
| `list` | Prints each case as it runs. Default for targeted runs (`php bootgly test <suite>` / `<suite> <case>`), and for **any** run whose `stdout` is not a terminal — a redirected or piped run is a log, so CI gets the full per-case output instead of a dashboard. The view is **rendering only**: whichever mode renders, the run still executes everything it was asked to run (see [Fail-fast](#fail-fast)). |
| `heatmap` | Renders one dashboard card per suite — rounded frame, a progress gauge and one colored square per assertion (green passed, soft-red failed, beige skipped). The gauge fills deterministically by **test cases** (their count is known upfront), while the squares are the individual **assertions** discovered as each case runs — so a suite of 63 cases can show 254 assertions. On interactive terminals the card paints live as cases run. All suites run to the end, failures are listed under each card — along with any debug output (`dump()`) the failing case captured — and the exit code is non-zero when any case failed. Default for full runs (`php bootgly test`) on an interactive terminal. Pass `--view=heatmap` explicitly to render the cards into a pipe or a file as well. The dashboard needs the whole run, so an explicit `--view=heatmap` cannot be combined with `--fail-fast` — the runner refuses the pair with an alert. |

The card is composed by the runner from three components: a [Fieldset](/manual/CLI/UI/Base/Fieldset) boxes a [Charts Meter](/manual/CLI/UI/Components/Charts) (the cases progress) and a [Heatmap](/manual/CLI/UI/Components/Heatmap) (the assertions grid). AI agents (`AI_AGENT=1`) always receive the JSON results document, regardless of the view. When a run produces no document, `stdout` stays empty — the reason and the child's output go to `stderr`.

An agent run executes everything it was asked to run, like any other, and the document lists every failure under `failures`. Only `--fail-fast` stops it at the first failing case — and the document says so instead of hiding it: `suites.total` is what the resolved registry **registered**, and every suite the run did not reach is counted in `suites.skipped`. So a `--fail-fast` run that stopped at the first of 105 suites reports `total: 105, failed: 1, skipped: 104, passed: 0`, never a shrunken total with `skipped: 0`. Case counts stay what actually ran: the cases of a suite that never loaded are unknowable.

## Fail-fast

By default a run executes everything it was asked to run — every suite of a full run, every case of a targeted one — and reports every failure. Pass `--fail-fast` to stop at the first failing case instead:

```bash :toolbar="true";
php bootgly test --fail-fast
php bootgly test 23 --fail-fast
AI_AGENT=1 php bootgly test --fail-fast
```

`--fail-fast` is a bare switch (a value fails with an alert) and it decides the contract alone — `--view` never does, and neither does the agent mode. A suite that manages its own cases (the E2E harnesses declare `exitOnFailure: false` in their autoboot) still runs its remaining cases; the run then stops at the end of that suite. The suites never reached are reported as skipped, in the summary line and in the agent document alike.

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

The native driver requires `opcache.enable_cli=0` so that source files are not pre-compiled before the coverage filter can instrument them. Interpreter options you pass this way (`-d`, `-n`, `-c`) are carried into the run even when an AI-agent environment makes `bootgly test` re-invoke itself.

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
- Hunting one failure in a suite? `php bootgly test <suite> --fail-fast` stops at the first red case; without it the suite always runs to its end.
- Pair `--coverage-diff` with a specific suite index to verify that new or changed lines are covered.
- For CI, prefer the global form `bootgly test` — `proc_open` subprocesses inherit CI environment variables (e.g. `GITHUB_ACTIONS`), which can change suite registration if your tests rely on `Environment::CI_CD`.
