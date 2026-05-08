# Hooks

Hooks execute code before or after assertions in the Advanced API. They centralize setup, cleanup and instrumentation without duplicating logic inside each `Assertion`.

## Import

```php
use Bootgly\ACI\Tests\Assertions\Hook;
```

## Available hooks

| Hook | When |
| ---- | ---- |
| `Hook::BeforeAll` | Before all assertions. |
| `Hook::AfterAll` | After all assertions. |
| `Hook::BeforeEach` | Before each assertion. |
| `Hook::AfterEach` | After each assertion. |

## Basic example

```php
return new Specification(
   description: 'It should compare equal values',
   test: new Assertions(Case: function (): Generator
   {
      yield new Assertion(description: 'Equal integers')
         ->expect(1)
         ->to->be(1)
         ->assert();
   })
      ->input('test')
      ->on(Hook::BeforeEach, function ($Assertion, $arguments): void
      {
         // execute something before each assertion
      })
);
```

## Datasets with `input()`

Use `->input()` to pass data to the assertions Closure.

```php
test: new Assertions(Case: function (): Generator
{
   yield new Assertion(description: 'Test with data')
      ->expect(1)
      ->to->be(1)
      ->assert();
})
   ->input('value1', 'value2', 'value3')
```

The API runs the Closure with the configured inputs and preserves hook order around assertions.

## Useful scenarios

- prepare state before each assertion;
- clean resources after each assertion;
- measure duration per assertion;
- add context to the report;
- share simple datasets with `input()`.

## Best practices

- Use `BeforeAll` and `AfterAll` for work local to the `Assertions` block.
- Use `BeforeEach` and `AfterEach` for state that changes per assertion.
- Keep hooks small; complex logic should live in fixtures or helpers.
- Avoid changing assertion expectations inside hooks unless explicitly needed.
