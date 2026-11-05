# Bytes

`Bytes` transforma uma contagem de bytes em um tamanho que uma pessoa consegue ler, e lê esse
tamanho de volta. As duas direções usam as mesmas unidades — múltiplos binários, então `1 KB`
são 1024 bytes: `parse()` lê toda unidade que `format()` escreve, e um tamanho formatado é lido
de volta como o valor arredondado que ele mostra — a menos que esse valor passe de `PHP_INT_MAX`
ou que o PHP o tenha impresso em notação de expoente (veja abaixo).

## Mostrar um tamanho

```php
use Bootgly\ABI\Code\__String\Bytes;

echo Bytes::format(512);           // 512 B
echo Bytes::format(1536);          // 1.5 KB
echo Bytes::format(memory_get_usage()); // ex.: 2.37 MB
```

`format()` escolhe a maior unidade que mantém o valor maior ou igual a 1, de `B` até `YB`, e
arredonda para duas casas decimais. Passe uma precisão para mudar isso:

```php
echo Bytes::format(1_610_612_736, 0); // 2 GB
echo Bytes::format(1_610_612_736, 3); // 1.5 GB
```

Uma contagem abaixo de um byte fica em `B` (`0.5 B`); uma contagem negativa é mostrada como `0 B`.

## Ler um tamanho da configuração

Tamanhos em arquivos de configuração e variáveis de ambiente são escritos para pessoas —
`"512M"`, `"1.5 GB"`. `parse()` os transforma no inteiro com que o seu código compara:

```php
use Bootgly\ABI\Code\__String\Bytes;

$limit = Bytes::parse(getenv('UPLOAD_LIMIT') ?: '8M'); // 8388608

if ($size > $limit) {
   // recusar o upload
}
```

Ele aceita um número não negativo, espaços ou tabs opcionais e uma unidade, em qualquer caixa:

| Escrito como | Bytes |
|---|---|
| `512`, `512B`, `512 b` | 512 |
| `2K`, `2KB`, `2 KiB` | 2048 |
| `1.5 GB`, `1.5g` | 1610612736 |
| `7 EB` | 8070450532247928832 |

`K`, `M`, `G`, `T`, `P`, `E`, `Z` e `Y` têm três grafias cada — `K`, `KB`, `KiB` — e todas
significam o mesmo múltiplo binário. Um número sozinho é uma contagem de bytes. A aritmética é
exata — sem ponto flutuante — e uma fração é arredondada para baixo até bytes inteiros, então
`1.5 B` é `1` e `1023.9999999999999999 B` é `1023`.

### Tamanhos inválidos falham alto

`parse()` nunca recorre a um padrão. Tudo o que ele não consegue ler exatamente lança uma
`InvalidArgumentException` que cita a entrada — um erro de digitação em um limite interrompe
o boot em vez de virar `0` ou "ilimitado" em silêncio:

```php
Bytes::parse('1,5 MB');  // Invalid byte size '1,5 MB'.
Bytes::parse('10 XB');   // Unknown byte unit 'XB' in '10 XB'.
Bytes::parse('-1');      // Invalid byte size '-1'.
Bytes::parse('8 EB');    // Byte size '8 EB' exceeds PHP_INT_MAX.
```

O resultado é um `int`, então o maior tamanho é `PHP_INT_MAX` bytes — pouco abaixo de `8 EB`.
`ZB` e `YB` só são legíveis para valores que cabem (`0.0000001 ZB`), e `format()` pode escrever
tamanhos que `parse()` não consegue ler de volta como `int` (`Bytes::format(PHP_INT_MAX)` é
`8 EB`). Um tamanho com mais de `Bytes::LIMIT` (64) bytes é recusado antes de ser lido, e uma
recusa cita no máximo esse tanto da entrada, com barras invertidas, aspas, caracteres de
controle e bytes não-ASCII escapados — então um tamanho lido do ambiente não consegue inundar nem
forjar uma linha de log. Uma contagem muito pequena também pode sair em notação de expoente
(`Bytes::format(0.00001, 5)` é `1.0E-5 B`), que `parse()` recusa.

> O `ini_parse_quantity()` do próprio PHP lê os atalhos do `php.ini`, mas conhece só `K`, `M` e
> `G`, emite um aviso em vez de lançar e aceita lixo no final. Use-o para valores de
> `ini_get()`; use `Bytes::parse()` para tamanhos que a sua aplicação define.

## Referência

```php
public static function format (float|int $bytes, int $precision = 2): string
```

Formata `$bytes` com a maior unidade de `Bytes::UNITS` que mantém o valor maior ou igual a 1,
arredondado para `$precision` casas decimais, como `"<valor> <unidade>"`. Valores acima de
`1024 YB` ficam em `YB`, valores abaixo de um byte ficam em `B` e valores negativos são
formatados como `0 B`.

```php
public static function parse (string $size): int
```

Interpreta um tamanho de no máximo `Bytes::LIMIT` bytes como contagem de bytes: um número
decimal não negativo, espaços ou tabs opcionais e uma unidade opcional (`B`, ou `K`/`KB`/`KiB`
até `Y`/`YB`/`YiB`, sem diferenciar caixa). As unidades são múltiplos binários; a aritmética é
exata e um resultado fracionário é arredondado para baixo. Lança `InvalidArgumentException`
quando o tamanho tem mais de `Bytes::LIMIT` bytes, está vazio, é negativo ou malformado, nomeia
uma unidade desconhecida ou excede `PHP_INT_MAX` bytes.

```php
public const array UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
```

As unidades que `format()` escreve, uma por potência de 1024.

```php
public const int LIMIT = 64;
```

O maior tamanho, em bytes, de string que `parse()` lê.
