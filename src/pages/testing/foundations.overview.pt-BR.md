# Fundamentos de Testes

O Bootgly possui duas APIs para testes, uma API Básica e uma API avançada! Antes de implementar os testes em si, vamos começar entendendo o padrão de estrutura dos arquivos e diretórios dos testes no Bootgly...

## Estrutura dos testes no Bootgly

Os arquivos de testes no Bootgly seguem o padrão de diretórios e arquivos `recursos`. Os testes implementados em cada módulo devem ser colocados dentro de uma pasta de mesmo nível do módulo e esta pasta deve se chamar "tests". Em cada pasta "tests", deve existir o arquivo de boostrap da suite de testes, nomeados como "@.php". Os arquivos que implementam os casos de testes se encontram dentro da pasta `tests` e possuem o seguinte padrão: `*.test.php`.

Você tem a liberdade para definir o nome que quiser nos arquivos de casos de testes no Bootgly, porém, é recomendado seguir o padrão já existente. Um exemplo de nome de arquivo de caso de teste implementado no Bootgly é: `1.01-request_as_response-address.test.php`.

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
   tests: [ // arquivos que apontam para o diretório raiz de onde se encontra o arquivo "@.php"
      '1.0-name' // o sufixo ".test.php" deve ser omitido
   ]
);

```

Exemplo real de uma suite de testes definida no Bootgly:

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
