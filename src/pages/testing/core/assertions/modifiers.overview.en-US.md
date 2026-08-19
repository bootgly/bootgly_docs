# Modifiers

Modifiers change the logical composition of an expectation in the Advanced API. They let you negate, combine and branch validations through a fluent chain.

## NOT

Use `->not->` to negate an expectation.

```php
yield new Assertion(description: 'NOT to be [true]')
   ->expect(true)
   ->not->to->be(false)
   ->assert();
```

The chain stays close to the test intent: the expected value should not be `false`.

## AND

Use `->and->` to combine multiple expectations with AND logic.

```php
yield new Assertion(description: 'to be [true] AND [true]')
   ->expect(true)
   ->to->be(true)
   ->and
   ->to->be(true)
   ->assert();
```

All expectations chained with `and` must pass.

## OR

Use `->or->` to combine expectations with OR logic.

```php
yield new Assertion(description: 'to be [false] OR [true]')
   ->expect(true)
   ->to->be(false)
   ->or
   ->to->be(true)
   ->assert();
```

In this case, only one expectation needs to pass.

## Combining NOT with AND / OR

`not` negates the expectation that immediately follows it, and nothing else. Everything chained after that is judged on its own terms.

```php
yield new Assertion(description: 'NOT [6] AND [5]')
   ->expect(5)
   ->not->to->be(6)
   ->and
   ->to->be(5)
   ->assert();
```

Both halves must hold here: 5 is not 6, and 5 is 5. Change the second to `->to->be(999)` and the chain fails, because only the first expectation was negated.

To negate a later expectation as well, repeat the modifier before it.

```php
yield new Assertion(description: 'NOT [6] AND NOT [7]')
   ->expect(5)
   ->not->to->be(6)
   ->and
   ->not->to->be(7)
   ->assert();
```

## Best practices

- Use `not` to negate a simple intent.
- Use `and` when all conditions are part of the same contract.
- Use `or` only when alternatives are truly valid.
- Repeat `not` for every expectation you mean to negate; one `not` never carries across the chain.
- Avoid chains that are too long; split them into smaller assertions when readability suffers.
