# Bytes

`Bytes` converte uma quantidade de bytes em um tamanho legível para humanos, e faz o caminho
inverso: lê esse tamanho e devolve os bytes. Os dois sentidos usam as mesmas unidades, em
múltiplos binários (1 KB = 1024 bytes). Por isso `parse()` aceita toda unidade que `format()`
gera e, ao fazer o parse de um tamanho formatado, você recebe de volta o valor arredondado que
ele mostra — exceto quando esse valor passa de `PHP_INT_MAX` ou quando o PHP o imprimiu em
notação exponencial (veja abaixo).

## Mostrar um tamanho

```php
use Bootgly\ABI\Code\__String\Bytes;

echo Bytes::format(512);           // 512 B
echo Bytes::format(1536);          // 1.5 KB
echo Bytes::format(memory_get_usage()); // ex.: 2.37 MB
```

`format()` usa a maior unidade, de `B` até `YB`, em que o valor ainda fica maior ou igual a 1,
e arredonda para duas casas decimais. Para mudar isso, passe a precisão:

```php
echo Bytes::format(1_610_612_736, 0); // 2 GB
echo Bytes::format(1_610_612_736, 3); // 1.5 GB
```

Menos de um byte continua em `B` (`0.5 B`); um valor negativo aparece como `0 B`.

## Ler um tamanho da configuração

Em arquivos de configuração e variáveis de ambiente, tamanhos são escritos num formato legível
para humanos: `"512M"`, `"1.5 GB"`. `parse()` converte esse texto no inteiro que o seu código
usa nas comparações:

```php
use Bootgly\ABI\Code\__String\Bytes;

$limit = Bytes::parse(getenv('UPLOAD_LIMIT') ?: '8M'); // 8388608

if ($size > $limit) {
   // recusa o upload
}
```

O formato aceito é: um número não negativo, espaços ou tabs opcionais e uma unidade, tanto faz
maiúscula ou minúscula:

| Escrito como | Bytes |
|---|---|
| `512`, `512B`, `512 b` | 512 |
| `2K`, `2KB`, `2 KiB` | 2048 |
| `1.5 GB`, `1.5g` | 1610612736 |
| `7 EB` | 8070450532247928832 |

Cada unidade `K`, `M`, `G`, `T`, `P`, `E`, `Z` e `Y` pode ser escrita de três jeitos (`K`,
`KB`, `KiB`), e os três valem o mesmo múltiplo binário. Um número sem unidade é lido como bytes.
A conta é exata, sem usar ponto flutuante, e a parte fracionária é descartada, ou seja, o
resultado é arredondado para baixo, para um número inteiro de bytes: `1.5 B` vira `1` e
`1023.9999999999999999 B` vira `1023`.

### Tamanho inválido dá erro na hora

`parse()` nunca cai num valor default. Se não conseguir ler a entrada com exatidão, lança uma
`InvalidArgumentException` que mostra o texto recebido. Assim, um erro de digitação num limite
interrompe o boot, em vez de virar `0` ou "ilimitado" sem ninguém perceber:

```php
Bytes::parse('1,5 MB');  // Invalid byte size '1,5 MB'.
Bytes::parse('10 XB');   // Unknown byte unit 'XB' in '10 XB'.
Bytes::parse('-1');      // Invalid byte size '-1'.
Bytes::parse('8 EB');    // Byte size '8 EB' exceeds PHP_INT_MAX.
```

O retorno é um `int`, então o maior tamanho possível é `PHP_INT_MAX` bytes, um pouco menos que
`8 EB`. `ZB` e `YB` só são aceitos para valores que cabem nesse limite (`0.0000001 ZB`), e
`format()` pode gerar tamanhos que `parse()` não consegue converter de volta para `int`
(`Bytes::format(PHP_INT_MAX)` dá `8 EB`). Uma entrada com mais de `Bytes::LIMIT` (64) bytes é
recusada antes do parse, e a mensagem de erro reproduz no máximo esses 64 bytes da entrada, com
barras invertidas, aspas, caracteres de controle e bytes não ASCII escapados. Com isso, um
tamanho vindo de variável de ambiente não consegue inundar o log nem forjar uma linha nele.
Um valor muito pequeno também pode sair em notação exponencial (`Bytes::format(0.00001, 5)` dá
`1.0E-5 B`), e `parse()` recusa esse formato.

> O próprio PHP tem `ini_parse_quantity()`, que lê a notação abreviada do `php.ini`, mas ela só
> conhece `K`, `M` e `G`, emite um warning em vez de lançar exceção e aceita caracteres
> sobrando no fim do texto. Use-a para valores de `ini_get()`; use `Bytes::parse()` para os
> tamanhos que a sua aplicação define.

## Referência

```php
public static function format (float|int $bytes, int $precision = 2): string
```

Formata `$bytes` na maior unidade de `Bytes::UNITS` em que o valor fica maior ou igual a 1,
arredondado para `$precision` casas decimais, no formato `"<valor> <unidade>"`. Valores acima
de `1024 YB` continuam em `YB`, valores abaixo de um byte continuam em `B`, e valores negativos
saem como `0 B`.

```php
public static function parse (string $size): int
```

Faz o parse de um tamanho de até `Bytes::LIMIT` bytes e devolve a quantidade de bytes. A
entrada é um número decimal não negativo, espaços ou tabs opcionais e uma unidade opcional
(`B`, ou de `K`/`KB`/`KiB` até `Y`/`YB`/`YiB`, sem diferenciar maiúsculas de minúsculas). As
unidades são múltiplos binários; a conta é exata e um resultado fracionário é arredondado para
baixo. Lança `InvalidArgumentException` quando o tamanho tem mais de `Bytes::LIMIT` bytes, está
vazio, é negativo ou malformado, usa uma unidade desconhecida ou passa de `PHP_INT_MAX` bytes.

```php
public const array UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
```

As unidades que `format()` gera, uma para cada potência de 1024.

```php
public const int LIMIT = 64;
```

O tamanho máximo, em bytes, da string que `parse()` aceita ler.
