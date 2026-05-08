# Behaviors (Types)

Type behaviors validate the nature of a value using the `Type` enum with the `->to->be()` chain.

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Type;
```

## Available types

| Enum | PHP validation |
| ---- | -------------- |
| `Type::Array` | `is_array()` |
| `Type::Boolean` | `is_bool()` |
| `Type::Callable` | `is_callable()` |
| `Type::Countable` | `is_countable()` |
| `Type::Float` | `is_float()` |
| `Type::Integer` | `is_int()` |
| `Type::Iterable` | `is_iterable()` |
| `Type::Null` | `is_null()` |
| `Type::Number` | `is_numeric()` for numeric type. |
| `Type::Numeric` | `is_numeric()` |
| `Type::Object` | `is_object()` |
| `Type::Resource` | `is_resource()` |
| `Type::Scalar` | `is_scalar()` |
| `Type::String` | `is_string()` |

## Examples

```php
// array
yield new Assertion(description: 'Validating array')
   ->expect([])
   ->to->be(Type::Array)
   ->assert();

// boolean
yield new Assertion(description: 'Validating boolean')
   ->expect(true)
   ->to->be(Type::Boolean)
   ->assert();

// callable
yield new Assertion(description: 'Validating callable')
   ->expect(function() {})
   ->to->be(Type::Callable)
   ->assert();

// integer
yield new Assertion(description: 'Validating integer')
   ->expect(1)
   ->to->be(Type::Integer)
   ->assert();

// string
yield new Assertion(description: 'Validating string')
   ->expect('Bootgly')
   ->to->be(Type::String)
   ->assert();
```

## Best practices

- Use `Type` when the main intent is validating type.
- Prefer one assertion per validated type to keep descriptions clear.
- Combine with modifiers only when the type rule remains easy to read.
