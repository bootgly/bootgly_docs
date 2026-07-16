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
| `Coverage\Drivers\Nothing` | No-op driver for smoke tests and environments without real coverage. |
| `Coverage\Reports\Text` | Plain-text terminal report. |
| `Coverage\Reports\HTML` | Simple HTML report. |
| `Coverage\Reports\Clover` | Clover XML for CI. |

## CLI usage

Generate a text report with the auto-detected driver:

```bash :toolbar="true";
php bootgly test --coverage --coverage-report=text
```

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

`Native` requires `opcache.enable_cli=0`, because OPcache can reuse bytecode that was not instrumented. It also measures only files loaded after the coverage session starts.

### Coverage diff

The `text` report can include a per-file diff with covered and uncovered lines:

```bash
php -d opcache.enable_cli=0 bootgly test 11 \
   --coverage-driver=native \
   --coverage-report=text \
   --coverage-diff
```

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

## Scope filters

A session can limit its report by include scope or exact target file.

```php
$Coverage->includes = ['Bootgly/ACI/Tests'];
$Coverage->targets = [BOOTGLY_ROOT_DIR . 'Bootgly/ACI/Tests/Fixture.php'];
```

- `includes` keeps files whose path contains one of the configured scopes.
- `targets` keeps only specific files when they exist in the raw map.
- Scripts inside lowercase `/tests/` directories are excluded from reports by default.

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
- On large projects, select a suite index to keep the report focused on the subject under test.
