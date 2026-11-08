# Validadores

`Bootgly\ADI\Validators` reúne as 18 regras que o Bootgly traz para o `Bootgly\ADI\Validation`. Uma
regra é um objeto criado com os argumentos dela: liste-a sob um campo, e a validação a executa sobre o
valor desse campo e, quando o valor falha, adiciona a mensagem da regra aos erros do campo.

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: ['email' => 'user@example', 'plan' => 'gold', 'seats' => '3'],
   rules: [
      'email' => [new Required, new Email],
      'plan' => [new Required, new In(['free', 'team'])],
      'seats' => [new Required, new Integer, new Minimum(1), new Maximum(50)],
   ]
);

$Validation->valid;  // false
$Validation->errors; // ['email' => ['email must be a valid email address.'],
                     //  'plan' => ['plan must be one of the allowed values.']]
```

Como uma `Validation` executa as regras — valores em branco e regras implícitas, o formato de
`errors`, como uma mensagem é montada e traduzida, como escrever uma regra própria — está em
**[Validation](/manual/ADI/Validation/overview/)**. O **[guia de Validation](/guide/validation/overview/)**
tem as receitas para scripts, jobs e uploads, e o middleware `Validator` executa as mesmas regras sobre
uma requisição (veja **[Validação de Requisição](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/#validação-de-requisição)**).
Esta página trata das regras em si: o que cada uma aceita e rejeita, a mensagem dela e as ressalvas.

Toda regra estende `Bootgly\ADI\Validation\Condition` diretamente. Nenhuma delas estende
`Bootgly\ADI\Validators`, a classe abstrata que tem o mesmo nome do namespace, então
`$Rule instanceof Validators` é `false` para as 18: verifique o tipo de uma regra contra `Condition`.

## Regras em resumo

| Regra | Argumentos | Passa | Implícita | Template |
|---|---|---|---|---|
| [Boolean](#boolean) | — | `true`, `false`, `0`, `1`, `'0'`, `'1'`, `'true'`, `'false'` | Não | `{field} must be a boolean.` |
| [Confirmed](#confirmed) | `field`, padrão `<field>_confirmation` | Um valor idêntico ao do campo de confirmação | Não | `{field} confirmation does not match.` |
| [Date](#date) | `format`, sem padrão | Uma string de data; com um `format`, uma escrita exatamente nele | Não | `{field} must be a valid date.`; com um `format`, `{field} must be a valid date in the format {format}.` |
| [Email](#email) | — | Um endereço de e-mail | Não | `{field} must be a valid email address.` |
| [Extension](#extension) | `extensions` | Um upload cujo nome de arquivo termina em uma delas | Não | `{field} must have an allowed extension.` |
| [In](#in) | `values`, `strict` (padrão `true`) | Um dos `values` | Não | `{field} must be one of the allowed values.` |
| [Integer](#integer) | — | Um `int`, ou uma string de dígitos com sinal opcional | Não | `{field} must be an integer.` |
| [Keys](#keys) | `keys` | Um array cujas chaves estão todas em `keys` (um objeto fechado) | Não | `{field} has keys that are not allowed.` |
| [Length](#length) | `minimum`, `maximum` | Uma string com essa quantidade de caracteres (codepoints) | Não | `{field} must be between {minimum} and {maximum} characters.`; com um limite só, `{field} must be at least {minimum} characters.` ou `{field} must be at most {maximum} characters.` |
| [Maximum](#maximum) | `limit` | No máximo `limit`, por valor, tamanho em bytes ou contagem | Não | `{field} must be at most {limit}.` |
| [MIME](#mime) | `types` | Um upload cujos bytes são identificados como um deles | Não | `{field} must have an allowed MIME type.` |
| [Minimum](#minimum) | `limit` | No mínimo `limit`, por valor, tamanho em bytes ou contagem | Não | `{field} must be at least {limit}.` |
| [Regex](#regex) | `pattern` | Um escalar que casa com ele | Não | `{field} has an invalid format.` |
| [Required](#required) | — | Tudo menos `null`, `[]` e uma string em branco | Sim | `{field} is required.` |
| [Size](#size) | `limit`, em bytes | Um upload de no máximo `limit` bytes | Não | `{field} must be at most {limit} bytes.` |
| [Text](#text) | — | Uma string | Não | `{field} must be a string.` |
| [URL](#url) | — | Uma URL | Não | `{field} must be a valid URL.` |
| [UUID](#uuid) | — | Um UUID na forma canônica hexadecimal 8-4-4-4-12 | Não | `{field} must be a valid UUID.` |

- **`message`** — Toda regra o recebe como último argumento, `''` por padrão. Uma mensagem que você
  passa substitui o template e mantém os placeholders dele:
  `new Size(2 * 1024 * 1024, '{field} must be a file of at most {limit} bytes.')`.
- **Implícita** — Só `Required` roda sobre um valor em branco: um campo ausente, `null`, `''` ou `[]`.
  As outras 17 o pulam, então um campo continua opcional até você adicionar `Required`. Uma string de
  espaços não está em branco: toda regra roda sobre ela, e `Required` a reprova. Veja
  [Valores em branco e regras implícitas](/manual/ADI/Validation/overview/#valores-em-branco-e-regras-implícitas).
- **Template** — A mensagem em inglês, e também a key dela nos catálogos de tradução do domínio
  `validation`. `{field}` vira a key do campo; `{limit}`, `{format}`, `{minimum}` e `{maximum}` viram o argumento da regra do
  jeito que o PHP o converte em string — `Minimum(1.5)` diz `1.5`, `Size(2 * 1024 * 1024)` diz
  `2097152`. Um catálogo `pt-BR` completo está em
  **[Mensagens de validação localizadas](/guide/i18n/overview/#mensagens-de-validação-localizadas)**.

## Números, tamanhos e contagens

`Minimum` e `Maximum` não têm modo: eles medem um valor pelo tipo dele, e uma string pela aparência
dela.

| Valor | Medido como | Passa em `Minimum(8)` | Falha em `Minimum(8)` |
|---|---|---|---|
| Um `int` ou um `float` | O valor dele | `8`, `8.5` | `7`, `7.9` |
| Uma string que parece um número | O valor dela | `'8'`, `'1234'`, `'+9'` | `'7'`, `'-5'`, `'.5'` |
| Qualquer outra string | O tamanho dela em bytes | `'abcdefgh'`, `'éééé'` | `'abcdefg'`, `'ééé'` |
| Um array | O número de itens dele | 8 itens | 1 item |
| `true`, `false`, um objeto | — | Nunca | Sempre |

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;

$Validation = new Validation(
   source: ['age' => '17', 'nickname' => 'éé', 'tags' => ['a', 'b', 'c', 'd']],
   rules: [
      'age' => [new Minimum(18)],
      'nickname' => [new Minimum(3)],
      'tags' => [new Maximum(3)],
   ]
);

$Validation->errors; // ['age' => ['age must be at least 18.'], 'tags' => ['tags must be at most 3.']]
```

`'éé'` tem dois caracteres mas quatro bytes, então passa em `Minimum(3)`.

> [!WARNING]
> **Não é uma regra de tamanho de texto.** Uma string que parece um número é comparada pelo valor
> dela, então a senha `'1234'` passa em `Minimum(8)`; qualquer outra string é medida em bytes, então
> uma bio de 300 `'é'` tem 600 bytes e falha em `Maximum(500)`. Limite o tamanho de um texto com
> [Length](#length), que conta caracteres.

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Length;

$Validation = new Validation(
   source: ['password' => '1234', 'bio' => str_repeat('é', 300)],
   rules: [
      'password' => [new Length(8)],
      'bio' => [new Length(maximum: 500)],
   ]
);

$Validation->errors; // ['password' => ['password must be at least 8 characters.']]
```

O `Length` conta codepoints Unicode, a unidade que o `mb_strlen()` conta, e uma string que não é
UTF-8 válido falha nele. Um codepoint nem sempre é um caractere visível: um `é` digitado
como `e` mais um acento combinante conta 2, e um emoji formado por vários codepoints conta cada um
deles, então um máximo pode rejeitar um texto que parece mais curto.

Por enquanto, o teste de aparência arma mais duas armadilhas:

- Um número com um espaço em volta, ou com expoente (`' 150'`, `'150 '`, `'1e3'`), é medido como
  tamanho — e a decodificação de formulários produz essas strings. `qty=+150` chega como `' 150'`,
  pois um `+` decodifica para espaço: 4 bytes, então passa em `Maximum(100)`. `age=18+` chega como
  `'18 '` e falha em `Minimum(18)`. Adicione `Integer` ao campo: ele rejeita os dois
  (`qty must be an integer.`).
- `[new Minimum(4), new Maximum(4)]` não significa "4 caracteres" para uma string de dígitos: `'0042'`
  e `'9999'` são comparadas pelo valor e falham em `Maximum(4)`, enquanto `'4'` passa.

Um array é contado, e isso inclui a lista de uploads que um campo `photos[]` envia: `Maximum(5)`
limita quantos arquivos chegam (veja [Vários arquivos](#vários-arquivos)).

Uma regra não converte nada: `Integer` aprova `'42'` e o campo continua com a string `'42'`. Os
validadores respondem "este valor é aceitável?"; para transformá-lo num `int`, converta-o com os
**[Casters](/manual/ADI/Casters/overview/)** — `Casters::Integer->cast('42', Modes::Strict)` é `42`.
O caster estrito é mais restrito que a regra: ele recusa `'007'` e um número além de `PHP_INT_MAX`,
que o `Integer` aprova.

## Datas

`Date` aceita só uma string não vazia — um `DateTimeImmutable` ou um timestamp inteiro falha — e a
verifica de um de dois jeitos:

- **Sem formato**, qualquer string que o `strtotime()` entenda passa: `'2026-07-09'`, `'12/31/2026'`,
  `'tomorrow'`, `'next friday'`, `'@1700000000'`. Por enquanto isso inclui uma única letra — qualquer
  uma de `a` a `z` menos `j`, maiúscula ou minúscula —, que o `strtotime()` lê como um fuso horário
  militar: `'a'`, `'x'` e `'Z'` passam. O `strtotime()` faz uma data impossível rolar em vez de
  recusá-la, então `'2026-02-30'` passa, e ele lê barras como mês, dia e ano, então `'31/12/2026'`
  falha.
- **Com formato**, o valor tem de estar escrito exatamente nele. `Date` parseia o valor com
  `DateTimeImmutable::createFromFormat()` e formata o resultado de volta: um overflow de calendário
  (`'2026-02-30'`), um 29 de fevereiro fora de ano bissexto (`'2027-02-29'`), um zero à esquerda
  faltando (`'2026-7-9'` para `Y-m-d`), `24:00` e qualquer texto extra falham. Por enquanto, uma
  string que contém um byte NUL — `?starts=2026-07-09%00` envia uma — faz `Date` lançar `ValueError`
  em vez de falhar: nenhum campo recebe mensagem, e uma rota atrás do `Validator` do WPI responde
  `500` em vez de `422` (veja [Erros](#erros)).

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Date;

$Validation = new Validation(
   source: ['starts' => '2026-02-30', 'ends' => '2026-02-30'],
   rules: [
      'starts' => [new Date],
      'ends' => [new Date('Y-m-d')],
   ]
);

$Validation->errors; // ['ends' => ['ends must be a valid date in the format Y-m-d.']]
```

> [!WARNING]
> Um formato pega da data e hora atuais todo campo que ele deixa de fora. Por enquanto, isso faz um
> formato sem o dia depender do calendário: `Date('m/Y')` e `Date('Y-m')` parseiam o valor com o dia de
> hoje, que pode estourar um mês mais curto. Nos dias 29, 30 e 31, `'02/2027'` falha com
> `expires must be a valid date in the format m/Y.`, e no dia 31 `'04/2027'` falha também; em
> qualquer outro dia os dois passam. Um formato sem o ano pega o atual: `Date('d/m')` rejeita
> `'29/02'` em 2026 e o aceita em 2028. Os modificadores de parse `!` e `|` não ajudam, pois `Date` os
> escreve de volta ao formatar a data: `Date('!m/Y')` rejeita todo valor.

Dê a `Date` um formato com o ano, o mês e o dia, ou verifique um mês e um ano com `Regex`:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Regex;

$Validation = new Validation(
   source: ['expires' => '02/2027'],
   rules: [
      'expires' => [new Regex('#\A(0[1-9]|1[0-2])/\d{4}\z#', '{field} must be a month and year, as in 02/2027.')],
   ]
);

$Validation->valid; // true
```

## Links da web

`URL` verifica o formato de uma URL com o `FILTER_VALIDATE_URL` do PHP, e nada mais. Ela exige um
esquema e um host — URLs `mailto:`, `news:` e `file:` podem omitir o host — mas aceita qualquer
esquema: `ftp://example.com`, `file:///etc/passwd`, `mailto:a@b.c` e
`javascript://example.com/%0Aalert(1)` passam, e `localhost` e endereços IP também, como hosts. Antes de
guardar um link que um usuário enviou, ou de renderizá-lo, combine `URL` com um `Regex` para os
esquemas que você aceita:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Regex;
use Bootgly\ADI\Validators\URL;

$Validation = new Validation(
   source: ['website' => 'javascript://example.com/%0Aalert(1)'],
   rules: [
      'website' => [new URL, new Regex('#\Ahttps?://#i', '{field} must start with http:// or https://.')],
   ]
);

$Validation->errors; // ['website' => ['website must start with http:// or https://.']]
```

`URL` também rejeita endereços que um navegador abriria: um host internacionalizado
(`http://例子.com`) falha, enquanto a forma punycode dele (`http://xn--fsqu00a.com`) passa. Uma URL
sem esquema (`example.com`, `//example.com`), com um espaço, ou sem host (`tel:+5511999999999`,
`data:text/plain,hi`, `javascript:alert(1)`) falha.

## Uploads

`Size`, `MIME` e `Extension` verificam um registro de upload — um item de `$Request->files`, com as
chaves `name`, `type`, `size`, `error` e `tmp_name` (veja
**[Arquivos](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/#arquivos)**). Cada uma falha a menos que
`error` seja o inteiro `UPLOAD_ERR_OK` (`0`), e então lê uma parte do registro:

| Regra | Lê | Passa quando |
|---|---|---|
| `Size` | `size` | É um inteiro de no máximo `limit` bytes |
| `MIME` | O arquivo em `tmp_name` | Os bytes dele são identificados como um dos tipos |
| `Extension` | `name` | A última extensão dele é uma das extensões |

Nenhuma delas lê `type`, o `Content-Type` que o cliente declarou para a part. A seção
**[Validando uploads](/guide/validation/overview/#validando-uploads)** do guia coloca as três numa rota;
sobre registros que o servidor decodificou, elas decidem:

| Upload | `Size(1024)` | `MIME(['image/png', 'image/jpeg'])` | `Extension(['png', 'jpg', 'jpeg'])` |
|---|---|---|---|
| Um PNG de 70 bytes chamado `photo.png` | Passa | Passa | Passa |
| Um script PHP chamado `photo.png`, enviado como `image/png` | Passa | Falha | Passa |
| Um PNG chamado `photo.txt`, enviado como `text/plain` | Passa | Passa | Falha |
| Nenhum arquivo escolhido | Falha | Falha | Falha |
| Dois arquivos enviados como `photos[]` | Falha | Falha | Falha |

### Nenhum arquivo escolhido

Um formulário enviado com um input de arquivo vazio ainda carrega a part dele, e o campo chega como um
registro com `error` = `UPLOAD_ERR_NO_FILE` (`4`). Esse registro não está em branco, então `Required`
o aprova e toda outra regra roda:
`[new Required, new Size(2 * 1024 * 1024), new MIME(['image/png']), new Extension(['png'])]` reporta
`avatar must be at most 2097152 bytes.`, `avatar must have an allowed MIME type.` e
`avatar must have an allowed extension.` Escreva as mensagens das regras de upload para esse caso
também. Só um campo ausente da requisição falha em `Required`, com `avatar is required.`

### Vários arquivos

Um campo chamado `photos[]` chega como uma lista de registros. As regras de upload verificam um
registro, então a lista falha nelas, enquanto `Minimum` e `Maximum` contam os registros dela. Valide
cada registro por conta própria:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\MIME;
use Bootgly\ADI\Validators\Size;

$errors = [];
foreach ($Request->files['photos'] ?? [] as $index => $record) {
   $Validation = new Validation(["photos.$index" => $record], [
      "photos.$index" => [new Size(2 * 1024 * 1024), new MIME(['image/jpeg', 'image/png'])],
   ]);
   $errors += $Validation->errors;
}

$errors; // ['photos.1' => ['photos.1 must have an allowed MIME type.']]
```

Aqui o segundo arquivo era um script PHP enviado como `image/png`.

## JSON Schema

O `Bootgly\ADI\Validation\Renderer` gera um documento JSON Schema a partir de um conjunto de regras
(veja **[Exporte um JSON Schema](/manual/ADI/Validation/overview/#exporte-um-json-schema)**). Catorze
regras implementam `Bootgly\ADI\Validation\Descriptor` e dizem quais keywords representam; as
outras quatro ficam de fora e são listadas em `omissions` do Renderer.

| Regra | Keywords | Não expresso |
|---|---|---|
| Boolean | `type: boolean` | `0`, `1`, `'0'`, `'1'`, `'true'`, `'false'` |
| Date | `type: string`; `format: date` para `Y-m-d`, `format: date-time` para `Y-m-d\TH:i:sP` (`DATE_ATOM`, `DATE_RFC3339`) e `Y-m-d\TH:i:sp` | Qualquer outro formato, e a verificação do `strtotime()`; `date-time` também admite `Z`, frações de segundo e `t`/`z` minúsculos, que a regra rejeita (a saída de `toISOString()` falha nela) |
| Email | `type: string`, `format: email` | Endereços que o formato admite mas o `FILTER_VALIDATE_EMAIL` rejeita, como `a@localhost` |
| In | `enum` dos valores | Uma comparação frouxa (`strict: false`); valores que não são escalares JSON tornam a regra inexprimível |
| Integer | `type: integer` | Strings de inteiro como `'18'` |
| Keys | `type: object`, `propertyNames: {enum: keys}` (`maxProperties: 0` quando `keys` está vazio) | Uma lista cujos índices são chaves permitidas (`Keys(['0', '1'])` aceita `['a', 'b']`), que o `type: object` recusa |
| Length | `type: string`, `minLength` / `maxLength` (os dois contam codepoints) | Um `''` opcional em branco, que a `Validation` pula e o `minLength` recusa |
| Maximum | `maximum`, e `maxLength`, `maxItems`, `maxProperties` da contagem inteira que o limite admite | Strings numéricas comparadas pelo valor; tamanho em bytes (o JSON Schema conta caracteres); um limite infinito torna a regra inexprimível |
| Minimum | `minimum`, e `minLength`, `minItems`, `minProperties` da contagem inteira que o limite admite | O mesmo do `Maximum` |
| Regex | `pattern`, traduzido para ECMA-262 | Veja abaixo |
| Required | A chave no `required` do pai, mais as keywords de não-vazio do tipo do valor | Uma string só de espaços |
| Text | `type: string` | — |
| URL | `type: string`, `format: uri` | URIs sem `//` que a regra rejeita, como `urn:isbn:0451450523` |
| UUID | `type: string`, `format: uuid` | — |
| Confirmed, Extension, MIME, Size | — (omitidas) | Uma verificação entre campos e os registros de upload não têm forma em JSON Schema |

`Minimum` e `Maximum` emitem um limite para cada tipo, e o Renderer mantém o que o `type` do valor
pede: `[new Integer, new Minimum(18)]` vira `{"type":"integer","minimum":18}`.

O `Regex` descarta os delimitadores e troca `\A`, `\z` e `\Z` por `^` e `$`; o resultado compila
com a flag `u` que os validadores de JSON Schema usam. Um caractere de pontuação escapado que não é
sintaxe do ECMA-262 — o `\-`, `\#` ou `\:` que o `preg_quote()` escreve — vira o caractere simples
(`\-` continua escapado dentro de uma classe). Um pattern com um modificador diferente de `u` e `D` —
`i` inclusive — ou com uma construção que o ECMA-262 não tem ou lê diferente não é traduzido, e a
regra é omitida: `(?P<…>`, `(?>…)`, `(*…)`, modificadores inline, quantificadores possessivos como
`a++`, uma chave que não é um quantificador `{n}`, `{n,}` ou `{n,m}` (`x{,3}`), um `]` solto, classes
POSIX, um `]` logo depois de `[`, e uma letra ou dígito escapado que não seja
`\d \D \w \W \s \S \b \B \n \r \t \f`, `\cX`, `\xHH`, categorias no estilo `\p{L}`, `\k<name>` e uma
referência de um dígito (então `\K`, `\R`, `\h`, `\v`, `\Q…\E`, `\x{…}`, `\o{…}` e o octal `\012` são
recusados), um lookaround com quantificador (`(?=a)*`) e um `\p{…}` que não seja uma categoria
geral. Sem `u`, o PCRE casa bytes, então um pattern precisa ser ASCII para ser traduzido — sem `é`,
sem `\xE9`, sem `\p{…}`. Restam diferenças, então o servidor continua conferindo com PCRE: `$` casa
antes de uma quebra de linha final, `.` casa `\r`, uma referência a um grupo que não participou
falha no PCRE e casa vazio no ECMA-262, e com `u` o `\d`, o `\w`, o `\s` e o `\b` do PCRE reconhecem
Unicode (`١٢٣` é `\d+`) onde os do ECMA-262 são ASCII.

## Erros

Duas regras podem lançar exceção ao serem criadas:

| Exceção | Lançada por | Causa |
|---|---|---|
| `InvalidArgumentException` com `Invalid validation regex pattern.` | `new Regex()` | O PCRE não consegue interpretar o padrão: uma letra, um dígito ou uma barra invertida como delimitador (`'abc'`, `'\d+'`), sem o delimitador de fechamento (`'/abc'`), um modificador desconhecido (`'[a-z]+'`: `[` e `]` são lidos como os delimitadores, e o `+` como modificador), um grupo não fechado (`'/(abc/'`), uma string vazia |
| `RuntimeException` com `The MIME validator requires the fileinfo extension.` | `new MIME()` | A extensão `fileinfo` do PHP não está carregada |

```php
use InvalidArgumentException;

use Bootgly\ADI\Validators\Regex;

try {
   $Rule = new Regex('[a-z]+');
}
catch (InvalidArgumentException $Exception) {
   $Exception->getMessage(); // 'Invalid validation regex pattern.'
}
```

Um padrão que começa com `(`, `[`, `{` ou `<` e termina com o fechamento correspondente pode ser
criado sem erro, porque o PCRE toma esse par como os delimitadores: `'(\d+)'` é lido como `\d+`, e `'[0-9]'`
como o texto literal `0-9`, que `'7'` não satisfaz. Escreva sempre os delimitadores: `'/[0-9]/'`, ou
`#` quando o padrão contém uma `/`, como em `'#\Ahttps?://#i'`.

Além disso, o PHP verifica os tipos dos argumentos: `new In('free')` lança um `TypeError`, enquanto um
arquivo sem `strict_types` converte antes uma string numérica, então `new Minimum('8')` cria
`Minimum(8)`. Nenhuma regra verifica mais que isso: um argumento do tipo certo sempre cria uma regra,
mesmo uma que rejeita todo valor — `new In([])`, `new Date('')`, ou `new MIME('image/jpg')` para um
JPEG, que a libmagic chama de `image/jpeg`.

Uma regra também pode lançar enquanto valida. A exceção escapa do `new Validation()`, então nenhum
campo recebe mensagem (veja [Toda regra roda](/manual/ADI/Validation/overview/#toda-regra-roda)):

- Por enquanto, `Date` com formato lança `ValueError` com
  `DateTimeImmutable::createFromFormat(): Argument #2 ($datetime) must not contain any null bytes`
  sobre uma string que contém um byte NUL, que uma query string, um formulário ou um corpo JSON
  podem enviar: `?starts=2026-07-09%00` chega como `"2026-07-09\0"`. Atrás do `Validator` do WPI, a
  exceção sai do middleware como qualquer erro da rota, então o cliente recebe um `500` em vez de um
  `422`.
- Por enquanto, duas regras lançam sobre um valor que nenhuma requisição carrega, porque o handler
  de erros do Bootgly transforma toda notice e todo aviso do PHP em `ErrorException`: `In` com `strict: false` sobre um
  objeto que ele compara com um número (`Object of class stdClass could not be converted to int`), e
  `Regex`, no PHP 8.5, sobre `NAN` (`unexpected NAN value was coerced to string`).

## Referência

Toda regra é uma classe de `Bootgly\ADI\Validators` que estende `Bootgly\ADI\Validation\Condition`, que
declara o `validate()` dela e lhe dá o `format()` e as propriedades `$implicit` e `$message` — veja a
Referência de **[Validation](/manual/ADI/Validation/overview/#condition)**. Os argumentos abaixo continuam
legíveis na regra, e nenhum deles pode ser alterado depois que ela é criada.

As catorze regras listadas em [JSON Schema](#json-schema) também implementam
`Bootgly\ADI\Validation\Descriptor`:

```php
describe (): null|array
```

Retorna as keywords de JSON Schema daquela tabela, ou `null` quando os argumentos desta regra não
podem ser expressos (um valor do `In` que não é escalar JSON, um `Minimum`/`Maximum` infinito, um
`Regex` com modificador ou com uma construção exclusiva do PCRE). O `Required` retorna
`['required' => true]`.

### Boolean

```php
__construct (string $message = '')
```

Herdado de `Condition`. Passa `true`, `false`, os inteiros `0` e `1`, e as strings `'0'`, `'1'`,
`'true'` e `'false'`; qualquer outra coisa falha — `'TRUE'`, `'yes'`, `'on'`, `' 1'`, `2`, `1.0`. Um
checkbox HTML sem o atributo `value` envia `'on'` quando marcado: dê a ele `value="1"`. Template:
`{field} must be a boolean.`

### Confirmed

```php
__construct (null|string $field = null, string $message = '')
```

Passa quando a origem contém o campo de confirmação — `$field`, ou `<field>_confirmation` quando ele é
`null` — com um valor idêntico (`===`) ao do campo. Os dois são caminhos (veja
**[Caminhos aninhados e curingas](/manual/ADI/Validation/overview/#caminhos-aninhados-e-curingas)**):
o `<field>_confirmation` de `user.password` é `user.password_confirmation`, o irmão dele, e `$field`
é lido a partir da raiz da origem. `'secret'` contra `'secret '` falha, e `'1234'`
contra o inteiro `1234` também. Um campo de confirmação ausente falha. A regra não é implícita: quando
o próprio campo está em branco ela não roda, seja o que for que o campo de confirmação contenha, então
combine-a com `Required`. Template: `{field} confirmation does not match.`

```php
public private(set) null|string $field;
```

O caminho do campo de confirmação, como foi passado; `null` significa `<field>_confirmation`.

### Date

```php
__construct (null|string $format = null, string $message = '')
```

Passa uma string não vazia que o `strtotime()` entende ou, com um `$format`, uma escrita exatamente
nesse formato do `DateTimeImmutable::createFromFormat()`; qualquer outro tipo falha. Por enquanto,
com um `$format`, uma string que contém um byte NUL lança `ValueError` em vez disso (veja
[Erros](#erros)). Veja [Datas](#datas) para o que cada jeito aceita e por que um formato precisa do
dia. Template: `{field} must be a valid date.`; com um `$format`,
`{field} must be a valid date in the format {format}.`, onde `{format}` é o formato.

```php
public private(set) null|string $format;
```

O formato, como foi passado; `null` verifica com `strtotime()`.

### Email

```php
__construct (string $message = '')
```

Herdado de `Condition`. Passa uma string que o `FILTER_VALIDATE_EMAIL` do PHP aceita:
`'user@example.com'`, `'user.name+tag@example.co.uk'`, `'user@[127.0.0.1]'`. Um domínio sem ponto
(`'user@localhost'`, `'user@example'`), caracteres não ASCII (`'josé@example.com'`,
`'user@exämple.com'` — o punycode `'user@xn--exmple-cua.com'` passa), um espaço em volta do endereço e
qualquer outro tipo falham. Só o formato é verificado: sem consulta DNS, sem caixa postal. Template:
`{field} must be a valid email address.`

### Extension

```php
__construct (string|array $extensions, string $message = '')
```

Passa um registro de upload cujo `error` é `0` e cujo `name` termina em uma das `$extensions`,
comparadas em minúsculas: `PHOTO.PNG` passa em `png`. Só a última extensão conta, então
`archive.tar.gz` é `gz` e `new Extension('tar.gz')` nunca passa. `name` é o nome de arquivo que o
cliente enviou, apenas sanitizado pelo servidor, então um script PHP chamado `photo.png` passa:
combine `Extension` com `MIME`. Template: `{field} must have an allowed extension.`

```php
public private(set) array $extensions;
```

As extensões permitidas, normalizadas: minúsculas, pontos iniciais removidos —
`new Extension(['.PNG', 'Jpg'])` contém `['png', 'jpg']`.

### In

```php
__construct (array $values, bool $strict = true, string $message = '')
```

Passa um valor que o `in_array()` encontra em `$values`. Estrita por padrão, então o tipo também tem
de bater: `'3'` falha em `new In([1, 2, 3])`. Com `strict: false` a comparação é o `==` do PHP:
`'3'` casa com `3`, `'1.0'`, `' 1'` e `'1e0'` casam com `1`, `'1e1'` casa com `'10'`, e `true` casa
com qualquer valor que o PHP converte em `true` — um `true` de JSON passa em
`new In(['admin', 'user'], strict: false)`.
Template: `{field} must be one of the allowed values.`

```php
public private(set) array $values;
```

Os valores permitidos, como foram passados.

```php
public private(set) bool $strict;
```

Se a comparação também verifica o tipo (`===`).

### Integer

```php
__construct (string $message = '')
```

Herdado de `Condition`. Passa um `int`, ou uma string de dígitos com um sinal inicial opcional:
`'42'`, `'-7'`, `'+7'`, `'007'`. Um `float` (`1.0`), um decimal ou um expoente (`'1.0'`, `'1e3'`),
hexadecimal (`'0x1A'`), `'1_000'`, um espaço ou uma quebra de linha em volta dos dígitos, e `true`
falham. O intervalo não é verificado: `'99999999999999999999'`, além de `PHP_INT_MAX`, passa.
Template: `{field} must be an integer.`

### Keys

```php
__construct (array $keys, string $message = '')
```

Passa um array cujas chaves estão todas em `$keys` (`array<int,string>`), comparadas como strings —
um objeto fechado: `['name' => 'Ada', 'role' => 'admin']` falha em `new Keys(['name', 'email'])`. Uma
lista só passa quando os índices dela (`'0'`, `'1'`, …) estão listados, e qualquer coisa que não seja
array falha. A mensagem nunca nomeia a chave a mais. Chaves ausentes não são problema dela: dê a cada
chave obrigatória o próprio `Required`. Lança `InvalidArgumentException` com
`Allowed keys must be strings.` para uma chave que não é string. Template:
`{field} has keys that are not allowed.`

```php
public private(set) array $keys;
```

As chaves permitidas, `array<int,string>`.

### Length

```php
__construct (null|int $minimum = null, null|int $maximum = null, string $message = '')
```

Passa uma string cujo tamanho em caracteres — codepoints Unicode, como o `mb_strlen()` conta — está
dentro dos limites; uma string que não é UTF-8 válido, e qualquer coisa que não seja string, falha.
Passe um limite ou os dois. Lança `InvalidArgumentException` com
`Length needs a minimum or a maximum.`, `Length bounds must not be negative.` ou
`Length minimum must not exceed its maximum.` Template:
`{field} must be between {minimum} and {maximum} characters.`, ou com um limite só
`{field} must be at least {minimum} characters.` / `{field} must be at most {maximum} characters.`

```php
public private(set) null|int $minimum;
```

O menor número de caracteres aceito; `null` para nenhum limite inferior.

```php
public private(set) null|int $maximum;
```

O maior número de caracteres aceito; `null` para nenhum limite superior.

### Maximum

```php
__construct (int|float $limit, string $message = '')
```

Passa um valor de no máximo `$limit`: um número pelo valor dele, qualquer outra string pelo tamanho
dela em bytes, um array pelo número de itens dele — veja
[Números, tamanhos e contagens](#números-tamanhos-e-contagens). `true`, `false` e objetos falham.
Template: `{field} must be at most {limit}.`

```php
public private(set) int|float $limit;
```

O limite, como foi passado.

### MIME

```php
__construct (string|array $types, string $message = '')
```

Passa um registro de upload cujo `error` é `0` e cujo arquivo é identificado como um dos `$types`.
Lança uma `RuntimeException` com `The MIME validator requires the fileinfo extension.` quando a
extensão `fileinfo` do PHP não está carregada. Template: `{field} must have an allowed MIME type.`

- **Os bytes decidem.** A regra identifica o arquivo em `tmp_name` com a `fileinfo` (libmagic) e nunca
  lê o `type` do registro: um script PHP enviado como `image/png` falha, e um PNG enviado como
  `text/plain` passa.
- **Só um arquivo que o servidor escreveu.** `tmp_name` tem de ser um arquivo regular diretamente
  dentro de `BOOTGLY_UPLOADS_DIR`, onde o servidor HTTP grava os uploads. Um caminho em qualquer outro
  lugar, um symlink, um diretório ou um FIFO falha, então um registro montado à mão não consegue
  apontar a regra para `/etc/passwd` — nem um comando consegue verificar um arquivo que obteve de
  outro jeito.
- **Nomeie os tipos como a libmagic os nomeia**: `image/jpeg` (`image/jpg` rejeita todo JPEG),
  `image/png`, `application/pdf`, `text/plain`.
- **Identificar o formato não é varrer malware.** A identificação nomeia o formato com que os bytes
  começam: `GIF89a<?php …` é identificado como `image/gif`, e um SVG (`image/svg+xml`) pode carregar
  scripts. Nunca mantenha uploads sob um caminho executável ou servido pela web: persista-os com
  **[store()](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/#persistir-um-upload-store)** em um
  disco que o servidor web não executa.

```php
public private(set) array $types;
```

Os tipos permitidos, normalizados: minúsculas, parâmetros descartados —
`new MIME('IMAGE/PNG; charset=binary')` contém `['image/png']`.

### Minimum

```php
__construct (int|float $limit, string $message = '')
```

Passa um valor de no mínimo `$limit`: um número pelo valor dele, qualquer outra string pelo tamanho
dela em bytes, um array pelo número de itens dele — veja
[Números, tamanhos e contagens](#números-tamanhos-e-contagens). `true`, `false` e objetos falham.
Template: `{field} must be at least {limit}.`

```php
public private(set) int|float $limit;
```

O limite, como foi passado.

### Regex

```php
__construct (string $pattern, string $message = '')
```

Testa o `$pattern` ao ser criada e lança uma `InvalidArgumentException` com
`Invalid validation regex pattern.` quando o PCRE o recusa (veja [Erros](#erros)). Passa um escalar
que casa, convertido antes em string — `42` vira `'42'`, `true` vira `'1'`, `false` vira `''`, `4.0`
vira `'4'` —, enquanto arrays e objetos falham. Um padrão sem âncoras casa em qualquer ponto:
`'/[a-z]+/'` passa em `'123abc456'`, então ancore-o com `\A` e `\z`. Com a flag `u`, um valor que
não é UTF-8 válido falha.
Template: `{field} has an invalid format.`

```php
public private(set) string $pattern;
```

O padrão, como foi passado.

### Required

```php
__construct (string $message = '')
```

A única regra implícita: ela também roda sobre valores em branco. Falha `null` (um campo ausente
incluído), uma string que fica vazia após o `trim()` (`''`, `'   '`, `"\t\n"`) e `[]`; passa qualquer
outro valor — `0`, `'0'`, `false` e `0.0` incluídos — e, portanto, o registro de um input de arquivo
vazio (veja [Nenhum arquivo escolhido](#nenhum-arquivo-escolhido)). Template: `{field} is required.`

### Size

```php
__construct (int $limit, string $message = '')
```

Passa um registro de upload cujo `error` é `0` e cujo `size` é um inteiro de no máximo `$limit` bytes:
`Size(70)` passa um arquivo de 70 bytes, `Size(69)` o reprova. Os limites da própria requisição vêm
antes: o servidor responde `413` a um corpo multipart maior que `maxFileSize`, um limite do
`Request\Configs` de 500 MiB por padrão, antes de qualquer rota rodar (veja
[Padrões](/manual/WPI/HTTP/HTTP_Server_CLI/overview/#padrões)), e o `BodyParser`, numa rota que o
executa, responde `413` a um corpo acima do `maxSize` dele, 1 MiB por padrão. O `maxSize` conta o
corpo inteiro da requisição — todo arquivo e todo campo, com os boundaries do multipart —, então dê a
ele um valor acima da maior requisição que você aceita, não do maior arquivo (veja
**[BodyParser](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/#bodyparser)**). Template:
`{field} must be at most {limit} bytes.`

```php
public private(set) int $limit;
```

O maior tamanho aceito, em bytes.

### Text

```php
__construct (string $message = '')
```

Herdado de `Condition`. Passa qualquer string — `'12'` inclusive — e reprova números, booleanos e
arrays: declara que um campo guarda texto. Template: `{field} must be a string.`

### URL

```php
__construct (string $message = '')
```

Herdado de `Condition`. Passa uma string que o `FILTER_VALIDATE_URL` do PHP aceita, seja qual for o
esquema e o host — veja [Links da web](#links-da-web). Template: `{field} must be a valid URL.`

### UUID

```php
__construct (string $message = '')
```

Herdado de `Condition`. Passa um UUID na forma de texto canônica — 32 dígitos hexadecimais em grupos
de 8-4-4-4-12, em qualquer caixa (RFC 9562), de qualquer versão, o UUID nulo inclusive. Chaves,
`urn:uuid:`, formas sem hífen e qualquer outra coisa falham. Template: `{field} must be a valid UUID.`
