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

`FileStorageSnapshot` armazena cada snapshot em um arquivo `.snap` dentro do diretório de storage
(`tests/snapshots/<nome>.snap`), codificado com o `serialize()` do PHP, e preserva os dados entre execuções.

```php
$totals = ['subtotal' => 1999, 'shipping' => 500];

yield new Assertion(description: 'Cart totals')
   ->assert(
      actual: $totals,
      expected: $totals,
      using: new Snapshots\FileStorageSnapshot('cart-totals')
   );
```

A primeira execução captura o valor. Cada execução seguinte restaura o valor capturado em `actual`
e o compara com `expected` (`===`), então uma mudança falha até você apagar o arquivo `.snap`.

Cada captura substitui o arquivo inteiro, de forma atômica — uma segunda captura com o mesmo nome
sobrescreve a primeira — e um link no lugar do arquivo é substituído por um arquivo, nunca
escrito através dele.

### Snapshots dos seus próprios objetos

Um snapshot em arquivo restaura dados (strings, números, arrays) e apenas as classes listadas na
sua propriedade `$classes`. Por padrão, essa lista é `FileStorageSnapshot::CLASSES`: `stdClass`,
`DateTime`, `DateTimeImmutable`, `DateTimeZone` e `DateInterval`. Para fazer snapshot de um value
object seu, amplie a lista:

```php
use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Assertion\Comparators\Equal;
use Bootgly\ACI\Tests\Assertion\Snapshots\FileStorageSnapshot;
use RuntimeException;

$Total = new Money(1999, 'USD'); // seu próprio value object

$Snapshot = new FileStorageSnapshot;
$Snapshot->classes = [...FileStorageSnapshot::CLASSES, Money::class];

// A primeira execução captura o valor; cada execução seguinte compara com ele
$expected = null;
if ($Snapshot->restore('shop-total', $expected) === false) {
   // Um snapshot que existe mas não restaura é um erro, nunca uma nova base
   if ($Snapshot->refused === true) {
      throw new RuntimeException('The shop-total snapshot does not restore.');
   }
   $Snapshot->capture('shop-total', $Total);
   $expected = $Total;
}

yield new Assertion(description: 'The order total matches its snapshot')
   ->expect($Total)
   ->to->be(new Equal($expected))
   ->assert();
```

O `Money` restaurado é uma nova instância igual à capturada, então compare-o com `Equal` (`==`),
não por identidade. Um enum seu entra em `$classes` do mesmo jeito.

### Quando um snapshot não restaura

- **Uma classe fora de `$classes`** volta como `__PHP_Incomplete_Class`, então a comparação
  falha — ela nunca passa em silêncio. Nada mais é carregado enquanto o arquivo é decodificado:
  nenhuma outra classe passa pelo autoloader (um enum incluído) e nenhum método mágico dela
  executa. Adicione a classe a `$classes` para restaurá-la inteira.
- **Um arquivo que existe mas não restaura** — ilegível, um diretório no lugar dele, lixo,
  truncado, com bytes sobrando, vazio, ou um objeto cuja propriedade tipada receberia uma classe
  fora de `$classes` — é recusado: `restore()` retorna `false`, deixa intocado o valor que você
  passou e marca `$refused`. A Assertion então falha — `using:` um snapshot sozinho ou com
  expectativas, e depois de um `restore()` na Assertion também — e o arquivo é mantido como está;
  só um arquivo ausente é capturado de novo. Um `capture()` depois desse restore começa limpo. Um `false` capturado continua sendo um snapshot e
  restaura como `false`. Só o próprio arquivo `.snap` é lido: um nome ausente nunca recai num
  `.php` ou `/index.php` ao lado dele.

### Quem pode alterar um snapshot

Um arquivo de snapshot é confiável para guardar o valor esperado: quem pode escrever no diretório
de storage decide contra o que seus testes comparam. Mantenha esse diretório gravável só por você
e pelo seu CI, e revise mudanças de snapshot como código.

## Boas práticas

- Use nomes de snapshot estáveis e descritivos.
- Prefira snapshots para dados estruturais, não para valores triviais.
- Use armazenamento em memória para testes rápidos sem persistência.
- Use armazenamento em arquivo quando o snapshot precisa sobreviver entre execuções.
- Revise mudanças de snapshot como mudanças de contrato do teste.

## Referência

```php
Bootgly\ACI\Tests\Assertion\Snapshots\FileStorageSnapshot->classes: array
```

As classes que um snapshot restaurado pode instanciar, `FileStorageSnapshot::CLASSES` por padrão
(`stdClass`, `DateTime`, `DateTimeImmutable`, `DateTimeZone`, `DateInterval`). Qualquer outro
objeto restaura como `__PHP_Incomplete_Class`.

```php
Bootgly\ACI\Tests\Assertion\Snapshots\FileStorageSnapshot->capture (string $snapshot, mixed $data): bool
```

Grava `$data` em `tests/snapshots/<snapshot>.snap` dentro do diretório de storage com
`serialize()`, substituindo o arquivo inteiro de forma atômica; `true` quando o arquivo passa a
guardar o valor.

```php
Bootgly\ACI\Tests\Assertion\Snapshots\FileStorageSnapshot->restore (string $snapshot, mixed &$data): bool
```

Lê o snapshot em `$data`: `true` quando restaurou, `false` — com `$data` intocado — quando o
arquivo está ausente ou é recusado (veja `refused`).

```php
Bootgly\ACI\Tests\Assertion\Snapshot->refused: bool
```

Se o último `restore()` encontrou um snapshot que não conseguiu restaurar — `false` quando o
arquivo está ausente. Enquanto é `true`, `assert()` falha e nunca captura por cima do arquivo.
