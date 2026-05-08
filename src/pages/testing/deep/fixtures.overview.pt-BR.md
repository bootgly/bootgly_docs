# Fixtures

Fixtures organizam o estado necessário para executar testes de forma determinística. No Bootgly, uma fixture é um objeto que prepara estado antes do caso de teste, disponibiliza uma `State` bag durante a execução e descarta o estado no final.

## Recursos principais

| Recurso | Papel |
| ------- | ----- |
| `Fixture` | Classe base para estado de teste com lifecycle. |
| `Fixture\State` | Bag mutável com seed resetável. |
| `Fixture\Lifecycles` | Enum com os estados do lifecycle. |
| `Suite(Fixture:)` | Fixture padrão propagada para casos sem fixture própria. |
| `Specification(Fixture:)` | Fixture específica do caso de teste. |
| `Assertions::$Fixture` | Fixture injetada pelo runner em closures da API Avançada. |

## Lifecycle

A fixture passa por estados previsíveis:

| Estado | Significado |
| ------ | ----------- |
| `Pristine` | Ainda não preparada. |
| `Preparing` | Executando `setup()`. |
| `Ready` | Pronta para uso no teste. |
| `Disposing` | Executando `teardown()`. |
| `Disposed` | Descarte concluído. |

`prepare()` e `dispose()` são idempotentes. Uma fixture já `Disposed` pode ser preparada novamente; antes disso, ela executa `reset()` para voltar à seed inicial.

## Criando uma fixture

Crie uma classe que estende `Fixture` e sobrescreva `setup()` e `teardown()` somente quando houver trabalho real.

```php
<?php

use Bootgly\ACI\Tests\Fixture;

final class UserFixture extends Fixture
{
   protected function setup (): void
   {
      $this->State->update('user', 'rodrigo');
      $this->State->update('authenticated', true);
   }

   protected function teardown (): void
   {
      parent::teardown();
   }
}
```

Para fixtures simples, a classe base já é suficiente:

```php
$Probe = new class (['status' => 200]) extends Fixture {};
```

## State bag

A `State` bag armazena dados compartilhados entre closures do mesmo caso.

```php
$Fixture->State->update('token', 'abc123');
$token = $Fixture->fetch('token');
$missing = $Fixture->fetch('missing', default: 'fallback');
```

`reset()` restaura a bag para a seed passada no construtor.

## Fixture em Specification

Passe a fixture diretamente para o caso de teste:

```php
<?php

use Bootgly\ACI\Tests\Fixture;
use Bootgly\ACI\Tests\Suite\Test\Specification;

$Probe = new class (['status' => 200]) extends Fixture {};

return new Specification(
   description: 'Fixture should be available',
   Fixture: $Probe,
   test: function (Fixture $Fixture): bool {
      return $Fixture->fetch('status') === 200;
   }
);
```

O runner chama `prepare()` antes da closure de teste e `dispose()` depois.

## Fixture em Suite

Uma suite pode declarar uma fixture padrão. Ela será propagada para Specifications que não declaram `Fixture:`.

```php
<?php

use Bootgly\ACI\Tests\Fixture;
use Bootgly\ACI\Tests\Suite;

$Fixture = new class (['ready' => true]) extends Fixture {};

return new Suite(
   autoBoot: __DIR__,
   autoInstance: true,
   autoReport: true,
   autoSummarize: true,
   exitOnFailure: true,
   suiteName: __NAMESPACE__,
   Fixture: $Fixture,
   tests: [
      '1.1-example',
   ]
);
```

Se a `Specification` também declarar `Fixture:`, a fixture da Specification tem prioridade sobre a fixture da Suite.

## Injeção por assinatura

O Bootgly injeta a fixture como próximo argumento posicional somente quando a assinatura aceita.

```php
test: function (string $payload, Fixture $Fixture): bool {
   return $payload !== '' && $Fixture->fetch('ready') === true;
}
```

Regras de aceitação:

- parâmetro sem tipo aceita;
- `mixed` aceita;
- `object` aceita;
- classe/interface compatível aceita;
- union aceita quando um ramo é compatível;
- intersection aceita quando todos os ramos são compatíveis;
- parâmetro builtin incompatível, como `int`, não recebe a fixture.

Os argumentos do runner sempre vêm primeiro. A fixture vem depois.

## Fixtures em WPI E2E

O runner HTTP E2E prepara a fixture antes da closure `request:` porque a request pode precisar de estado preparado.

```php
<?php

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Tests\Fixtures\Probe;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Tests\Suite\Test\Specification;

$Probe = new Probe(['requestFixture' => false]);

return new Specification(
   Fixture: $Probe,
   request: function (string $host, int $index, Probe $Probe): string {
      $Probe->State->update('requestFixture', true);

      return "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n";
   },
   test: function (string $response, Probe $Probe): bool {
      return $Probe->fetch('requestFixture') === true;
   }
);
```

A closure `request:` recebe `host`, `index` e a fixture somente quando a assinatura aceita a fixture.

## Boas práticas

- Use fixtures para estado compartilhado entre `request:`, `response:` e `test:`.
- Prefira `Fixture::fetch()` e `State::update()` em vez de arrays capturados por referência.
- Mantenha `setup()` e `teardown()` pequenos e explícitos.
- Declare `Suite(Fixture:)` para estado padrão da suíte e `Specification(Fixture:)` para exceções locais.
