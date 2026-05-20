# Delimiters

Delimiters validate whether a value is inside a range. Use `->to->delimit()` to express bounds in a readable way.

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Interval;
```

## Interval types

| Enum | Notation | Description |
| ---- | -------- | ----------- |
| `Interval::Closed` | `[min, max]` | Includes both bounds. This is the default. |
| `Interval::Open` | `(min, max)` | Excludes both bounds. |
| `Interval::LeftOpen` | `(min, max]` | Excludes min and includes max. |
| `Interval::RightOpen` | `[min, max)` | Includes min and excludes max. |

## Examples

```php
// integer
yield new Assertion(description: 'Between integers')
   ->expect(1)
   ->to->delimit(1, 2)
   ->assert();

// float
yield new Assertion(description: 'Between floats')
   ->expect(1.5)
   ->to->delimit(1.5, 2.5)
   ->assert();

// DateTime
$Date = new DateTime('2023-01-01');
yield new Assertion(description: 'Between DateTime objects')
   ->expect($Date)
   ->to->delimit($Date, new DateTime('2023-01-02'))
   ->assert();
```

## Best practices

- Use closed intervals when the bounds are valid too.
- Choose open or half-open intervals when edges should fail.
- Describe the value unit in the assertion text when needed.
