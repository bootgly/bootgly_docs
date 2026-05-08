# Matchers

Matchers verify values through pattern matching. They are useful when the expectation is not a literal value, but an expected shape or structure.

## Regex

`Regex` validates strings with regular expressions.

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Matchers\Regex;

yield new Assertion(description: 'Matches string')
   ->assert(
      actual: 'Hello, World!',
      expected: new Regex('/World/'),
   );
```

Use regex when a rule must validate format, variable prefixes, groups or optional fragments.

## VariadicDirPath

`VariadicDirPath` validates directory paths with variadic patterns.

```php
use Bootgly\ABI\Data\__String\Path;
use Bootgly\ACI\Tests\Assertion\Expectations\Matchers\VariadicDirPath;

$Path = new Path('/etc/php/');
$Path->match(path: '%', pattern: '8.*');
yield new Assertion(description: 'Valid relative path')
   ->assert(
      actual: (string) $Path,
      expected: new VariadicDirPath('/etc/php/8.*'),
   );
```

## Best practices

- Use matchers when format matters more than literal equality.
- Keep regexes small and readable.
- Prefer dedicated matcher classes when the rule has its own semantics.
- Describe the expected pattern in the assertion text.
