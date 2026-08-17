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
use Bootgly\ABI\Code\__String\Path;
use Bootgly\ACI\Tests\Assertion\Expectations\Matchers\VariadicDirPath;

// A directory holding the versioned entries `8.3/` and `8.4/`.
// Build the fixture in the test instead of pointing at a system path:
// those differ per distribution and make the suite non-portable.
$base = sys_get_temp_dir() . '/releases/';

$Path = new Path($base);
$Path->match(path: '%', pattern: '8.*');
yield new Assertion(description: 'Valid relative path')
   ->assert(
      actual: (string) $Path,
      expected: new VariadicDirPath($base . '8.*'),
   );
```

`match()` also accepts the absolute form, with the `%` placeholder inside the
path itself — useful when there is no constructed path to match against:

```php
$Path = new Path;
$Path->match(path: $base . '%', pattern: '8.*');
```

## Best practices

- Use matchers when format matters more than literal equality.
- Keep regexes small and readable.
- Prefer dedicated matcher classes when the rule has its own semantics.
- Describe the expected pattern in the assertion text.
