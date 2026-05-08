# Fixtures

Fixtures organize the state required to run tests deterministically. In Bootgly, a fixture is an object that prepares state before the test case, exposes a `State` bag during execution and disposes state at the end.

## Main resources

| Resource | Role |
| -------- | ---- |
| `Fixture` | Base class for test state with lifecycle. |
| `Fixture\State` | Mutable bag with a resettable seed. |
| `Fixture\Lifecycles` | Enum with lifecycle states. |
| `Suite(Fixture:)` | Default fixture propagated to cases without their own fixture. |
| `Specification(Fixture:)` | Test-case-specific fixture. |
| `Assertions::$Fixture` | Fixture injected by the runner into Advanced API closures. |

## Lifecycle

A fixture moves through predictable states:

| State | Meaning |
| ----- | ------- |
| `Pristine` | Not prepared yet. |
| `Preparing` | Running `setup()`. |
| `Ready` | Ready for the test. |
| `Disposing` | Running `teardown()`. |
| `Disposed` | Disposal completed. |

`prepare()` and `dispose()` are idempotent. A `Disposed` fixture can be prepared again; before doing that, it runs `reset()` to restore the initial seed.

## Creating a fixture

Create a class that extends `Fixture` and override `setup()` and `teardown()` only when there is real work to do.

```php
<?php

use Bootgly\ACI\Tests\Fixture;

final class UserFixture extends Fixture
{
   protected function setup (): void
   {
      $this->State->update('user', 'rodrigo');
      $this->State->update('authenticated', true);
   }

   protected function teardown (): void
   {
      parent::teardown();
   }
}
```

For simple fixtures, the base class is enough:

```php
$Probe = new class (['status' => 200]) extends Fixture {};
```

## State bag

The `State` bag stores data shared between closures of the same case.

```php
$Fixture->State->update('token', 'abc123');
$token = $Fixture->fetch('token');
$missing = $Fixture->fetch('missing', default: 'fallback');
```

`reset()` restores the bag to the seed passed to the constructor.

## Specification fixture

Pass the fixture directly to the test case:

```php
<?php

use Bootgly\ACI\Tests\Fixture;
use Bootgly\ACI\Tests\Suite\Test\Specification;

$Probe = new class (['status' => 200]) extends Fixture {};

return new Specification(
   description: 'Fixture should be available',
   Fixture: $Probe,
   test: function (Fixture $Fixture): bool {
      return $Fixture->fetch('status') === 200;
   }
);
```

The runner calls `prepare()` before the test closure and `dispose()` after it.

## Suite fixture

A suite can declare a default fixture. It is propagated to Specifications that do not declare `Fixture:`.

```php
<?php

use Bootgly\ACI\Tests\Fixture;
use Bootgly\ACI\Tests\Suite;

$Fixture = new class (['ready' => true]) extends Fixture {};

return new Suite(
   autoBoot: __DIR__,
   autoInstance: true,
   autoReport: true,
   autoSummarize: true,
   exitOnFailure: true,
   suiteName: __NAMESPACE__,
   Fixture: $Fixture,
   tests: [
      '1.1-example',
   ]
);
```

If a `Specification` also declares `Fixture:`, the Specification fixture takes priority over the Suite fixture.

## Signature-aware injection

Bootgly injects the fixture as the next positional argument only when the signature accepts it.

```php
test: function (string $payload, Fixture $Fixture): bool {
   return $payload !== '' && $Fixture->fetch('ready') === true;
}
```

Acceptance rules:

- untyped parameter accepts it;
- `mixed` accepts it;
- `object` accepts it;
- compatible class/interface accepts it;
- union accepts it when one branch is compatible;
- intersection accepts it when all branches are compatible;
- incompatible builtin parameter, like `int`, does not receive the fixture.

Runner arguments always come first. The fixture comes after them.

## WPI E2E fixtures

The HTTP E2E runner prepares the fixture before the `request:` closure because the request can need prepared state.

```php
<?php

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Tests\Fixtures\Probe;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Tests\Suite\Test\Specification;

$Probe = new Probe(['requestFixture' => false]);

return new Specification(
   Fixture: $Probe,
   request: function (string $host, int $index, Probe $Probe): string {
      $Probe->State->update('requestFixture', true);

      return "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n";
   },
   test: function (string $response, Probe $Probe): bool {
      return $Probe->fetch('requestFixture') === true;
   }
);
```

The `request:` closure receives `host`, `index` and the fixture only when its signature accepts the fixture.

## Best practices

- Use fixtures for state shared between `request:`, `response:` and `test:`.
- Prefer `Fixture::fetch()` and `State::update()` instead of arrays captured by reference.
- Keep `setup()` and `teardown()` small and explicit.
- Declare `Suite(Fixture:)` for default suite state and `Specification(Fixture:)` for local exceptions.
