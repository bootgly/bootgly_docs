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

$Path = new Path('/etc/php/');
$Path->match(path: '%', pattern: '8.*');
yield new Assertion(description: 'Valid relative path')
   ->assert(
      actual: (string) $Path,
      expected: new VariadicDirPath('/etc/php/8.*'),
   );
```

## Boas práticas

- Use matchers quando o formato importa mais que igualdade literal.
- Mantenha regexes pequenas e legíveis.
- Prefira classes matcher dedicadas quando a regra tem semântica própria.
- Descreva o padrão esperado no texto da assertion.
