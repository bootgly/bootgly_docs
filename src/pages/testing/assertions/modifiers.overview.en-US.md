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

## Best practices

- Use `not` to negate a simple intent.
- Use `and` when all conditions are part of the same contract.
- Use `or` only when alternatives are truly valid.
- Avoid chains that are too long; split them into smaller assertions when readability suffers.
