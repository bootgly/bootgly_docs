# Skip and Ignore

`skip` and `ignore` control whether a test case or assertion should run. Use these resources to handle temporarily disabled scenarios without removing the test from code.

## Difference between Skip and Ignore

| Resource | Behavior |
| -------- | -------- |
| `skip` | Skips the case with visible output. |
| `ignore` | Skips the case silently, without output. |
| `Assertion::skip()` | Skips a specific assertion in the Advanced API. |

## Skip in Specification

The `skip` parameter in `Specification` skips a test case and keeps the indication in the output.

```php
return new Specification(
   description: 'Test to skip',
   skip: true,
   test: function (): bool
   {
      return true;
   }
);
```

Use `skip` when the test should remain visible to show pending work or a temporary dependency.

## Ignore in Specification

The `ignore` parameter skips a test case silently.

```php
return new Specification(
   description: 'Test to ignore',
   ignore: true,
   test: function (): bool
   {
      return true;
   }
);
```

Use `ignore` when the case should not appear in the execution output.

## Skip in the Advanced API

In the Advanced API, use `->skip()` on a specific assertion.

```php
yield new Assertion(description: 'Skipped assertion')
   ->skip();
```

This format keeps control at the assertion level without disabling the whole `Specification`.

## Best practices

- Prefer `skip` for temporarily blocked and visible work.
- Prefer `ignore` for cases that should stay out of the output.
- Avoid keeping tests skipped for too long without a documented reason.
- Use `Assertion::skip()` when only one check inside the Advanced API should be skipped.
