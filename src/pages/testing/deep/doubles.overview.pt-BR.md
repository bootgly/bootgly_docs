# Doubles

Doubles permitem substituir colaboradores reais durante um teste. No Bootgly, o recurso é nativo em `Bootgly\ACI\Tests` e cobre quatro necessidades principais:

- `Mock`: substitui uma interface ou classe não-final com respostas controladas.
- `Spy`: envolve uma instância real, delega chamadas e registra interações.
- `Fake`: fornece uma implementação funcional, stateful e determinística de um colaborador.
- `Doubles`: registry simples para resetar vários doubles juntos.

## Fake

Use `Fake` quando o teste precisa de comportamento realista com estado interno, mas não precisa registrar chamadas nem gerar proxy. Um Fake é útil quando a relação entre chamadas importa, por exemplo: `set('k', 'v')` → `check('k')` → `get('k')`.

Fakes implementam `Doubling`, então podem ser registrados em `Doubles` e resetados junto com `Mock` e `Spy`.

### Fake\Memory

`Fake\Memory` é um key-value store em memória para colaboradores com shape parecido com sessão, cache ou storage simples.

```php
<?php

use Bootgly\ACI\Tests\Doubles\Fake\Memory;

$Session = new Memory();

$Session->set('_csrf_token', 'abc123');

$exists = $Session->check('_csrf_token'); // true
$token = $Session->get('_csrf_token');    // 'abc123'

$Session->delete('_csrf_token');
$Session->flush();
$Session->reset();
```

API pública:

| Método | Comportamento |
| ------ | ------------- |
| `check(string $name): bool` | Retorna `true` quando a chave existe, mesmo se o valor for `null`. |
| `get(string $name, mixed $default = null): mixed` | Retorna o valor ou o default quando a chave não existe ou vale `null`. |
| `set(string $name, mixed $value): void` | Armazena um valor. |
| `delete(string $name): void` | Remove uma chave. |
| `list(): array<string,mixed>` | Retorna todos os dados armazenados. |
| `flush(): void` | Remove todos os dados. |
| `reset(): static` | Limpa o estado e retorna o próprio Fake. |

### Fake\Clock

`Fake\Clock` é um relógio determinístico para testes sensíveis a tempo. O timestamp atual fica na propriedade `now`.

```php
<?php

use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock(100);

$Clock->now; // 100.0

$Clock->advance(60);
$Clock->now; // 160.0

$Clock->freeze(42.5);
$Clock->now; // 42.5

$Clock->reset();
$Clock->now; // 100.0
```

Quando o SUT aceita um provider de tempo, passe o Fake por uma Closure:

```php
$RateLimit = new RateLimit(
   limit: 3,
   window: 60,
   clock: fn (): float => $Clock->now
);
```

API pública:

| Membro | Comportamento |
| ------ | ------------- |
| `now: float` | Timestamp atual do relógio fake. |
| `advance(int|float $seconds): void` | Avança o relógio em segundos. |
| `freeze(int|float $at): void` | Fixa o relógio em um timestamp exato. |
| `reset(): static` | Restaura o timestamp inicial e retorna o próprio Fake. |

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
use Bootgly\ACI\Tests\Doubles\Fake\Memory;
use Bootgly\ACI\Tests\Doubles\Mock;

$Doubles = new Doubles();

$Auth = $Doubles->add(new Mock(Authing::class));
$Auth->stub('check', true);

$Session = $Doubles->add(new Memory());
$Session->set('_csrf_token', 'abc123');

$Doubles->reset(); // reseta Calls/Stubs e limpa o estado dos Fakes registrados
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
- Use `Fake` quando o teste precisa observar estado consistente entre chamadas.
- Use `verify()` para intenção de interação; use asserções normais para estado final.
- Chame `reset()` entre cenários quando o mesmo double for reutilizado.
