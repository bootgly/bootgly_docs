# DNS

`DNS` é o codec de mensagens DNS do Bootgly (RFC 1035 §4): escreve uma `Message` em bytes e lê bytes
de volta para uma `Message`. Ele só transforma bytes. Não abre socket, não guarda estado e não faz
cache, então o transporte fica com quem chama. Sobre UDP, um datagrama é uma mensagem. Sobre TCP,
cada mensagem vem depois de um tamanho de 2 bytes (RFC 1035 §4.2.2), e você remove esse tamanho
antes do `decode()`.

`decode()` lê bytes que vieram da rede, ou seja, qualquer um pode tê-los forjado. Ele nunca lança
exceção para uma entrada ruim. Em vez disso, devolve um case de `Faults` que diz por que recusou os
bytes, e nunca devolve meia mensagem.

## Escrever uma consulta

Uma `Message` é só dados. Passe ao construtor, por nome, os campos de que você precisa. Todos os
outros ficam no default (id 0, sem flags, rcode 0, sem EDNS(0), seções vazias):

```php
use Bootgly\ABI\Data\DNS;
use Bootgly\ABI\Data\DNS\Message;
use Bootgly\ABI\Data\DNS\Message\Question;

$Query = new Message(
   id: 0x1A2B,          // um id aleatório por consulta
   recursion: true,     // RD: pede ao servidor que resolva o nome até o fim
   size: 1232,          // EDNS(0): o tamanho de payload UDP que este lado aceita
   Questions: [new Question('example.com', DNS::TYPE_A)]
);

$bytes = DNS::encode($Query); // 40 bytes, prontos para um datagrama na porta DNS::PORT (53)
```

`size` acrescenta um registro OPT do EDNS(0) (RFC 6891) com versão 0, o bit DO desligado e nenhuma
opção. Deixe `null` para uma mensagem clássica de no máximo `DNS::SIZE` (512) bytes.

## Ler uma resposta

`decode()` devolve uma `Message` ou um case de `Faults`. Antes de qualquer coisa, veja qual dos dois
voltou:

```php
use Bootgly\ABI\Data\DNS;
use Bootgly\ABI\Data\DNS\Faults;

$Answer = DNS::decode($datagram);

if ($Answer instanceof Faults) {
   // recusada: $Answer->name diz o motivo ('Short', 'Loop', 'Count', ...)
   return;
}

$Answer->response;  // true
$Answer->rcode;     // DNS::RCODE_NOERROR (0), DNS::RCODE_NXDOMAIN (3), ...
$Answer->size;      // 1232: o tamanho EDNS(0) do servidor, null sem registro OPT

foreach ($Answer->Answers as $Record) {
   $Record->name;   // 'example.com'
   $Record->type;   // DNS::TYPE_A
   $Record->TTL;    // 300
   $Record->data;   // '93.184.215.14'
}
```

O formato do `data` de cada `Record` depende do tipo:

| Tipo | `data` |
|---|---|
| A, AAAA (classe IN) | o endereço: `'93.184.215.14'`, `'2001:db8::1'` |
| CNAME, NS, PTR | um nome: `'alias.example.com'` |
| TXT | as character-strings, em ordem: `['v=spf1 -all']` |
| MX | `['preference' => 10, 'exchange' => 'mail.example.com']` |
| SRV (classe IN) | `['priority' => 10, 'weight' => 5, 'port' => 5060, 'target' => 'sip.example.com']` |
| CAA | `['flags' => 0, 'tag' => 'issue', 'value' => 'ca.example.net']` |
| SOA | `['mname' => ..., 'rname' => ..., 'serial' => ..., 'refresh' => ..., 'retry' => ..., 'expire' => ..., 'minimum' => ...]` |
| qualquer outro tipo | os bytes raw do RDATA (RFC 3597) |

`encode()` aceita os mesmos formatos, então uma mensagem decodificada pode ser codificada de novo.

A resposta negativa de uma consulta fica no cabeçalho e na seção de autoridade. NXDOMAIN quer dizer
que o nome não existe. NOERROR sem respostas (NODATA) quer dizer que o nome existe, mas não tem
registro do tipo pedido. Nos dois casos, a seção de autoridade costuma trazer o SOA da zona, e o
`minimum` desse SOA limita por quanto tempo a resposta negativa pode ficar em cache (RFC 2308).

## Tratar uma resposta truncada

Quando uma resposta não cabe, o servidor liga o TC e a corta. `decode()` lê só as perguntas de uma
mensagem com TC. As seções ficam vazias e nada depois das perguntas é lido. Pergunte de novo por
TCP:

```php
use Bootgly\ABI\Data\DNS;
use Bootgly\ABI\Data\DNS\Message;

$Answer = DNS::decode($datagram);

if ($Answer instanceof Message && $Answer->truncated) {
   // $Answer->Answers === []: refaça a mesma consulta por TCP
}
```

O registro OPT de uma resposta truncada também não é lido: `size` fica `null` e `rcode` traz só os 4
bits do cabeçalho. Nunca guarde em cache uma resposta truncada, e nunca faça retry por TCP de uma
resposta TCP com TC ligado.

## O que `decode()` recusa

Cada caso abaixo faz `decode()` devolver o seu case de `Faults` no lugar de uma `Message`:

- menos que os 12 bytes do cabeçalho (`Short`), ou uma leitura além do fim (`Overrun`);
- contagens de seção que os bytes restantes não comportam (`Count`). A verificação vem antes de
  qualquer registro ser lido, então uma mensagem de 12 bytes que declara 65.535 respostas não custa
  nada. Uma consulta padrão (opcode 0) com mais de uma pergunta também é recusada aqui (RFC 9619);
- um label com mais de 63 bytes ou de tipo reservado (`Label`), e um nome com mais de 255 bytes no
  wire (`Name`). O limite de 255 bytes vale também para um nome montado através de ponteiros de
  compressão;
- um ponteiro de compressão na própria posição ou depois dela (`Forward`), de volta para o nome que
  está sendo lido ou seguido mais de 128 vezes (`Loop`), ou para dentro do cabeçalho de 12 bytes
  (`Pointer`). Ponteiros só podem apontar para trás, então toda cadeia termina;
- RDATA que não bate exatamente com o seu tipo (`Data`): um registro A de 5 bytes, um MX cujo nome
  termina antes do RDATA, uma string de TXT que passa do RDATA, uma tag de CAA que não tem de 1 a 15
  letras e dígitos;
- um registro OPT fora da seção adicional, que não pertence à raiz ou que aparece duas vezes
  (`EDNS`);
- bytes sobrando depois da última seção (`Trailing`);
- nomes que somam mais de 1 MiB de texto (`Size`, `Name::BUDGET`). A compressão permite que 64 KiB
  nomeiem milhões de caracteres; uma resposta real fica muito abaixo desse limite, que comporta cerca
  de 2.000 registros cujo dono e cujo dado são, cada um, um nome de 253 caracteres (e menos quando os
  nomes são escapados). Uma mensagem acima dele é recusada inteira, então `Size` numa resposta bem
  formada indica uma resposta desse tamanho, não uma malformada.

```php
DNS::decode("\x00\x01");                                     // Faults::Short
DNS::decode(hex2bin('1a2b81800001000000000000c00000010001')); // Faults::Pointer
```

Uma mensagem de 64 KiB montada para custar o máximo possível na leitura é decodificada em
milissegundos. Depois que um ponteiro chega a um byte de um nome, esse byte é lido uma vez por
mensagem, não importa quantos ponteiros cheguem nele, então ponteiros não multiplicam o trabalho.
Quando uma mensagem quebra dois limites ao mesmo tempo, não é especificado qual dos cases de
`Faults` volta.

## Nomes

Nomes usam a forma de apresentação: labels unidos por `.`, sem o ponto final. A raiz é `''`. `Name`
converte um nome entre essa forma e a forma de wire:

```php
use Bootgly\ABI\Data\DNS\Name;

bin2hex(Name::encode('example.com'));  // '076578616d706c6503636f6d00'
Name::encode('example.com.');          // os mesmos bytes: um ponto final é descartado
Name::encode(str_repeat('a', 64));     // Faults::Label: um label tem no máximo 63 bytes
```

Um label pode ter qualquer byte. Quando um label tem um `.`, uma `\` ou um byte fora de `!`–`~`, a
forma de apresentação escapa esse byte (`\.`, `\\`, `\DDD` em decimal). Assim, um nome lido do wire
nunca é lido como outro nome:

```php
$offset = 0;
Name::decode("\x03a.b\x07example\x00", $offset); // 'a\.b.example': um label 'a.b', depois 'example'
$offset;                                          // 13: logo depois do nome
```

As maiúsculas e minúsculas ficam como foram enviadas, então compare nomes de um jeito que as ignore,
como `strcasecmp()` (RFC 4343). `DNS::encode()` comprime nomes diferenciando maiúsculas de
minúsculas, então uma consulta com caixa aleatória (codificação 0x20) mantém as letras exatas.

## Referência

### DNS

```php
public static function encode (Message $Message): string|Faults
```

Escreve uma mensagem em bytes. Os nomes das perguntas e dos donos, e os nomes dentro do RDATA de
NS, CNAME, PTR, MX e SOA, são comprimidos (RFC 1035 §4.1.4). Um target de SRV e os outros RDATA
nunca são comprimidos. Um registro OPT é acrescentado quando `size` está definido. Devolve
`Faults::Field` para um campo fora da sua faixa (um id fora de 0–65535, um rcode acima de 15 sem
`size`, um `size` fora de 512–65535, mais de uma pergunta numa consulta padrão), `Faults::Data`
para RDATA no formato errado, `Faults::EDNS` para um registro OPT listado numa seção,
`Faults::Label` ou `Faults::Name` para um nome que
`Name::encode()` recusa, e `Faults::Size` para uma mensagem com mais de 65.535 bytes.

```php
public static function decode (string $bytes): Message|Faults
```

Lê uma mensagem inteira (sem o prefixo de tamanho do TCP). Devolve a `Message`, ou o case de
`Faults` que diz por que ela foi recusada. Uma mensagem recusada não rende mais nada. Uma mensagem
com TC é lida só pelas perguntas, sem o seu registro OPT. O RDATA de A, AAAA e SRV só é
interpretado na classe IN. Um TTL com o bit mais alto ligado é lido como 0 (RFC 2181 §8). Nomes que
somam mais de `Name::BUDGET` caracteres são recusados como `Faults::Size`.

### Name

```php
public static function encode (string $name): string|Faults
```

Escreve um nome na forma de wire plana, sem compressão. `''` e `'.'` são a raiz. Devolve
`Faults::Label` para um label interno vazio ou com mais de 63 bytes, e `Faults::Name` para um escape
malformado ou um nome com mais de 255 bytes no wire.

```php
public static function decode (string $bytes, int &$offset, array &$suffixes = []): string|Faults
```

Lê um nome em `$offset` e segue os ponteiros de compressão. Em caso de sucesso, `$offset` avança
para depois dos bytes do nome naquele lugar. Em caso de falha, fica como estava; um `$offset`
negativo é `Faults::Overrun`. `$suffixes` é o memo da mensagem: passe o mesmo array, vazio no
início, para todos os nomes de uma mensagem (nunca entre mensagens). Depois de um ponteiro, cada
posição é lida uma vez por mensagem; os nomes lidos com um memo somam no máximo `Name::BUDGET`
(1.048.576) caracteres, e o nome que passaria disso é `Faults::Size`. As entradas dele são
internas.

### Message

```php
public function __construct (int $id = 0, bool $response = false, int $opcode = 0, bool $authoritative = false, bool $truncated = false, bool $recursion = false, bool $recursive = false, bool $authentic = false, bool $unchecked = false, int $rcode = 0, null|int $size = null, array $Questions = [], array $Answers = [], array $Authorities = [], array $Additionals = [])
```

Uma mensagem: as flags do cabeçalho são QR (`response`), AA (`authoritative`), TC (`truncated`),
RD (`recursion`), RA (`recursive`), AD (`authentic`) e CD (`unchecked`). `rcode` (0–4095) inclui os
bits estendidos do registro OPT. `size` é o tamanho de payload UDP do EDNS(0), ou `null` sem
registro OPT. Um tamanho decodificado abaixo de 512 é lido como 512. Uma mensagem com TC
decodificada tem `size` `null` e só os 4 bits de rcode do cabeçalho. `Additionals` nunca lista o
registro OPT.

### Question

```php
public function __construct (string $name, int $type, int $class = 1)
```

Uma pergunta: um nome, um tipo (`DNS::TYPE_*`) e uma classe (`DNS::CLASS_IN` por default).

### Record

```php
public function __construct (string $name, int $type, int $TTL, string|array $data, int $class = 1)
```

Um registro de recurso. O formato do seu `data` depende do tipo (veja a tabela acima).

### Faults

```php
enum Faults
```

Por que uma mensagem foi recusada: `Short`, `Overrun`, `Count`, `Label`, `Name`, `Loop`, `Forward`,
`Pointer`, `Data`, `EDNS`, `Trailing`, `Size` (de `decode()`), mais `Field` (de `encode()`, que
também devolve `Data`, `EDNS`, `Label`, `Name` e `Size`).

### Constantes

Em `DNS`: `PORT` (53), `SIZE` (512); tipos de registro `TYPE_A`, `TYPE_NS`, `TYPE_CNAME`,
`TYPE_SOA`, `TYPE_PTR`, `TYPE_MX`, `TYPE_TXT`, `TYPE_AAAA`, `TYPE_SRV`, `TYPE_OPT`, `TYPE_CAA`;
classes `CLASS_IN`, `CLASS_NONE`, `CLASS_ANY`; `OPCODE_QUERY`; códigos de resposta `RCODE_NOERROR`,
`RCODE_FORMERR`, `RCODE_SERVFAIL`, `RCODE_NXDOMAIN`, `RCODE_NOTIMP`, `RCODE_REFUSED`,
`RCODE_BADVERS`.
