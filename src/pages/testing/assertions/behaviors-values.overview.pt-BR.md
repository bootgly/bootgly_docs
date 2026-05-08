# Behaviors (Values)

Behaviors de valor validam propriedades semânticas de um valor usando o enum `Value` com `->to->be()`.

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Value;
```

## Valores disponíveis

| Enum | Descrição |
| ---- | --------- |
| `Value::Empty` | Valor vazio. |
| `Value::NaN` | Not a Number. |
| `Value::Even` | Número par. |
| `Value::Odd` | Número ímpar. |
| `Value::Positive` | Número positivo. |
| `Value::Negative` | Número negativo. |
| `Value::Infinite` | Número infinito. |
| `Value::Lowercase` | String em minúsculas. |
| `Value::Uppercase` | String em maiúsculas. |
| `Value::Alphanumeric` | String alfanumérica. |
| `Value::Numeric` | String numérica. |
| `Value::Alpha` | String alfabética. |
| `Value::Email` | Formato de email. |
| `Value::URL` | Formato de URL. |
| `Value::IP` | Formato de IP. |
| `Value::UUID` | Formato de UUID. |

## Exemplos

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

## Boas práticas

- Use `Value` quando a regra valida uma característica do valor, não seu tipo bruto.
- Prefira descrições que indiquem o comportamento esperado.
- Para formatos como email, URL, IP e UUID, valide dados representativos do domínio testado.
