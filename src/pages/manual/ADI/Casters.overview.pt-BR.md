# Casters

`Bootgly\ADI\Casters` converte um valor para um tipo alvo — `int`, `float`, `bool`, `string` ou
`DateTimeImmutable` — e você escolhe o quão estrita é a conversão. É o vocabulário de conversão
para o qual o Bootgly converge ao transformar `'8080'` em `8080` ou `'yes'` em `true`: a config de
env, a hidratação do ORM, as flags de TLS do banco e o armazenamento de contas já convertem por ele.

```php
use Bootgly\ADI\Casters;
use Bootgly\ADI\Casters\Modes;

Casters::Integer->cast('8080', Modes::Strict);    // 8080
Casters::Boolean->cast(' Yes ', Modes::Strict);   // true
Casters::Float->cast('1.5e3', Modes::Strict);     // 1500.0
Casters::DateTime->cast('2026-11-08', Modes::Strict); // DateTimeImmutable 2026-11-08 00:00:00

Casters::Integer->cast(' 1', Modes::Strict);      // InvalidArgumentException: Cannot cast the value to integer.
Casters::Integer->cast(' 1', Modes::Loose);       // 1
```

`Casters` é um enum: cada case é um tipo alvo, e o `cast()` recebe o valor e um case de `Modes`. O
modo é obrigatório — não existe default, então cada chamada diz qual conversão quer.

Os **[Validadores](/manual/ADI/Validators/overview/)** respondem "este valor é aceitável?" e o deixam
como está; os Casters fazem a conversão. Rode uma `Validation` para reportar todo campo inválido a
um usuário, e converta os valores que você vai usar depois.

## Escolha um modo

| Modo | Para | Converte |
|---|---|---|
| `Modes::Strict` | Entrada que uma pessoa escreveu: variáveis de ambiente, arquivos `.env`, arrays de config, campos de formulário | Só formas exatas e sem ambiguidade: `'42'`, `'-1.5e-3'`, `'yes'`, `'2026-11-08'`. Qualquer outra coisa é recusada |
| `Modes::Loose` | Valores que uma fonte tipada já produziu: drivers de banco | Do jeito que o `(int)`, `(float)`, `(bool)` e `(string)` do PHP convertem — exceto um número que o range de `int` não comporta, que é recusado |

O Strict é a escolha segura quando uma pessoa pode errar a digitação: `' 1'`, `'0x1A'`, `'12abc'` e
`'1.0'` não são inteiros, e `'maybe'` não é booleano. O Loose serve para um driver que devolve
`'42'` para uma coluna `INTEGER`: ele aceita o que o PHP aceita, então `'abc'` vira `0` — use-o só
onde a fonte já garante o tipo.

## O que cada tipo aceita

### Integer

```php
Casters::Integer->cast('-7', Modes::Strict);                    // -7
Casters::Integer->cast('9223372036854775808', Modes::Strict);   // recusado: além de PHP_INT_MAX
Casters::Integer->cast('1.9', Modes::Loose);                    // 1
Casters::Integer->cast('9223372036854775808', Modes::Loose);    // recusado: fora do range de int
Casters::Integer->cast(1e30, Modes::Loose);                     // recusado: fora do range de int
```

- **Strict** — um `int`, ou uma string de dígitos com um sinal `+`/`-` opcional, sem zeros à
  esquerda (`'007'` é recusado), espaços, expoente ou fração, dentro do range de `int`. Um `float` ou
  um `bool` é recusado.
- **Loose** — o `(int)` do PHP de qualquer escalar: `'1.9'` é `1`, `'12abc'` é `12`, `'abc'` é `0`,
  `true` é `1`. Um número fora do range de `int` — uma string numérica (`is_numeric()`) como uma
  string de dígitos acima de `PHP_INT_MAX` ou abaixo de `PHP_INT_MIN`, ou `'1e30'`; um float fora do
  range, `INF`, `NAN` — é recusado com `Cannot cast the value to integer: it is beyond the int range.`,
  onde o cast do PHP o saturaria em `PHP_INT_MAX` ou daria a volta nele, virando outro número. Um
  decimal com fração zero (`'5.0'`, `'9223372036854775807.0'`) converte exato. Qualquer outra string
  converte como o PHP a converte, sem conferir os dígitos do início: `'99999999999999999999abc'` é
  `PHP_INT_MAX`.

### Float

- **Strict** — um `int` (como `float`), um `float` finito, ou uma string decimal: `'10.25'`, `'.5'`,
  `'5.'`, `'1e3'`, `'-1.5e-3'`, `'007'`. Espaços, `'INF'`, `'1,5'`, uma string que estoura para
  infinito (`'1e999'`), `INF`, `NAN` e um `bool` são recusados.
- **Loose** — o `(float)` do PHP de qualquer escalar: `'abc'` é `0.0`, `true` é `1.0`, `INF`
  continua `INF`.

### Boolean

- **Strict** — um `bool`; os ints `1` e `0`; as strings `'1'`, `'true'`, `'yes'`, `'on'` e `'0'`,
  `'false'`, `'no'`, `'off'`, em maiúsculas ou minúsculas e ignorando os espaços das pontas. Qualquer
  outra coisa — `2`, `1.0`, `''`, `'y'`, `'null'` — é recusada.
- **Loose** — o `(bool)` do PHP de qualquer escalar: `'false'` é `true` (uma string não vazia), `'0'`
  e `''` são `false`.

### String

- **Strict** e **Loose** — o `(string)` do PHP de qualquer escalar: `42` é `'42'`, `1.5` é `'1.5'`,
  `true` é `'1'` e `false` é `''`. A própria string fica como está — sem trim.

### DateTime

```php
Casters::DateTime->cast('2026-11-08 10:30:00', Modes::Strict);          // timezone default
Casters::DateTime->cast('2026-11-08T10:30:00.5-03:00', Modes::Strict);  // offset -03:00
Casters::DateTime->cast('2026-02-30', Modes::Strict);                   // recusado: esse dia não existe
Casters::DateTime->cast(1762598400, Modes::Loose);                      // 2025-11-08 10:40:00 UTC
Casters::DateTime->cast('next monday', Modes::Loose);                   // relativo a agora
```

- **Os dois modos** — um `DateTimeInterface` vira um `DateTimeImmutable` do mesmo instante e
  timezone.
- **Strict** — três formas de string, nada mais:
  - `YYYY-MM-DD` — meia-noite, na timezone default do PHP;
  - `YYYY-MM-DD hh:mm:ss`, com uma fração `.ffffff` opcional — timezone default do PHP;
  - RFC 3339: `YYYY-MM-DDThh:mm:ss`, fração opcional, depois `Z` ou `±hh:mm` (de `-23:59` a
    `+23:59`) — esse offset.

  Uma data, hora ou offset que não existe (`2026-02-30`, `25:00:00`, `+24:00`) é recusado em vez de
  rolar para o seguinte, e o mesmo vale para um horário `YYYY-MM-DD hh:mm:ss` que a timezone default
  pula quando o relógio adianta (horário de verão). Timestamps, `'now'`, `'tomorrow'` e uma forma com
  `T` sem offset também são recusados.
- **Loose** — também um Unix timestamp (`int` ou `float`, em UTC) e qualquer string que
  `new DateTimeImmutable()` entenda, relativas incluídas. O PHP rola uma data impossível adiante
  (`'2026-02-30'` vira 2 de março). Uma string em branco, que o PHP lê como "agora", é recusada.

## Trate uma recusa

Um valor que o modo não converte lança `InvalidArgumentException`. A mensagem nomeia o tipo, nunca o
valor, então você pode logá-la ou exibi-la sem vazar uma senha ou um token:

```php
use InvalidArgumentException;

try {
   $port = Casters::Integer->cast($input, Modes::Strict);
}
catch (InvalidArgumentException $Exception) {
   $Exception->getMessage(); // Cannot cast the value to integer.
}
```

`null`, um array e um objeto são recusados por todo case nos dois modos — a única exceção é um
`DateTimeInterface`, que o `DateTime` aceita. Confira o `null` você mesmo quando um valor for
opcional.

## Onde o Bootgly converte

| Quem chama | Modo | O que acrescenta |
|---|---|---|
| Config de env: `Config->bind(cast: Types::…)` | `Strict` | A própria mensagem: `Invalid integer config value.` |
| Hidratação do ORM em propriedades `bool`, `int`, `float`, `string` | `Loose` | Um int fora do range nomeia a propriedade: veja **[Linhas em propriedades](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#linhas-em-propriedades)** |
| Flags de TLS do banco `secure.verify` / `secure.name` | `Strict` (`Boolean`) | ``Database TLS `verify` must be a boolean.`` — veja **[Config do banco](/manual/ADI/Database/Config/overview/)** |
| Chave primária do armazenamento de contas (`API\Security\Users`) | `Strict` (`String`) | A chave `int` ou `string` do driver vira o id em string |

## Referência

### Casters

```php
public function cast (mixed $value, Modes $Mode): bool|DateTimeImmutable|float|int|string
```

Converte `$value` para o tipo do case no modo dado: `Boolean` devolve um `bool`, `DateTime` um
`DateTimeImmutable`, `Float` um `float`, `Integer` um `int` e `String` uma `string`. Lança
`InvalidArgumentException` com `Cannot cast the value to <type>.` — `<type>` é `boolean`,
`date-time`, `float`, `integer` ou `string` — quando o modo não converte o valor, e com
`Cannot cast the value to integer: it is beyond the int range.` para um número fora do range de
`int` no modo loose. A mensagem nunca contém o valor.

```php
case Boolean;
case DateTime;
case Float;
case Integer;
case String;
```

Os tipos alvo. O que cada um aceita em cada modo está em
[O que cada tipo aceita](#o-que-cada-tipo-aceita).

### Modes

```php
case Strict;
```

Só formas textuais exatas, para entrada que uma pessoa escreveu. Um valor só é convertido quando a
forma dele não tem ambiguidade; todo o resto é recusado.

```php
case Loose;
```

Os casts nativos de escalares do PHP, para valores que uma fonte tipada já produziu. Recusa o que
não é escalar, um número que o range de `int` não comporta para `Integer`, e para `DateTime`
qualquer coisa que o PHP não entende como data (um `bool`, uma string em branco, um timestamp fora do
range).
