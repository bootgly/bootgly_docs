# Behaviors (Values)

Value behaviors validate semantic properties of a value using the `Value` enum with `->to->be()`.

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Value;
```

## Available values

| Enum | Description |
| ---- | ----------- |
| `Value::Empty` | Empty value. |
| `Value::NaN` | Not a Number. |
| `Value::Even` | Even number. |
| `Value::Odd` | Odd number. |
| `Value::Positive` | Positive number. |
| `Value::Negative` | Negative number. |
| `Value::Infinite` | Infinite number. |
| `Value::Lowercase` | Lowercase string. |
| `Value::Uppercase` | Uppercase string. |
| `Value::Alphanumeric` | Alphanumeric string. |
| `Value::Numeric` | Numeric string. |
| `Value::Alpha` | Alphabetic string. |
| `Value::Email` | Email format. |
| `Value::URL` | URL format. |
| `Value::IP` | IP format. |
| `Value::UUID` | UUID format. |

## Examples

```php
yield new Assertion(description: 'Even number')
   ->expect(4)
   ->to->be(Value::Even)
   ->assert();

yield new Assertion(description: 'Positive number')
   ->expect(42)
   ->to->be(Value::Positive)
   ->assert();

yield new Assertion(description: 'Lowercase string')
   ->expect('bootgly')
   ->to->be(Value::Lowercase)
   ->assert();
```

## Best practices

- Use `Value` when the rule validates a value characteristic, not its raw type.
- Prefer descriptions that state the expected behavior.
- For formats like email, URL, IP and UUID, validate representative domain data.
