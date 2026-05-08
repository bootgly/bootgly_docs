# Throwers

Throwers verify whether a callable throws the expected exception, error or throwable. They are used in the Advanced API with the `->to->call()->to->throw()` pattern.

## Basic usage

```php
$callable = function () {
   throw new Exception('Exception');
};

yield new Assertion(description: 'Validating exception')
   ->expect($callable)
   ->to->call()
   ->to->throw(new Exception('Exception'))
   ->assert();
```

## Available throwers

| Class | Catches |
| ----- | ------- |
| `ThrowException` | `Exception` |
| `ThrowError` | `Error` |
| `ThrowThrowable` | `Throwable` |

## Chain intent

The chain separates three steps:

1. `expect($callable)` defines the callable under test.
2. `to->call()` says the expectation must execute the callable.
3. `to->throw(...)` validates the expected throwable.

## Best practices

- Use throwers to test error contracts explicitly.
- Pass the most specific throwable possible.
- Keep the callable small to isolate the line that should throw.
- Use the assertion description to state the expected failure scenario.
