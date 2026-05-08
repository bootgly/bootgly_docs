# Asserções de Teste

Asserções são o núcleo dos testes no Bootgly. Elas podem ser escritas pela API Básica, retornando valores diretamente, ou pela API Avançada, usando `Assertion` e a interface fluente.

## Asserções - API Básica

Na API Básica, o caso de teste pode retornar um booleano diretamente. Se o teste passou, retorne `true`; se falhou, retorne `false`.

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;
use Bootgly\ACI\Tests\Suite\Test\Specification\Separator;

return new Specification(
   Separator: new Separator(line: 'Basic API'),
   description: 'It should assert returning true',
   test: function (): bool
   {
      return true === true;
   }
);
```

Essa API foca em performance máxima e também serve como porta de entrada para quem está começando com QA no Bootgly.

### Retestes

Use o parâmetro `retest` em `Specification` para repetir um teste quando necessário.

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'It should assert returning boolean (retestable)',
   test: function (bool $expected = false): bool
   {
      return true === $expected;
   },
   retest: function (callable $test, bool $passed, mixed ...$arguments): string|bool|null
   {
      if ($passed === false) {
         return $test(true);
      }

      return null;
   }
);
```

### Descrevendo asserções

Na API Básica, use a propriedade estática `Assertion::$description` para descrever a asserção atual.

```php
<?php

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;
use Bootgly\ACI\Tests\Suite\Test\Specification\Separator;

return new Specification(
   Separator: new Separator(line: 'Basic API'),
   description: 'It should assert returning true',
   test: function (): bool
   {
      Assertion::$description = 'Asserting that true is true';

      return true === true;
   }
);
```

### Fallbacks em asserções

Na API Básica, uma string pode ser retornada como fallback quando a asserção falha.

```php
<?php

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'It should assert returning string (fallback)',
   test: function (bool $expected = false): string|bool
   {
      if ($expected === false) {
         Assertion::$description = 'Asserting that true is false';

         return 'This is a fallback message (test failed)!';
      }

      Assertion::$description = 'Asserting that true is true';

      return true;
   }
);
```

### Múltiplas asserções

Use `yield` para retornar múltiplas asserções no mesmo caso de teste.

```php
<?php

use Generator;

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'It should assert returning true (with yield)',
   test: function (): Generator
   {
      yield true === true;

      Assertion::$description = 'Asserting that true is not false';
      yield true !== false;
   }
);
```

## Asserções - API Avançada

A API Avançada usa a classe `Assertion` com uma interface fluente encadeável. Ela opera dentro de um wrapper `Assertions` que recebe um `Generator`.

### Estilo 1: expect com operador

Use o enum `Op` para comparações diretas.

```php
<?php

use Generator;

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Op;
use Bootgly\ACI\Tests\Assertions;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'It should use assert API',
   test: new Assertions(Case: function (): Generator
   {
      yield new Assertion(description: 'expect (comparing values)')
         ->expect(2, Op::Identical, 2)
         ->assert();
   })
);
```

### Estilo 2: expect com cadeia fluente

Use a cadeia `->to->be()` para comparações legíveis.

```php
yield new Assertion(description: 'to be [true] (implicit)')
   ->expect(true)
   ->to->be(true)
   ->assert();
```

Também é possível passar um comparador explicitamente.

```php
use Bootgly\ACI\Tests\Assertion\Comparators\Identical;

yield new Assertion(description: 'to be [true] (explicit)')
   ->expect(actual: true)
   ->to->be(expected: new Identical(true))
   ->assert();
```

### Estilo 3: assert direto

Passe valores diretamente para `assert()`.

```php
yield new Assertion(description: 'assert direto')
   ->assert(
      actual: 'Hello',
      expected: 'Hello',
   );
```

## Comparadores

A API Avançada disponibiliza operadores de comparação através do enum `Op`.

| Operador | Enum | Significado PHP |
| -------- | ---- | --------------- |
| `==` | `Op::Equal` | Igualdade loose. |
| `!=` | `Op::NotEqual` | Desigualdade loose. |
| `===` | `Op::Identical` | Igualdade estrita. É o padrão. |
| `!==` | `Op::NotIdentical` | Desigualdade estrita. |
| `>` | `Op::GreaterThan` | Maior que. |
| `<` | `Op::LessThan` | Menor que. |
| `>=` | `Op::GreaterThanOrEqual` | Maior ou igual. |
| `<=` | `Op::LessThanOrEqual` | Menor ou igual. |

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Op;

yield new Assertion(description: 'Equal [int]')
   ->expect(1, Op::Equal, 1)
   ->assert();

yield new Assertion(description: 'Greater than')
   ->expect(2, Op::GreaterThan, 1)
   ->assert();

yield new Assertion(description: 'Less than or equal')
   ->expect(1, Op::LessThanOrEqual, 2)
   ->assert();
```

Quando `->to->be($expected)` é usado sem comparador explícito, o comparador padrão é `Identical` (`===`).

```php
yield new Assertion(description: 'Equal strings')
   ->expect('Bootgly')
   ->to->be('Bootgly')
   ->assert();
```

Os comparadores suportam `bool`, `int`, `float`, `string`, `array` e `object`.

As famílias específicas de expectations ficam nas próximas páginas: Modificadores, Behaviors, Delimitadores, Finders, Matchers, Throwers e Waiters.
