# Asserções de Teste

## Asserções - API Básica

Na API Básica, você pode retornar um booleano diretamente. Se o teste passou, deve retornar `true`, se falhou, deve retornar `false`:

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;
use Bootgly\ACI\Tests\Suite\Test\Specification\Separator;

return new Specification(
   // @ configure
   Separator: new Separator(line: 'Basic API'),
   description: 'It should assert returning true',
   // @ test
   test: function (): bool
   {
      return true === true;
   }
);
```

Esta API tem foco em performance máxima nos testes ou é quem está aprendendo sobre a área de QA. Testes no Bootgly possuem uma API progressiva e por isso começam do básico até o que tem de mais avançado, isso permite qualquer pessoa poder implementar testes sem dificuldades.

### Retestes

É possível retestar um teste (para o caso de falha, repetições, etc.). Utilize o parâmetro `retest` em `Specification` para implementar um `Closure` com o seguinte Code API:

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   // @ configure
   description: 'It should assert returning boolean (retestable)',
   // @ test
   test: function (bool $expected = false): bool
   {
      return true === $expected;
   },
   retest: function (callable $test, bool $passed, mixed ...$arguments): string|bool|null
   {
      // ? Se o último teste falhar, repita o teste modificando o dataset (input)
      if ($passed === false) {
         return $test(true);
      }

      return null;
   }
);
```

Utilize os parâmetros do Closure para manipular o reteste como quiser!

### Descrevendo asserções

Na API básica, é possível descrever uma asserção utilizando a propriedade estática `$description` da classe `Assertion`:

```php
<?php

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;
use Bootgly\ACI\Tests\Suite\Test\Specification\Separator;

return new Specification(
   // @ configure
   Separator: new Separator(line: 'Basic API'),
   description: 'It should assert returning true',
   // @ test
   test: function (): bool
   {
      Assertion::$description = 'Asserting that true is true';
      return true === true;
   }
);
```

### Fallbacks em asserções

Na API básica, é possível retornar um fallback caso uma asserção falhe...

```php
<?php

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   // @ configure
   description: 'It should assert returning string (fallback)',
   // @ test
   test: function (bool $expected = false): string|bool
   {
      if ($expected === false) {
         Assertion::$description = 'Asserting that true is false';
         return "This is a fallback message (test failed)!";
      }

      Assertion::$description = 'Asserting that true is true';
      return true;
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

### Múltiplas asserções

Para um mesmo caso de teste, na API Básica, já é possível retornar múltiplas asserções utilizando `yield`...

```php
<?php

use Generator;
use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   // @ configure
   description: 'It should assert returning true (with yield)',
   // @ test
   test: function (): Generator
   {
      yield true === true;

      Assertion::$description = 'Asserting that true is not false';
      yield true !== false;

      $framework = 'Bootgly';
      if ($framework !== 'Bootgly') {
         yield "Framework is not Bootgly!";
      }
      else {
         Assertion::$description = 'Asserting that framework is Bootgly';
         yield true;
      }
   }
);
```

## Asserções - API Avançada

A API Avançada utiliza a classe `Assertion` com uma interface fluente encadeável para compor expectations expressivas. Ela opera dentro de um wrapper `Assertions` que recebe um `Generator` (usando `yield`).

A API Avançada oferece três estilos de asserção:

### Estilo 1: expect com operador

Utilize o enum `Op` para comparações diretas:

```php
<?php

use Generator;

use Bootgly\ACI\Tests\Assertion\Auxiliaries\Op;
use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Assertions;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'It should use assert API',
   test: new Assertions(Case: function (): Generator
   {
      yield new Assertion(
         description: 'expect (comparing values)',
      )
         ->expect(2, Op::Identical, 2)
         ->assert();
   })
);
```

### Estilo 2: expect com cadeia fluente

Utilize a cadeia `->to->be()` para comparações legíveis:

```php
yield new Assertion(
   description: 'to be [true] (implicit)',
)
   ->expect(true)
   ->to->be(true)
   ->assert();
```

Também é possível ser explícito passando um comparador diretamente:

```php
use Bootgly\ACI\Tests\Assertion\Comparators\Identical;

yield new Assertion(
   description: 'to be [true] (explicit)',
)
   ->expect(actual: true)
   ->to->be(expected: new Identical(true))
   ->assert();
```

### Estilo 3: assert direto

Passe os valores diretamente para o método `assert()`:

```php
yield new Assertion(
   description: 'assert direto',
)
   ->assert(
      actual: 'Hello',
      expected: 'Hello',
   );
```

---

## Comparadores

A API Avançada disponibiliza 8 operadores de comparação através do enum `Op`:

| Operador | Enum | Significado PHP |
|----------|------|-----------------|
| `==` | `Op::Equal` | Igualdade loose |
| `!=` | `Op::NotEqual` | Desigualdade loose |
| `===` | `Op::Identical` | Igualdade estrita (padrão) |
| `!==` | `Op::NotIdentical` | Desigualdade estrita |
| `>` | `Op::GreaterThan` | Maior que |
| `<` | `Op::LessThan` | Menor que |
| `>=` | `Op::GreaterThanOrEqual` | Maior ou igual |
| `<=` | `Op::LessThanOrEqual` | Menor ou igual |

### Comparação com Op (estilo operador)

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Op;

// Equal (==)
yield new Assertion(description: 'Equal [int]')
   ->expect(1, Op::Equal, 1)
   ->assert();

// GreaterThan (>)
yield new Assertion(description: 'Greater than')
   ->expect(2, Op::GreaterThan, 1)
   ->assert();

// LessThanOrEqual (<=)
yield new Assertion(description: 'Less than or equal')
   ->expect(1, Op::LessThanOrEqual, 2)
   ->assert();
```

### Comparação com cadeia fluente (estilo Identical)

Quando você utiliza `->to->be($expected)` sem especificar o comparador, o comparador padrão é `Identical` (`===`):

```php
// boolean
yield new Assertion(description: 'Equal booleans')
   ->expect(true)
   ->to->be(true)
   ->assert();

// string
yield new Assertion(description: 'Equal strings')
   ->expect('Bootgly')
   ->to->be('Bootgly')
   ->assert();

// array
yield new Assertion(description: 'Equal arrays')
   ->expect([1, 2, 3])
   ->to->be([1, 2, 3])
   ->assert();

// object
$object1 = new stdClass();
yield new Assertion(description: 'Equal objects')
   ->expect($object1)
   ->to->be($object1)
   ->assert();
```

Os comparadores suportam os tipos: `bool`, `int`, `float`, `string`, `array` e `object`.

---

## Modificadores

A API Avançada suporta modificadores para compor expectations complexas:

### NOT (negação)

Utilize `->not->` para negar uma expectativa:

```php
yield new Assertion(description: 'NOT to be [true]')
   ->expect(true)
   ->not->to->be(false)
   ->assert();
```

### AND (conjunção)

Utilize `->and->` para combinar múltiplas expectations com lógica AND:

```php
yield new Assertion(description: 'to be [true] AND [true]')
   ->expect(true)
   ->to->be(true)
   ->and
   ->to->be(true)
   ->assert();
```

### OR (disjunção)

Utilize `->or->` para combinar expectations com lógica OR (basta que uma passe):

```php
yield new Assertion(description: 'to be [false] OR [true]')
   ->expect(true)
   ->to->be(false)
   ->or
   ->to->be(true)
   ->assert();
```

---

## Comportamentos (Types)

Utilize o enum `Type` com `->to->be()` para validar o tipo de um valor:

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Type;
```

### Tipos disponíveis

| Enum | Validação PHP |
|------|--------------|
| `Type::Array` | `is_array()` |
| `Type::Boolean` | `is_bool()` |
| `Type::Callable` | `is_callable()` |
| `Type::Countable` | `is_countable()` |
| `Type::Float` | `is_float()` |
| `Type::Integer` | `is_int()` |
| `Type::Iterable` | `is_iterable()` |
| `Type::Null` | `is_null()` |
| `Type::Number` | `is_numeric()` (tipo numérico) |
| `Type::Numeric` | `is_numeric()` |
| `Type::Object` | `is_object()` |
| `Type::Resource` | `is_resource()` |
| `Type::Scalar` | `is_scalar()` |
| `Type::String` | `is_string()` |

### Exemplos

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

## Comportamentos (Values)

Utilize o enum `Value` com `->to->be()` para validar propriedades de um valor:

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Value;
```

### Valores disponíveis

| Enum | Descrição |
|------|-----------|
| `Value::Empty` | Valor vazio |
| `Value::NaN` | Not a Number |
| `Value::Even` | Número par |
| `Value::Odd` | Número ímpar |
| `Value::Positive` | Número positivo |
| `Value::Negative` | Número negativo |
| `Value::Infinite` | Número infinito |
| `Value::Lowercase` | String em minúsculas |
| `Value::Uppercase` | String em maiúsculas |
| `Value::Alphanumeric` | String alfanumérica |
| `Value::Numeric` | String numérica |
| `Value::Alpha` | String alfabética |
| `Value::Email` | Formato de email |
| `Value::URL` | Formato de URL |
| `Value::IP` | Formato de IP |
| `Value::UUID` | Formato de UUID |

### Exemplos

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

---

## Delimitadores (Intervalos)

Utilize `->to->delimit()` para verificar se um valor está dentro de um intervalo:

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Interval;
```

### Tipos de intervalo

| Enum | Notação | Descrição |
|------|---------|-----------|
| `Interval::Closed` | `[min, max]` | Inclui ambos os limites (padrão) |
| `Interval::Open` | `(min, max)` | Exclui ambos os limites |
| `Interval::LeftOpen` | `(min, max]` | Exclui mínimo, inclui máximo |
| `Interval::RightOpen` | `[min, max)` | Inclui mínimo, exclui máximo |

### Exemplos

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
$date = new DateTime('2023-01-01');
yield new Assertion(description: 'Between DateTime objects')
   ->expect($date)
   ->to->delimit($date, new DateTime('2023-01-02'))
   ->assert();
```

---

## Buscadores (Finders)

A API Avançada oferece buscadores para verificar a presença de valores em diferentes estruturas. Os buscadores podem ser usados de duas formas: via `assert()` direto ou via `->find()`.

### Contains

Verifica se um valor contém um determinado elemento (funciona para strings, arrays e objetos):

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Finders\Contains;

// string
yield new Assertion(description: 'Contains string')
   ->assert(
      actual: 'Hello, World!',
      expected: new Contains('World'),
   );

// array
yield new Assertion(description: 'Contains array')
   ->assert(
      actual: ['Hello', 'World!'],
      expected: new Contains('World!'),
   );

// object
$object = new stdClass();
$object->property = 'Hello, World!';
yield new Assertion(description: 'Contains object property')
   ->assert(
      actual: $object,
      expected: new Contains('property'),
   );
```

### StartsWith

Verifica se uma string começa com um determinado prefixo:

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Finders\StartsWith;

yield new Assertion(description: 'Starts with string')
   ->assert(
      actual: 'Hello, World!',
      expected: new StartsWith('Hello'),
   );
```

### EndsWith

Verifica se uma string termina com um determinado sufixo:

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Finders\EndsWith;

yield new Assertion(description: 'Ends with string')
   ->assert(
      actual: 'Hello, World!',
      expected: new EndsWith('World!'),
   );
```

### Find via enum In

Para buscas mais específicas, utilize o enum `In` com o método `->find()`:

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\In;
```

| Enum | Descrição |
|------|-----------|
| `In::ArrayKeys` | Busca nas chaves de um array |
| `In::ArrayValues` | Busca nos valores de um array |
| `In::ObjectProperties` | Busca nas propriedades de um objeto |
| `In::ObjectMethods` | Busca nos métodos de um objeto |
| `In::ClassesDeclared` | Busca nas classes declaradas |
| `In::InterfacesDeclared` | Busca nas interfaces declaradas |
| `In::TraitsDeclared` | Busca nas traits declaradas |

---

## Correspondentes (Matchers)

Utilize matchers para verificar valores com correspondência de padrões.

### Regex

Correspondência com expressões regulares:

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Matchers\Regex;

yield new Assertion(description: 'Matches string')
   ->assert(
      actual: 'Hello, World!',
      expected: new Regex('/World/'),
   );
```

### VariadicDirPath

Correspondência de caminhos de diretório com padrões variádicos:

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
