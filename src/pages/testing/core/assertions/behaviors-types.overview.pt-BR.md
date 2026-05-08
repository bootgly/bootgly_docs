# Behaviors (Types)

Behaviors de tipo validam a natureza de um valor usando o enum `Type` com a cadeia `->to->be()`.

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Type;
```

## Tipos disponíveis

| Enum | Validação PHP |
| ---- | ------------- |
| `Type::Array` | `is_array()` |
| `Type::Boolean` | `is_bool()` |
| `Type::Callable` | `is_callable()` |
| `Type::Countable` | `is_countable()` |
| `Type::Float` | `is_float()` |
| `Type::Integer` | `is_int()` |
| `Type::Iterable` | `is_iterable()` |
| `Type::Null` | `is_null()` |
| `Type::Number` | `is_numeric()` para tipo numérico. |
| `Type::Numeric` | `is_numeric()` |
| `Type::Object` | `is_object()` |
| `Type::Resource` | `is_resource()` |
| `Type::Scalar` | `is_scalar()` |
| `Type::String` | `is_string()` |

## Exemplos

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

## Boas práticas

- Use `Type` quando a intenção principal é validar o tipo.
- Prefira uma assertion por tipo validado para manter descrições claras.
- Combine com modificadores apenas quando a regra de tipo continuar fácil de ler.
