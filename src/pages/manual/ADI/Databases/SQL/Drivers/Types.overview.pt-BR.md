# Tipos SQL

O `query()` envia valores PHP como os parâmetros de uma instrução e devolve linhas de valores PHP,
e cada driver SQL mapeia as duas direções do seu jeito: o PostgreSQL pelo OID de tipo de cada
parâmetro e coluna, o MySQL pelo tipo de protocolo de cada parâmetro e coluna, o SQLite pela
classe de armazenamento em que cada valor fica guardado. A mesma linha, escrita e lida do mesmo
jeito, volta então com `true` ou `1`, com `'19.90'` ou `19.9`, com um `DateTimeImmutable` ou uma
string. Esta página põe os mapeamentos lado a lado e mostra como escrever código que roda nos
três. Como executar uma query e ler o `Result` dela está em
**[Banco SQL](/manual/ADI/Databases/SQL/overview/)**, e as chaves de conexão em
**[Configuração do banco](/manual/ADI/Database/Config/overview/)**.

## Escreva e leia uma linha

A mesma linha — um inteiro, um booleano, um float, um decimal, uma data, um timestamp e um `NULL`
— escrita e lida de volta em cada driver. Cada exemplo abre o banco a partir de um array; em um
projeto ou em uma rota `HTTP_Server_CLI`, abra-o como
**[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)** mostra.

### PostgreSQL

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
]);

$Database->await($Database->query('CREATE TABLE events (
   id integer PRIMARY KEY,
   active boolean NOT NULL,
   ratio double precision NOT NULL,
   price numeric(10,2) NOT NULL,
   held_on date NOT NULL,
   starts_at timestamp(6) NOT NULL,
   note text
)'));

$Start = new DateTimeImmutable('2026-11-05 09:30:00.123456');

$Database->await($Database->query(
   'INSERT INTO events (id, active, ratio, price, held_on, starts_at, note) VALUES ($1, $2, $3, $4, $5, $6, $7)',
   [1, true, 0.25, '19.90', $Start->format('Y-m-d'), $Start->format('Y-m-d H:i:s.uP'), null]
));

$Row = $Database->await($Database->query('SELECT * FROM events WHERE id = $1', [1]))->Result->row;

$Row['id'];        // 1
$Row['active'];    // true
$Row['ratio'];     // 0.25
$Row['price'];     // '19.90'
$Row['held_on'];   // DateTimeImmutable 2026-11-05 00:00:00
$Row['starts_at']; // DateTimeImmutable 2026-11-05 09:30:00.123456
$Row['note'];      // null
```

Todo valor volta como o equivalente PHP dele, exceto `numeric`, que continua string para que
nenhum dígito se perca; o decimal entra como string pelo mesmo motivo. As datas entram formatadas,
já que o driver PostgreSQL recusa um `DateTimeInterface` por enquanto — veja
[Datas no PostgreSQL](#datas-no-postgresql).

### MySQL

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'mysql',
   'host' => '127.0.0.1',
   'port' => 3306,
   'database' => 'app',
   'username' => 'root',
   'password' => 'secret',
]);

$Database->await($Database->query('CREATE TABLE events (
   id INT PRIMARY KEY,
   active BOOLEAN NOT NULL,
   ratio DOUBLE NOT NULL,
   price DECIMAL(10,2) NOT NULL,
   held_on DATE NOT NULL,
   starts_at DATETIME(6) NOT NULL,
   note TEXT
)'));

$Start = new DateTimeImmutable('2026-11-05 09:30:00.123456');

$Database->await($Database->query(
   'INSERT INTO events (id, active, ratio, price, held_on, starts_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
   [1, true, 0.25, '19.90', $Start->format('Y-m-d'), $Start, null]
));

$Row = $Database->await($Database->query('SELECT * FROM events WHERE id = ?', [1]))->Result->row;

$Row['id'];        // 1
$Row['active'];    // 1
$Row['ratio'];     // 0.25
$Row['price'];     // '19.90'
$Row['held_on'];   // DateTimeImmutable 2026-11-05 00:00:00
$Row['starts_at']; // DateTimeImmutable 2026-11-05 09:30:00.123456
$Row['note'];      // null
```

O MySQL não tem tipo booleano — `BOOLEAN` é um `TINYINT(1)` —, então `active` volta como `1`. O
`DECIMAL` continua string, e o driver formata o `DateTimeInterface` ele mesmo.

### SQLite

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);

$Database->await($Database->query('CREATE TABLE events (
   id INTEGER PRIMARY KEY,
   active BOOLEAN NOT NULL,
   ratio REAL NOT NULL,
   price DECIMAL(10,2) NOT NULL,
   held_on DATE NOT NULL,
   starts_at DATETIME NOT NULL,
   note TEXT
)'));

$Start = new DateTimeImmutable('2026-11-05 09:30:00.123456');

$Database->await($Database->query(
   'INSERT INTO events (id, active, ratio, price, held_on, starts_at, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
   [1, true, 0.25, '19.90', $Start->format('Y-m-d'), $Start, null]
));

$Row = $Database->await($Database->query('SELECT * FROM events WHERE id = ?1', [1]))->Result->row;

$Row['id'];        // 1
$Row['active'];    // 1
$Row['ratio'];     // 0.25
$Row['price'];     // 19.9
$Row['held_on'];   // '2026-11-05'
$Row['starts_at']; // '2026-11-05 09:30:00.123456'
$Row['note'];      // null
```

O SQLite devolve cada valor como ele está guardado: o booleano como o inteiro `1`, as datas como o
texto que foi escrito, e o decimal como o float `19.9`, já que uma coluna declarada `DECIMAL`
guarda números, não texto.

### Datas no PostgreSQL

O PostgreSQL devolve colunas `date`, `time` e `timestamp` como `DateTimeImmutable`, mas o driver
dele recusa um parâmetro `DateTimeInterface` por enquanto: a operação falha com
`PostgreSQL parameter must be scalar or null.` antes de qualquer coisa ser enviada — também quando
o SQL faz cast do placeholder (`$1::timestamptz`), e quando o valor vem de um `filter()` do Query
Builder. Formate o valor antes. `Y-m-d H:i:s.uP` serve para todo tipo de data e hora, e cada um
guarda o que precisa de `'2026-11-05 09:30:00.123456-03:00'`:

| Coluna | Guarda |
|---|---|
| `date` | `2026-11-05` |
| `time` | `09:30:00.123456` |
| `timetz` | `09:30:00.123456-03` |
| `timestamp` | `2026-11-05 09:30:00.123456`: o offset é descartado |
| `timestamptz` | O mesmo instante: `2026-11-05 12:30:00.123456+00` em um servidor cujo `TimeZone` é UTC |

Um `timestamp` guarda o horário de relógio e descarta o offset, então converta o valor para o fuso
que a coluna guarda — `setTimezone(new DateTimeZone('UTC'))` — antes de formatá-lo. Filtros aceitam
as mesmas strings. Com a tabela do PostgreSQL acima:

```php
use DateTimeImmutable;

$Since = new DateTimeImmutable('2026-11-01 00:00:00');

$Recent = $Database->await($Database->query(
   'SELECT id FROM events WHERE starts_at >= $1',
   [$Since->format('Y-m-d H:i:s.uP')]
));

$Recent->Result->rows; // [['id' => 1]]
```

O ORM esbarra na mesma recusa: o `save()` de uma entidade cuja propriedade `DateTimeImmutable` é
escrita falha no PostgreSQL com essa mensagem — também depois que o `hydrate()` preencheu a
propriedade, já que um update escreve toda coluna com que a entidade foi hidratada. Até o driver
formatar datas ele mesmo, deixe essa coluna fora das escritas da entidade
(`insert: false, update: false`, como em
**[Column](/manual/ADI/Databases/SQL/Model/Attributes/overview/#column)**) e escreva-a com uma
query.

## Parâmetros

Um driver escolhe como enviar cada valor só pelo tipo PHP dele: nenhum olha a coluna onde o valor
vai parar. O servidor então converte o valor para o que a instrução precisa, ou o recusa com o
próprio erro. Valores de um Query Builder são enviados do mesmo jeito.

| Valor PHP | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| `int` | `int4`, ou `int8` acima de 32 bits | `LONGLONG`, com sinal | `INTEGER` |
| `bool` | `boolean` | `TINY`: `1` ou `0` | `INTEGER`: `1` ou `0` |
| `float` | `float8` | `DOUBLE` | `REAL` |
| `string` | Sem tipo: o servidor infere um a partir do SQL | `VAR_STRING` | `TEXT` |
| `null` | `NULL`, tipado por um cast no placeholder dele ou pelo SQL | `NULL` | `NULL` |
| `DateTimeInterface` | Recusado | `VAR_STRING`: `Y-m-d H:i:s.u` | `TEXT`: `Y-m-d H:i:s.u` |
| `array`, enum, qualquer outro objeto | Recusado | Recusado | Recusado |

Um valor recusado faz a operação falhar e nunca é enviado. O `code` da operação é `null`, e o
`await()` lança o `error` dela como uma `RuntimeException`:

- PostgreSQL: `PostgreSQL parameter must be scalar or null.`
- MySQL: `MySQL cannot bind the parameter at position 0.` — o índice do valor no array, contado a
  partir de `0`
- SQLite: `SQLite cannot bind the parameter "0".` — a chave do valor no array: o índice dele, ou o
  nome de um parâmetro nomeado

Passe o `->value` de um enum, e formate datas para o PostgreSQL como mostrado acima.

### Parâmetros no PostgreSQL

O driver declara um tipo — um OID — para cada placeholder quando prepara a instrução, inferido do
valor PHP:

- Um `int` é `int4` quando cabe em 32 bits e `int8` caso contrário; um `bool` é `boolean`, e um
  `float` é `float8`. Os tipos declarados fazem parte da identidade do prepared statement, então o
  mesmo SQL executado com um inteiro pequeno e com um grande é preparado duas vezes, e um valor
  nunca passa por um statement preparado para um tipo mais estreito.
- Uma string é declarada sem tipo, e o servidor infere um a partir da coluna em que o placeholder é
  escrito ou com que é comparado, ou do operador em volta dele: `'42'` serve para uma coluna
  `integer`, `'2026-11-05'` para uma `date`. Onde nada no SQL indica, como em
  `SELECT pg_typeof($1)`, a operação falha com `could not determine data type of parameter $1`.
- Um `null` assume o tipo de um cast no placeholder dele (`$1::int`). Sem um, o servidor o infere
  como faz com o de uma string, e falha do mesmo jeito onde não consegue — `SELECT $1 IS NULL`, por
  exemplo.
- Um `float` é escrito como o texto mais curto que lê de volta o mesmo double, seja o que for que
  `precision` e `serialize_precision` do PHP digam: `0.1` vai como `0.1`, `1/3` como
  `0.3333333333333333`. `NAN`, `INF` e `-INF` vão como `NaN`, `Infinity` e `-Infinity`, e o
  servidor os guarda; lê-los de volta é que é o problema (veja
  [Resultados no PostgreSQL](#resultados-no-postgresql)).
- Só a ordem dos valores conta: chaves string são ignoradas, então `['b' => 'x', 'a' => 'y']`
  vincula `'x'` a `$1`.

Na primeira vez que uma instrução roda em uma conexão, todo valor trafega como texto. Depois que o
servidor descreveu a instrução, valores `int4`, `boolean` e `float8` trafegam em binário, enquanto
valores `int8`, strings e todo o resto continuam texto; o servidor lê o mesmo valor de qualquer
jeito.

Os tipos declarados deixam o PostgreSQL mais estrito que os outros dois drivers, que convertem
livremente:

- Um `bool` escrito em uma coluna inteira falha com
  `column "id" is of type integer but expression is of type boolean`, e um `int` escrito em uma
  coluna `boolean` com `column "active" is of type boolean but expression is of type integer`.
  Vincule um `bool` para uma coluna `boolean` e um `int` para uma inteira.
- Um `int` comparado com uma coluna de texto falha com `operator does not exist: text = integer`:
  vincule uma string.
- Um `float` escrito em uma coluna `numeric` vira um `float8` antes, que o servidor arredonda para
  15 dígitos significativos: `0.1 + 0.2` é guardado como `0.3`, enquanto a string
  `'0.30000000000000004'` é guardada exatamente. Vincule decimais como strings.

### Parâmetros no MySQL

Os valores vão pelo protocolo binário dos prepared statements, cada um marcado com o tipo de
protocolo da tabela acima, e o servidor converte cada um para o que a instrução precisa. As
conversões são frouxas: `true` serve para uma coluna `INT`, e `7` serve para uma `BOOLEAN`, que lê
de volta `7`. Uma string que não converte falha sob o `sql_mode` estrito padrão: `'abc'` escrito
em uma coluna `INT` dá `1366: Incorrect integer value: 'abc' for column 'id' at row 1`.

- Só a ordem dos valores conta, como no PostgreSQL.
- Um `DateTimeInterface` é enviado como `Y-m-d H:i:s.u` no próprio fuso, com o offset descartado:
  `09:30 -03:00` é guardado como `09:30`. Converta-o antes para o fuso que você guarda. O servidor
  arredonda os microssegundos para a precisão da coluna, então `09:30:00.5` em um `DATETIME` sem
  frações de segundo é guardado como `09:30:01`.
- Um `BIGINT UNSIGNED` acima de `PHP_INT_MAX` não pode ser um `int` do PHP: vincule-o como string,
  como `'18446744073709551615'`.
- `NAN`, `INF` e `-INF` não podem ser guardados: escrever um deles em uma coluna `DOUBLE` falha com
  `1264: Out of range value for column 'ratio' at row 1`.
- Um número errado de valores falha antes de a instrução rodar: `SELECT ? AS a, ? AS b`
  vinculado com `[1, 2, 3]` falha com `MySQL statement expects 2 parameters, 3 given.`, e
  vinculado com `[5]` com `MySQL statement expects 2 parameters, 1 given.` Passe exatamente um
  valor por placeholder.

O servidor deriva o tipo de cada placeholder dos valores vinculados a um prepared statement, e o
driver reaproveita um prepared statement para todo `query()` com o mesmo SQL em uma conexão. Onde o
SQL deixa o tipo de um placeholder em aberto — `SELECT ?`, `JSON_OBJECT('name', ?)`,
`IFNULL(?, 0)` —, uma string vinculada depois de um número é convertida para o tipo desse número,
por enquanto: depois de `42`, `SELECT JSON_OBJECT('name', ?)` com `'Ada'` retorna `{"name": 0}`, e
uma escrita falha com `1292: Truncated incorrect INTEGER value: 'Ada'`. Dê a esse placeholder o
tipo dele no SQL — `CAST(? AS CHAR)` — ou vincule-o sempre com o mesmo tipo PHP.

### Parâmetros no SQLite

O driver vincula cada valor com os tipos da extensão `sqlite3` da tabela acima, e o SQLite o
guarda como vinculado, a menos que a afinidade da coluna o converta: uma coluna declarada
`INTEGER`, `BOOLEAN` ou `DECIMAL` transforma o texto `'42'` no inteiro `42`, uma coluna `TEXT` ou
`VARCHAR` transforma o número `42` no texto `'42'`, e um valor que não converte mantém a classe
dele — `'abc'` continua texto em uma coluna `INTEGER`.

- Uma chave inteira `k` vincula o placeholder `?k+1`, então uma lista preenche `?1`, `?2`… e
  placeholders `?` simples em ordem; uma chave string vincula `:name`, com ou sem os dois-pontos
  (veja **[Parâmetros](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/#parâmetros)**).
- Um `DateTimeInterface` é formatado `Y-m-d H:i:s.u` no próprio fuso, com o offset descartado,
  como no MySQL.
- `NAN` é guardado como `NULL`; `INF` e `-INF` são guardados.
- Uma string é sempre vinculada como texto, e texto é lido de volta só até o primeiro byte NUL,
  por enquanto: `"ab\0cd"` é guardado inteiro, mas é lido de volta como `'ab'`, sem erro. Escreva
  dados binários por `CAST(?1 AS BLOB)`: um `BLOB` é lido de volta inteiro.
- Um placeholder que não recebe valor é vinculado como `NULL`, e a instrução tem sucesso, por
  enquanto: `INSERT INTO t (a, b) VALUES (:a, :b)` com `['a' => 'half']` guarda `b` como `NULL`. O
  PostgreSQL recusa a mesma divergência com
  `bind message supplies 1 parameters, but prepared statement "bootgly_…" requires 2`, e o MySQL
  com `MySQL statement expects 2 parameters, 1 given.` Um valor sem placeholder falha: um terceiro valor para
  dois placeholders posicionais com `Unable to bind parameter number 3`, e uma chave sem nome
  correspondente — `'c'` nesse `INSERT` — com
  `SQLite cannot bind the parameter "c": the statement has no matching placeholder.`

## Resultados

O PostgreSQL e o MySQL convertem cada valor a partir do tipo que o servidor informa para a coluna
dele; o SQLite devolve cada valor na classe em que ele está guardado. `NULL` é `null` em todo
driver.

| Coluna | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Inteiro | `int` | `int`; um `BIGINT UNSIGNED` acima de `PHP_INT_MAX` é uma string decimal | `int` |
| Booleano | `bool` | `int`: `BOOLEAN` é `TINYINT(1)` | `int` |
| Float | `float`; `NaN` e `Infinity` são lidos como `0.0`, por enquanto | `float`; um `FLOAT` é lido de outro jeito com parâmetros | `float` |
| Decimal | `string` | `string` | `int` ou `float`, arredondado para um double |
| Data | `DateTimeImmutable` à meia-noite | `DateTimeImmutable` à meia-noite | `string` |
| Timestamp | `DateTimeImmutable` | `DateTimeImmutable` | `string` |
| Hora do dia | `DateTimeImmutable` na data de hoje | `string` | `string` |
| Texto | `string`; `char(n)` mantém o preenchimento | `string`; `CHAR(n)` perde os espaços finais | `string`, até o primeiro byte NUL |
| Binário | `string` de bytes raw | `string` de bytes raw | `string` de bytes raw |
| JSON | `string` | `string` | `string` |

### Resultados no PostgreSQL

Os resultados sempre chegam como texto, e o driver converte cada valor pelo OID de tipo da coluna
dele:

| Tipo | OID | PHP |
|---|---|---|
| `boolean` | `16` | `bool` |
| `bytea` | `17` | `string` dos bytes raw, decodificados do hex do servidor |
| `smallint`, `integer`, `bigint` | `21`, `23`, `20` | `int` |
| `real`, `double precision` | `700`, `701` | `float` |
| `date`, `time`, `timestamp`, `timestamptz`, `timetz` | `1082`, `1083`, `1114`, `1184`, `1266` | `DateTimeImmutable` |
| Qualquer outro: `numeric`, `text`, `json`, `jsonb`, `uuid`, `interval`, `money`, `inet`, arrays… | — | `string`, como o servidor o imprime: `'{1,2}'` para um `integer[]`, `'1 day 02:00:00'` para um `interval` |

- `date`, `time` e `timestamp` não têm offset, então o objeto assume o fuso padrão do PHP
  (`date.timezone`). Um `timestamptz` traz o offset do `TimeZone` da sessão — `+00:00` em um
  servidor UTC — e um `timetz` o dele mesmo.
- `time` e `timetz` caem na data de hoje: `09:30:00.5` é lido como hoje às `09:30:00.500000`.
- Uma data que o objeto não comporta continua string: `infinity`, `-infinity` e datas a.C. como
  `'0044-03-15 BC'`.
- `NaN`, `Infinity` e `-Infinity` em uma coluna `real` ou `double precision` são lidos de volta
  como `0.0` por enquanto, sem erro. Onde eles podem ocorrer, selecione a coluna como texto
  (`ratio::text AS ratio`) e converta-a no PHP.
- Uma expressão assume o tipo do SQL dela: `count(*)` e `sum()` sobre um `integer` são `bigint`,
  logo `int`; `sum()` sobre um `bigint`, `avg()` e um literal como `1.5` são `numeric`, logo
  strings — `avg()` de `5` é `'5.0000000000000000'`.
- `char(n)` mantém o preenchimento: `'ab'` em um `char(4)` é lido de volta como `'ab  '`.

### Resultados no MySQL

Uma query sem parâmetros lê as linhas pelo protocolo de texto, e uma com parâmetros pelo protocolo
binário dos prepared statements. O driver converte os dois pelo tipo de protocolo da coluna, para
os mesmos tipos PHP:

- `TINYINT`, `SMALLINT`, `MEDIUMINT`, `INT`, `BIGINT` e `YEAR` são `int` — `BOOLEAN`, um
  `TINYINT(1)`, incluído. Um `BIGINT UNSIGNED` acima de `PHP_INT_MAX` é uma string decimal exata
  (veja
  **[Chaves maiores que um int do PHP](/manual/ADI/Databases/SQL/Drivers/overview/#chaves-maiores-que-um-int-do-php)**).
- `FLOAT` e `DOUBLE` são `float`. Um `FLOAT` guarda precisão simples, que só o protocolo de texto
  arredonda de volta: `1.1` é lido como `1.1` sem parâmetros e como `1.100000023841858` com eles.
  Use `DOUBLE` onde você compara floats.
- `DECIMAL` é string, e também toda expressão desse tipo: `SUM()` sobre uma coluna `INT`, `AVG()` e
  um literal como `1.5`.
- `DATE`, `DATETIME` e `TIMESTAMP` são `DateTimeImmutable` no fuso padrão do PHP, montados a partir
  do horário de relógio que o servidor envia — para um `TIMESTAMP`, no `time_zone` da sessão. Datas
  zero continuam strings, que mudam com o protocolo: um `DATE` zero é lido como `'0000-00-00'` sem
  parâmetros e como `'0000-00-00 00:00:00'` com eles.
- `TIME` é string, já que guarda uma duração que pode passar de 24 horas ou ser negativa:
  `'-838:59:59'`. A fração dele depende do protocolo: sem parâmetros ela tem os dígitos da coluna,
  e com eles seis dígitos, ou nenhum quando é zero — `09:30:00.5` em uma coluna `TIME(1)` é lido
  como `'09:30:00.5'` sem parâmetros e como `'09:30:00.500000'` com eles.
- `BIT`, `BLOB` e `VARBINARY` são strings de bytes raw — `b'101'` é lido de volta como `"\x05"` —,
  e `JSON`, `ENUM` e `SET` são strings.

### Resultados no SQLite

As linhas vêm direto de `SQLite3Result::fetchArray()`: valores `INTEGER` como `int`, `REAL` como
`float`, `TEXT` e `BLOB` como `string`, `NULL` como `null`. O tipo declarado só define a afinidade
da coluna, que converteu o valor quando ele foi escrito:

- Colunas `DECIMAL` e `NUMERIC` guardam números: `'19.90'` é lido de volta como `19.9`, `'12.00'`
  como o inteiro `12`, e um valor além da precisão de um double é arredondado —
  `'12345678901234567890.123'` é lido de volta como `1.2345678901234567E+19`. Guarde decimais
  exatos em uma coluna `TEXT`, ou como inteiros em unidades menores.
- Colunas `DATE`, `DATETIME` e `TIMESTAMP` guardam o que foi escrito — texto, na prática — e o
  devolvem como string. `CURRENT_TIMESTAMP` é uma string UTC como `'2026-11-05 12:30:00'`.
- Colunas `BOOLEAN` guardam `1` e `0`.
- Uma coluna pode misturar classes: `'abc'` escrito em uma coluna `INTEGER` é lido de volta como
  `'abc'`.
- `SUM()` sobre inteiros é um `int`, `AVG()` um `float`, e um literal `1.5` um `float`.
- Texto é lido de volta só até o primeiro byte NUL (veja
  [Parâmetros no SQLite](#parâmetros-no-sqlite)).

## Escreva código portável

Código que roda nos três drivers vincula o que o mais estrito aceita e normaliza no PHP o que volta.
Com o `$Row` de qualquer receita em [Escreva e leia uma linha](#escreva-e-leia-uma-linha):

```php
use DateTimeImmutable;

$active = (bool) $Row['active'];
$price = is_string($Row['price']) ? $Row['price'] : number_format($Row['price'], 2, '.', '');
$HeldOn = $Row['held_on'] instanceof DateTimeImmutable ? $Row['held_on'] : new DateTimeImmutable($Row['held_on']);
$StartsAt = $Row['starts_at'] instanceof DateTimeImmutable ? $Row['starts_at'] : new DateTimeImmutable($Row['starts_at']);

$active;                            // true
$price;                             // '19.90'
$HeldOn->format('Y-m-d');           // '2026-11-05'
$StartsAt->format('Y-m-d H:i:s.u'); // '2026-11-05 09:30:00.123456'
```

- **Booleanos** — vincule um `bool` para uma coluna booleana e um `int` para uma inteira, já que o
  PostgreSQL recusa a troca, e leia-os com `(bool)`, já que só o PostgreSQL devolve um `bool`.
- **Decimais** — vincule-os como strings. O PostgreSQL e o MySQL devolvem strings e o SQLite um
  número, então, onde o SQLite é um alvo, guarde valores exatos como inteiros em unidades menores
  (centavos) ou em uma coluna `TEXT`, e compare decimais como strings (`bccomp()`), nunca como
  floats.
- **Datas e timestamps** — mantenha-os em UTC de ponta a ponta: o `date.timezone` do PHP, o fuso do
  servidor e os valores que você vincula. Vincule uma data como `format('Y-m-d')` e um timestamp
  como `format('Y-m-d H:i:s.u')`, que os três drivers aceitam, e leia-os de volta por
  `DateTimeImmutable`, como acima.
- **Horas do dia** — o PostgreSQL devolve um `DateTimeImmutable` com a data de hoje, o MySQL e o
  SQLite uma string cuja fração varia — no MySQL, com o protocolo (veja
  [Resultados no MySQL](#resultados-no-mysql)). Compare-as como strings `H:i:s`: os 8 primeiros
  caracteres de uma string, e o `format('H:i:s')` do objeto do PostgreSQL.
- **Inteiros grandes** — um `BIGINT UNSIGNED` do MySQL acima de `PHP_INT_MAX` é uma string, então
  tipe esses valores como `int|string`.
- **JSON** — todo driver devolve o documento como string: vincule a saída de `json_encode()`, e
  aplique `json_decode()` ao que você lê.
- **Floats** — no MySQL, use `DOUBLE` em vez de `FLOAT`, cujo valor depende do protocolo, e
  mantenha `NAN` e `INF` fora do banco: o MySQL os recusa, o SQLite guarda `NAN` como `NULL`, e o
  PostgreSQL os lê de volta como `0.0` por enquanto.
- **Agregados** — `SUM()` e `AVG()` voltam como `int`, `float` ou string dependendo do driver e da
  coluna, então faça o cast deles no PHP.
- **Dados binários** — o PostgreSQL lê um parâmetro string como texto, então bytes raw em uma
  coluna `bytea` falham (`invalid byte sequence for encoding "UTF8": 0x00`) ou são mal lidos, já que
  uma barra invertida começa um escape: `'\x4142'` é guardado como `AB`. Vincule
  `'\x' . bin2hex($bytes)`. No SQLite, envolva o placeholder em `CAST(?1 AS BLOB)`; o MySQL aceita a
  string raw. Os três devolvem os bytes raw.
- **Entidades do ORM** — a hidratação atribui cada valor como o driver o devolve, então uma
  propriedade precisa aceitar o que todo driver alvo devolve: `null|DateTimeImmutable` hidrata um
  timestamp no PostgreSQL e no MySQL, e lança um `TypeError` no SQLite, cujo valor é uma string. No
  PostgreSQL, uma propriedade temporal escrita também faz o `save()` falhar (veja
  [Datas no PostgreSQL](#datas-no-postgresql)); **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)**
  trata das propriedades de entidade.

## Referência

Os mapeamentos acima não têm API própria; eles decorrem de:

- **[Banco SQL](/manual/ADI/Databases/SQL/overview/)** — `query()`, `await()`, o `Result` e os
  erros da fachada.
- **[Configuração do banco](/manual/ADI/Database/Config/overview/)** — as chaves de conexão e os
  padrões delas.
- **[Driver PostgreSQL](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/)**,
  **[Driver MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/)** e
  **[Driver SQLite](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/)** — placeholders, prepared
  statements e chaves geradas.
- **[Drivers SQL](/manual/ADI/Databases/SQL/Drivers/overview/)** — a matriz de capacidades, e chaves
  maiores que um int do PHP.
