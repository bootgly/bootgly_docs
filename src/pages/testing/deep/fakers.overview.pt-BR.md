# Fakers

Fakers geram dados falsos sem depender de pacotes externos. Eles ficam em `Bootgly\ACI`, usam recursos nativos do PHP e podem ser determinísticos quando recebem uma seed.

## Recursos disponíveis

| Faker | Saída |
| ----- | ----- |
| `Email` | Endereço de email fake. |
| `Integer` | Inteiro dentro de um intervalo configurável. |
| `Name` | Nome completo fake. |
| `Text` | Texto com palavras de um léxico interno. |
| `UUID` | UUID v4 no formato RFC 4122. |

Todos os fakers concretos estendem `Bootgly\ACI\Faker` e implementam `generate()`.

## Seed determinística

Passe `seed:` para repetir a mesma saída em execuções diferentes.

```php
<?php

use Bootgly\ACI\Fakers\UUID;

$First = new UUID(seed: 42);
$Second = new UUID(seed: 42);

$First->generate() === $Second->generate(); // true
```

Use seeds quando o teste precisa de dados variados, mas estáveis.

## Email

```php
<?php

use Bootgly\ACI\Fakers\Email;

$Email = new Email(seed: 7);

$value = $Email->generate();
```

`Email` combina um nome fake com um domínio de exemplo.

## Integer

`Integer` permite configurar limites inclusivos.

```php
<?php

use Bootgly\ACI\Fakers\Integer;

$Integer = new Integer(seed: 10);
$Integer->min = 100;
$Integer->max = 999;

$value = $Integer->generate();
```

## Name

```php
<?php

use Bootgly\ACI\Fakers\Name;

$Name = new Name(seed: 3);

$value = $Name->generate();
```

`Name` usa listas internas de nomes e sobrenomes.

## Text

`Text` gera uma sequência de palavras. A propriedade `words` controla a quantidade.

```php
<?php

use Bootgly\ACI\Fakers\Text;

$Text = new Text(seed: 5);
$Text->words = 8;

$value = $Text->generate();
```

## UUID

```php
<?php

use Bootgly\ACI\Fakers\UUID;

$UUID = new UUID(seed: 1);

$value = $UUID->generate();
```

A saída segue o layout de UUID v4:

```txt
xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
```

## Trait `Fakers`

O trait `Fakers` oferece o atalho `fake($kind, $seed)` para classes que querem gerar dados por nome.

```php
<?php

use Bootgly\ACI\Fakers;

$Host = new class {
   use Fakers;
};

$id = $Host->fake('UUID', seed: 9);
$name = $Host->fake('Name', seed: 9);
```

O dispatch aceita aliases canônicos para os fakers nativos, incluindo `uuid`, `Uuid` e `UUID`.

## Exemplo em uma Specification

```php
<?php

use Generator;

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Assertions;
use Bootgly\ACI\Fakers\Email;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'Email faker should be deterministic',
   test: new Assertions(Case: function (): Generator {
      $Email = new Email(seed: 33);

      yield (new Assertion(description: 'same seed keeps output stable'))
         ->expect($Email->generate())
         ->to->be((new Email(seed: 33))->generate())
         ->assert();
   })
);
```

## Boas práticas

- Sempre use seed em testes que comparam a saída gerada.
- Prefira fakers nativos do Bootgly em vez de dependências externas.
- Ajuste propriedades públicas como `Integer::$min`, `Integer::$max` e `Text::$words` antes de chamar `generate()`.
- Gere os valores dentro do teste quando a seed faz parte da expectativa.
