# Finders

Finders verificam a presença de valores em strings, arrays, objetos e estruturas de runtime. Eles podem ser usados via `assert()` direto ou via `->find()`.

## Contains

`Contains` verifica se um valor contém um determinado elemento.

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

## StartsWith

`StartsWith` verifica se uma string começa com um prefixo.

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Finders\StartsWith;

yield new Assertion(description: 'Starts with string')
   ->assert(
      actual: 'Hello, World!',
      expected: new StartsWith('Hello'),
   );
```

## EndsWith

`EndsWith` verifica se uma string termina com um sufixo.

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Finders\EndsWith;

yield new Assertion(description: 'Ends with string')
   ->assert(
      actual: 'Hello, World!',
      expected: new EndsWith('World!'),
   );
```

## Find via enum In

Para buscas mais específicas, use o enum `In` com o método `->find()`.

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\In;
```

| Enum | Descrição |
| ---- | --------- |
| `In::ArrayKeys` | Busca nas chaves de um array. |
| `In::ArrayValues` | Busca nos valores de um array. |
| `In::ObjectProperties` | Busca nas propriedades de um objeto. |
| `In::ObjectMethods` | Busca nos métodos de um objeto. |
| `In::ClassesDeclared` | Busca nas classes declaradas. |
| `In::InterfacesDeclared` | Busca nas interfaces declaradas. |
| `In::TraitsDeclared` | Busca nas traits declaradas. |

## Boas práticas

- Use `Contains`, `StartsWith` e `EndsWith` quando o finder expressa diretamente a intenção.
- Use `In` quando o alvo da busca precisa ser explícito.
- Prefira descrições que indiquem onde o valor deve ser encontrado.
