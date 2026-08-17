# Matchers

Matchers verificam valores por correspondência de padrões. Eles são úteis quando a expectativa não é um valor literal, mas uma forma ou estrutura esperada.

## Regex

`Regex` valida strings usando expressões regulares.

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Matchers\Regex;

yield new Assertion(description: 'Matches string')
   ->assert(
      actual: 'Hello, World!',
      expected: new Regex('/World/'),
   );
```

Use regex quando a regra precisa validar formato, prefixos variáveis, grupos ou trechos opcionais.

## VariadicDirPath

`VariadicDirPath` valida caminhos de diretório com padrões variádicos.

```php
use Bootgly\ABI\Code\__String\Path;
use Bootgly\ACI\Tests\Assertion\Expectations\Matchers\VariadicDirPath;

// Um diretório contendo as entradas versionadas `8.3/` e `8.4/`.
// Crie a fixture no próprio teste em vez de apontar para um caminho de
// sistema: eles variam entre distribuições e tornam a suíte não portável.
$base = sys_get_temp_dir() . '/releases/';

$Path = new Path($base);
$Path->match(path: '%', pattern: '8.*');
yield new Assertion(description: 'Valid relative path')
   ->assert(
      actual: (string) $Path,
      expected: new VariadicDirPath($base . '8.*'),
   );
```

`match()` também aceita a forma absoluta, com o marcador `%` dentro do próprio
caminho — útil quando não há um caminho já construído para casar:

```php
$Path = new Path;
$Path->match(path: $base . '%', pattern: '8.*');
```

## Boas práticas

- Use matchers quando o formato importa mais que igualdade literal.
- Mantenha regexes pequenas e legíveis.
- Prefira classes matcher dedicadas quando a regra tem semântica própria.
- Descreva o padrão esperado no texto da assertion.
