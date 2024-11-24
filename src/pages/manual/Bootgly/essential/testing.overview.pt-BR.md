# Testando

O Bootgly possui duas APIs para testes, uma API Básica e uma API avançada! Antes de implementar os testes em si, vamos começar entendendo o padrão de estrutura dos arquivos e diretórios dos testes no Bootgly...

## Estrutura dos testes no Bootgly

Os arquivos de testes no Bootgly seguem o padrão de diretórios e arquivos `recursos`. Os testes implementados em cada módulo devem ser colocados dentro de uma pasta de mesmo nível do módulo e esta pasta deve se chamar "tests". Em cada pasta "tests", deve existir o arquivo de boostrap da suite de testes, nomeados como "@.php". Os arquivos que implementam os casos de testes se encontram dentro da pasta `tests` e possuem o seguinte padrão: `*.test.php`.

Você tem a liberdade para definir o nome que quiser nos arquivos de casos de testes no Bootgly, porém, é recomendado seguir o padrão já existente. Um exemplo de nome de arquivo de caso de teste implementado no Bootgly é: `1.01-request_as_response-address.test.php`.

### Diretório `tests` + arquivos de Casos de Teste

```txt
tests
└── @.php  # Bootstrap file for the suite
└── 1.1-some_case-part1.test.php  # Test Case file
└── 1.2-other_case-part2.test.php  # Test Case file
└── 2.1-another_case.test.php  # Test Case file
...
```

### Diagrama visual

Considerando que você já possui um conhecimento básico sobre testes, o diagrama abaixo mostra como os testes podem ser estruturados no Bootgly:

```txt
Test Suite
└── Test Case
    └── Assertions
        ├── Assertion
        └── Assertion
        ...
└── Test Case
    └── Assertions
        ├── Assertion
        └── Assertion
```

O diagrama acima é um modelo mental de como os testes foram projetados no Bootgly.

### Visão geral

```txt
tests
└── @.php  # Bootstrap file for the suite
└── 1.1-some_case.test.php  # Test Case files
   └-- Assertions
      ├-- Assertion
      └-- Assertion
```

## Suite de teste

Todo arquivo de bootstrap que define a suite de testes possui uma estrutura padrão como no exemplo abaixo:

```php
<?php

# namespace aqui

return [
   // * Config
   'autoBoot' => __DIR__,
   'autoInstance' => true,
   'autoReport' => true,
   'autoSummarize' => true,
   'exitOnFailure' => true,
   // * Data
   'suiteName' => __NAMESPACE__,
   'tests' => [ // arquivos que apontam para o diretório raiz de onde se encontra o arquivo "@.php"
      '1.0-name' // o sufixo ".test.php" deve ser omitido
   ]
];

```

Exemplo real de uma suite de testes definida no Bootgly:

```php
<?php # Bootgly/ABI/Data/__String/tests/@.php

namespace Bootgly\ABI\Data\__String;


return [
   // * Config
   'autoBoot' => __DIR__,
   'autoInstance' => true,
   'autoReport' => true,
   'autoSummarize' => true,
   'exitOnFailure' => true,
   // * Data
   'suiteName' => __NAMESPACE__,
   'tests' => [
      '1.x-dynamic-props-length',
      '1.x-dynamic-props-lowercase',
      '1.x-dynamic-props-pascalcase',
      '2.x-dynamic-methods-pad',
      '2.x-dynamic-methods-search',
   ]
];
```

## Caso de teste

No Bootgly, os arquivos de casos de testes possuem duas estruturas, uma para a API Básica, outra para a API avançada de testes.

### Estrutura da API Básica

```php
<?php

return [
   // @ configure
   'describe' => 'Descrição do caso de teste aqui',
   // ...
   // @ simulate
   // ...
   // @ test
   'test' => function (): string|bool|null
   {
      // implement assertions here
   }
   // ...
];
```

### Estrutura da API Avançada

```php
<?php


use Generator;

use Bootgly\ACI\Tests\Cases\Assertion;
use Bootgly\ACI\Tests\Cases\Assertions;


return [
   // @ configure
   'describe' => 'Descrição do caso de teste aqui',
   // ...
   // @ simulate
   // ...
   // @ test
   'test' => new Assertions(function (): Generator
   {
      // implement assertions here
   })
   // ...
];
```

## Asserções - API Básica

Na API Básica, você pode retornar um booleano diretamente. Se o teste passou, deve retornar `true`, se falhou, deve retornar `false`:

```php
<?php

return [
   // @ configure
   'separator.line' => 'Basic API',
   'describe' => 'It should assert returning true',
   // @ simulate
   // ...
   // @ test
   'test' => function (): bool
   {
      return true === true;
   }
];
```

Esta API tem foco em performance máxima nos testes ou é quem está aprendendo sobre a área de QA. Testes no Bootgly possuem uma API progressiva e por isso começam do básico até o que tem de mais avançado, isso permite qualquer pessoa poder implementar testes sem dificuldades.

### Retestes

É possível retestar um teste (para o caso de falha, repetições, etc.). Utilize a chave `'retest'` no retorno do caso de testes para implementar um `Closure` com o seguinte Code API:

```php
<?php

return [
   // @ configure
   'describe' => 'It should assert returning boolean (retestable)',
   // @ simulate
   // ...
   // @ test
   'test' => function (bool $expected = false): bool
   {
      return true === $expected;
   },
   'retest' => function (callable $test, bool $passed, mixed ...$arguments): string|bool|null
   {
      // ? Se o último teste falhar, repita o teste modificando o dataset (input)
      if ($passed === false) {
         return $test(true);
      }

      return null;
   }
];
```

Utilize os parâmetros do Closure manipular o reteste como quiser!

### Descrevendo asserções

Na API básica, é possível descrever uma asserção utilizando a propriedade estática `$description` da classe `Assertion`:

```php
<?php

use Bootgly\ACI\Tests\Cases\Assertion;

return [
   // @ configure
   'separator.line' => 'Basic API',
   'describe' => 'It should assert returning true',
   // @ simulate
   // ...
   // @ test
   'test' => function (): bool
   {
      Assertion::$description = 'Asserting that true is true';
      return true === true;
   }
];
```

### Fallbacks em asserções

Na API básica, é possível retornar um fallback caso uma asserção falhe...

```php
<?php

use Bootgly\ACI\Tests\Cases\Assertion;

return [
   // @ configure
   'describe' => 'It should assert returning string (fallback)',
   // @ test
   'test' => function (bool $expected = false): string|bool
   {
      if ($expected === false) {
         Assertion::$description = 'Asserting that true is false';
         return "This is a fallback message (test failed)!";
      }

      Assertion::$description = 'Asserting that true is true';
      return true;
   },
   'retest' => function (callable $test, bool $passed, mixed ...$arguments): string|bool|null
   {
      if ($passed === false) {
         return $test(true);
      }

      return null;
   }
];
```

### Múltiplas asserções

Para um mesmo caso de teste, na API Básica, já é possível retornar múltiplas asserções utilizando `yield`...

```php
<?php

use Generator;
use Bootgly\ACI\Tests\Cases\Assertion;

return [
   // @ configure
   'describe' => 'It should assert returning true (with yield)',
   // @ simulate
   // ...
   // @ test
   'test' => function (): Generator
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
];
```
