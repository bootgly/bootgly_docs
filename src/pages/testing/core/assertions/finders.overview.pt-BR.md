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

Para buscas mais específicas, use o enum `In` com o método `->find()`. O `find()` recebe onde procurar e o que procurar; o palheiro vem do `expect()`.

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\In;

yield new Assertion(description: 'The result carries a status')
   ->expect(['status' => 200, 'body' => 'OK'])
   ->to->find(In::ArrayKeys, 'status')
   ->assert();

yield new Assertion(description: 'The handler exposes render()')
   ->expect($Handler)
   ->to->find(In::ObjectMethods, 'render')
   ->assert();
```

Negue com `not` para afirmar ausência.

```php
yield new Assertion(description: 'The result carries no error')
   ->expect(['status' => 200, 'body' => 'OK'])
   ->not->to->find(In::ArrayKeys, 'error')
   ->assert();
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

Os três últimos buscam no que o runtime declarou, não no valor que você esperou. Não há palheiro para dar a eles, mas o `expect()` ainda precisa de um valor, então passe uma string vazia.

```php
yield new Assertion(description: 'The driver class is loadable')
   ->expect('')
   ->to->find(In::ClassesDeclared, Logger::class)
   ->assert();
```

## Boas práticas

- Use `Contains`, `StartsWith` e `EndsWith` quando o finder expressa diretamente a intenção.
- Use `In` quando o alvo da busca precisa ser explícito.
- Prefira descrições que indiquem onde o valor deve ser encontrado.
