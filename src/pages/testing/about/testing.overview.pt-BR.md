# Fundamentos de Testes

O Bootgly possui duas APIs para testes, uma API Básica e uma API Avançada. Antes de implementar os casos, comece pela estrutura de arquivos, suíte, APIs de caso de teste e separadores visuais.

## Estrutura dos testes no Bootgly

Os testes implementados em cada módulo devem ser colocados em uma pasta de mesmo nível chamada `tests`. Em cada pasta `tests`, deve existir o arquivo de bootstrap da suíte, nomeado como `@.php`. Os arquivos que implementam os casos de teste ficam dentro da pasta `tests` e seguem o padrão `*.test.php`.

Você pode definir o nome dos arquivos de caso de teste, mas é recomendado seguir o padrão existente. Um exemplo real é `1.01-request_as_response-address.test.php`.

### Diretório + arquivos

```txt
tests
└── @.php  # Bootstrap file for the suite
└── 1.1-some_case-part1.test.php  # Test Case file
└── 1.2-other_case-part2.test.php  # Test Case file
└── 2.1-another_case.test.php  # Test Case file
...
```

### Diagrama visual

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

Todo arquivo de bootstrap que define a suíte de testes possui uma estrutura padrão.

```php
<?php

# namespace aqui

use Bootgly\ACI\Tests\Suite;

return new Suite(
   // * Config
   autoBoot: __DIR__,
   autoInstance: true,
   autoReport: true,
   autoSummarize: true,
   exitOnFailure: true,
   // * Data
   suiteName: __NAMESPACE__,
   tests: [
      '1.0-name' // o sufixo ".test.php" deve ser omitido
   ]
);
```

Exemplo real de uma suíte de testes definida no Bootgly:

```php
<?php # Bootgly/ABI/Data/__String/tests/@.php

namespace Bootgly\ABI\Data\__String;

use Bootgly\ACI\Tests\Suite;

return new Suite(
   // * Config
   autoBoot: __DIR__,
   autoInstance: true,
   autoReport: true,
   autoSummarize: true,
   exitOnFailure: true,
   // * Data
   suiteName: __NAMESPACE__,
   tests: [
      '1.x-dynamic-props-length',
      '1.x-dynamic-props-lowercase',
      '1.x-dynamic-props-pascalcase',
      '2.x-dynamic-methods-pad',
      '2.x-dynamic-methods-search',
   ]
);
```

## Casos de teste

Os arquivos de caso de teste possuem duas estruturas principais: uma para a API Básica e outra para a API Avançada.

### Estrutura da API Básica

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'Descrição do caso de teste aqui',
   test: function (): string|bool|null
   {
      // implement assertions here
   }
);
```

### Estrutura da API Avançada

```php
<?php

use Generator;

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Assertions;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'Descrição do caso de teste aqui',
   test: new Assertions(Case: function (): Generator
   {
      // implement assertions here
   })
);
```

## Separadores Visuais

Use a classe `Separator` para organizar a saída dos testes com separadores visuais desde a estrutura básica da `Specification`.

```php
use Bootgly\ACI\Tests\Suite\Test\Specification\Separator;

return new Specification(
   Separator: new Separator(
      line: 'Section Name',    // Linha separadora com rótulo
      left: 'Category',        // Rótulo à esquerda
      header: 'Main Section',  // Cabeçalho da seção
   ),
   description: 'Test case',
   test: function (): bool
   {
      return true;
   }
);
```

| Propriedade | Tipo | Descrição |
| ----------- | ---- | --------- |
| `line` | `bool\|string\|null` | Linha separadora. Use `true` para linha simples ou `string` para rótulo. |
| `left` | `string\|null` | Rótulo exibido à esquerda. |
| `header` | `string\|null` | Cabeçalho da seção. |
