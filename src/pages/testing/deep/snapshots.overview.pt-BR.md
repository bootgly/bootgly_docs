# Snapshots

Snapshots capturam e restauram valores para testes de regressão. Eles ajudam a verificar se estruturas complexas continuam produzindo o mesmo resultado entre execuções.

## Quando usar

Use snapshots quando o valor esperado é grande, estrutural ou difícil de declarar diretamente em cada asserção.

Exemplos comuns:

- arrays de resposta;
- estruturas normalizadas;
- payloads serializados;
- resultados de renderização;
- regressões de comparadores customizados.

## Capture e Restore

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

## MemoryDefaultSnapshot

`MemoryDefaultSnapshot` armazena snapshots em memória. É rápido, mas não persiste entre execuções.

```php
$array1 = [1, 2, 3];
yield new Assertion(description: 'Capturing and restoring arrays')
   ->assert(
      actual: $array1,
      expected: $array1,
      using: new Snapshots\MemoryDefaultSnapshot
   );
```

## FileStorageSnapshot

`FileStorageSnapshot` armazena snapshots em arquivo JSON e preserva os dados entre execuções.

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Delimiters\ClosedInterval;

yield new Assertion(description: 'Between integers')
   ->assert(
      actual: 2,
      expected: new ClosedInterval(1, 3),
      using: new Snapshots\FileStorageSnapshot
   );
```

## Boas práticas

- Use nomes de snapshot estáveis e descritivos.
- Prefira snapshots para dados estruturais, não para valores triviais.
- Use armazenamento em memória para testes rápidos sem persistência.
- Use armazenamento em arquivo quando o snapshot precisa sobreviver entre execuções.
- Revise mudanças de snapshot como mudanças de contrato do teste.
