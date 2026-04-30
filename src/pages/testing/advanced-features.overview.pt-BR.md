# Recursos Avançados de Teste

## Lançadores (Throwers)

Utilize throwers para verificar se o código lança exceções, erros ou throwables esperados.

### Testando exceções

Utilize o padrão `->to->call()->to->throw()`:

```php
$callable = function () {
   throw new Exception('Exception');
};
yield new Assertion(description: 'Validating exception')
   ->expect($callable)
   ->to->call()
   ->to->throw(new Exception('Exception'))
   ->assert();
```

Os throwers disponíveis são:

| Classe | Captura |
|--------|---------|
| `ThrowException` | `Exception` |
| `ThrowError` | `Error` |
| `ThrowThrowable` | `Throwable` |

---

## Esperadores (Waiters)

Utilize waiters para testar o tempo de execução e performance.

### Uso normal

Verifique se uma função executa dentro de um tempo esperado (em microssegundos):

```php
yield new Assertion(description: 'Validating wait time')
   ->expect(function () {
      usleep(10000);
   })
   ->to->call()
   ->to->wait(10000)
   ->assert();
```

### Closure com Subassertion

Para verificações mais complexas de tempo, utilize uma Closure que recebe a duração medida e retorna sub-asserções:

```php
$callable = function () {
   usleep(1000); // Simula uma tarefa bloqueante
};
yield new Assertion(description: 'Validating wait time (Closure)')
   ->expect($callable)
   ->to->call()
   ->to->wait(function (float $duration): Assertion {
      $this::$description .= " [{$duration} ms]";

      // implicit ->expect($duration)
      return $this
         ->to->delimit(1000, 20000);
      // implicit ->assert()
   })
   ->assert();
```

---

## Snapshots

Snapshots permitem capturar e restaurar o estado de valores para testes de regressão.

### Capture e Restore

Capture o resultado de uma asserção e restaure-o posteriormente:

```php
use Bootgly\ACI\Tests\Assertion\Snapshots;

// Capture
$string1 = 'value';
yield new Assertion(description: 'Capture strings')
   ->assert(
      actual: $string1,
      expected: $string1,
   )
   ->capture('stringSnapshot');

// Restore
$string2 = 'value';
yield new Assertion(description: 'Restoring strings')
   ->restore('stringSnapshot')
   ->assert(
      actual: $string2,
      expected: $string1,
   );
```

### MemoryDefaultSnapshot (em memória)

Armazenamento de snapshot em memória (mais rápido, não persistente):

```php
$array1 = [1, 2, 3];
yield new Assertion(description: 'Capturing and restoring arrays')
   ->assert(
      actual: $array1,
      expected: $array1,
      using: new Snapshots\MemoryDefaultSnapshot
   );
```

### FileStorageSnapshot (em arquivo)

Armazenamento de snapshot em arquivo JSON (persistente entre execuções):

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Delimiters\ClosedInterval;

yield new Assertion(description: 'Between integers')
   ->assert(
      actual: 2,
      expected: new ClosedInterval(1, 3),
      using: new Snapshots\FileStorageSnapshot
   );
```

---

## Hooks do Ciclo de Vida

A classe `Assertions` suporta hooks para executar código antes/depois de testes:

```php
use Bootgly\ACI\Tests\Assertions\Hook;
```

### Hooks disponíveis

| Hook | Momento |
|------|---------|
| `Hook::BeforeAll` | Antes de todas as asserções |
| `Hook::AfterAll` | Depois de todas as asserções |
| `Hook::BeforeEach` | Antes de cada asserção |
| `Hook::AfterEach` | Depois de cada asserção |

### Exemplo

```php
return new Specification(
   description: 'It should compare equal values',
   test: new Assertions(Case: function (): Generator
   {
      yield new Assertion(description: 'Equal integers')
         ->expect(1)
         ->to->be(1)
         ->assert();
   })
      ->input('test')
      ->on(Hook::BeforeEach, function ($Assertion, $arguments): void
      {
         // executar algo antes de cada asserção
      })
);
```

### Input (datasets)

Utilize `->input()` para passar dados para a Closure das asserções:

```php
test: new Assertions(Case: function (): Generator
{
   yield new Assertion(description: 'Test with data')
      ->expect(1)
      ->to->be(1)
      ->assert();
})
   ->input('valor1', 'valor2', 'valor3')
```

---

## Skip e Ignore

### Skip

O parâmetro `skip` em `Specification` permite pular um caso de teste (com output):

```php
return new Specification(
   description: 'Test to skip',
   skip: true,
   test: function (): bool
   {
      return true;
   }
);
```

### Ignore

O parâmetro `ignore` permite pular um caso de teste silenciosamente (sem output):

```php
return new Specification(
   description: 'Test to ignore',
   ignore: true,
   test: function (): bool
   {
      return true;
   }
);
```

### Skip na API Avançada

Na API Avançada, utilize o método `->skip()` do `Assertion`:

```php
yield new Assertion(description: 'Skipped assertion')
   ->skip();
```

---

## Separadores Visuais

Utilize a classe `Separator` para organizar a saída dos testes com separadores visuais:

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
|-------------|------|-----------|
| `line` | `bool\|string\|null` | Linha separadora (true para linha simples, string para rótulo) |
| `left` | `string\|null` | Rótulo exibido à esquerda |
| `header` | `string\|null` | Cabeçalho da seção |
