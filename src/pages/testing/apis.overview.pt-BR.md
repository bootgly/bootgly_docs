# APIs de Teste

No Bootgly, os arquivos de casos de testes possuem duas estruturas, uma para a API Básica, outra para a API avançada de testes.

## Caso de teste

No Bootgly, os arquivos de casos de testes possuem duas estruturas, uma para a API Básica, outra para a API avançada de testes.

### Estrutura da API Básica

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   // @ configure
   description: 'Descrição do caso de teste aqui',
   // @ test
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
   // @ configure
   description: 'Descrição do caso de teste aqui',
   // @ test
   test: new Assertions(Case: function (): Generator
   {
      // implement assertions here
   })
);
```
