# Doubles

Doubles permitem substituir colaboradores reais durante um teste. No Bootgly, o recurso é nativo em `Bootgly\ACI\Tests` e cobre três necessidades principais:

- `Mock`: substitui uma interface ou classe não-final com respostas controladas.
- `Spy`: envolve uma instância real, delega chamadas e registra interações.
- `Doubles`: registry simples para resetar vários doubles juntos.

## Mock

Use `Mock` quando o teste precisa controlar o retorno de um colaborador e verificar se um método foi chamado.

```php
<?php

use Bootgly\ACI\Tests\Doubles\Mock;

interface Authing
{
   public function check (string $token): bool;
}

$Auth = new Mock(Authing::class);
$Auth->stub('check', true);

$allowed = $Auth->Proxy->check('abc123');
$called = $Auth->verify('check', times: 1);
```

A propriedade `Proxy` é um objeto gerado em runtime que preserva o contrato do alvo. Ele passa em `instanceof Authing` e encaminha chamadas para o `Mock`.

### Stubs

`stub()` cria uma regra de retorno para um método.

```php
$Auth->stub('check', true);
```

Também é possível usar uma Closure para calcular o retorno com base nos argumentos:

```php
$Auth->stub('check', function (string $token): bool {
   return $token === 'abc123';
});
```

### Throw

Use `throw()` para simular falhas de colaboradores.

```php
$Auth->stub('check')->throw(new RuntimeException('invalid token'));
```

A chamada que lança também é registrada em `Calls`.

### Filtro por argumentos

`filter()` limita quando o stub deve ser aplicado.

```php
$Auth
   ->stub('check', true)
   ->filter(function (string $token): bool {
      return $token === 'admin';
   });
```

## Verificação de chamadas

`verify()` confirma se um método foi chamado. Com `times`, a contagem precisa bater exatamente.

```php
$Auth->Proxy->check('abc123');

$Auth->verify('check');          // true: chamado ao menos uma vez
$Auth->verify('check', times: 1); // true: chamado exatamente uma vez
```

As chamadas ficam disponíveis em `$Auth->Calls`.

```php
$Call = $Auth->Calls->list[0];

$Call->method;    // nome do método
$Call->arguments; // argumentos recebidos
$Call->returned;  // valor retornado
$Call->Threw;     // Throwable, se houve
$Call->at;        // timestamp
```

## Spy

Use `Spy` quando você quer executar a implementação real, mas também registrar chamadas.

```php
<?php

use Bootgly\ACI\Tests\Doubles\Spy;

class Counter
{
   public int $total = 0;

   public function add (int $value): int
   {
      $this->total += $value;

      return $this->total;
   }
}

$Counter = new Counter();
$Spy = new Spy($Counter);

$result = $Spy->Wrapped->add(3);
$called = $Spy->verify('add', times: 1);
```

A propriedade `Wrapped` é o proxy tipado. A propriedade `Real` mantém a instância real.

## Registry Doubles

`Doubles` agrupa objetos que implementam `Doubling` e permite resetar ou limpar todos.

```php
<?php

use Bootgly\ACI\Tests\Doubles;
use Bootgly\ACI\Tests\Doubles\Mock;

$Doubles = new Doubles();

$Auth = $Doubles->add(new Mock(Authing::class));
$Auth->stub('check', true);

$Doubles->reset(); // reseta Calls e Stubs dos doubles registrados
$Doubles->clear(); // remove todos do registry
```

## Limites do proxy

O proxy gerado respeita as restrições da linguagem PHP:

| Situação | Comportamento |
| -------- | ------------- |
| Interface | Suportada. |
| Classe não-final | Suportada. |
| Classe final | Rejeitada. |
| Método final herdado | Não é sobrescrito. |
| Retorno por referência | Rejeitado com `LogicException`. |
| Construtor/destrutor | Não são proxied. |

## Boas práticas

- Use `Mock` para isolar dependências externas e controlar retornos.
- Use `Spy` quando a implementação real deve rodar.
- Use `verify()` para intenção de interação; use asserções normais para estado final.
- Chame `reset()` entre cenários quando o mesmo double for reutilizado.
