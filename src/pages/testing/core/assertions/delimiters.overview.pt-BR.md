# Delimitadores

Delimitadores validam se um valor está dentro de um intervalo. Use `->to->delimit()` para expressar limites de forma legível.

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Interval;
```

## Tipos de intervalo

| Enum | Notação | Descrição |
| ---- | ------- | --------- |
| `Interval::Closed` | `[min, max]` | Inclui ambos os limites. É o padrão. |
| `Interval::Open` | `(min, max)` | Exclui ambos os limites. |
| `Interval::LeftOpen` | `(min, max]` | Exclui mínimo e inclui máximo. |
| `Interval::RightOpen` | `[min, max)` | Inclui mínimo e exclui máximo. |

## Exemplos

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

## Boas práticas

- Use intervalos fechados quando os limites também são válidos.
- Escolha intervalos abertos ou semiabertos quando bordas devem falhar.
- Descreva a unidade do valor no texto da assertion quando necessário.
