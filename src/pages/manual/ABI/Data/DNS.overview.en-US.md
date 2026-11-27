# DNS

`DNS` is Bootgly's DNS message codec (RFC 1035 §4): it writes a `Message` to bytes and reads bytes
back into a `Message`. It only transforms bytes. It opens no socket, keeps no state and caches
nothing, so the transport belongs to the caller. Over UDP a datagram is one message. Over TCP each
message follows a 2-byte length (RFC 1035 §4.2.2), and you strip that length before `decode()`.

`decode()` reads bytes that came from the network, which means anyone may have forged them. It
never throws on bad input. Instead it returns a `Faults` case that says why it refused the bytes,
and it never returns half a message.

## Write a query

A `Message` is plain data. Give the constructor the fields you need by name. Every other field
keeps its default (id 0, no flags, rcode 0, no EDNS(0), empty sections):

```php
use Bootgly\ABI\Data\DNS;
use Bootgly\ABI\Data\DNS\Message;
use Bootgly\ABI\Data\DNS\Message\Question;

$Query = new Message(
   id: 0x1A2B,          // pick a random id per query
   recursion: true,     // RD: ask the server to resolve the name all the way
   size: 1232,          // EDNS(0): the UDP payload size this side accepts
   Questions: [new Question('example.com', DNS::TYPE_A)]
);

$bytes = DNS::encode($Query); // 40 bytes, ready for a datagram to port DNS::PORT (53)
```

`size` adds an EDNS(0) OPT record (RFC 6891) with version 0, the DO bit clear and no options.
Leave it `null` for a classic message of at most `DNS::SIZE` (512) bytes.

## Read an answer

`decode()` returns a `Message` or a `Faults` case. Check which one you got before anything else:

```php
use Bootgly\ABI\Data\DNS;
use Bootgly\ABI\Data\DNS\Faults;

$Answer = DNS::decode($datagram);

if ($Answer instanceof Faults) {
   // refused: $Answer->name says why ('Short', 'Loop', 'Count', ...)
   return;
}

$Answer->response;  // true
$Answer->rcode;     // DNS::RCODE_NOERROR (0), DNS::RCODE_NXDOMAIN (3), ...
$Answer->size;      // 1232: the server's EDNS(0) size, null without an OPT record

foreach ($Answer->Answers as $Record) {
   $Record->name;   // 'example.com'
   $Record->type;   // DNS::TYPE_A
   $Record->TTL;    // 300
   $Record->data;   // '93.184.215.14'
}
```

Each `Record`'s `data` is shaped by its type:

| Type | `data` |
|---|---|
| A, AAAA (class IN) | the address: `'93.184.215.14'`, `'2001:db8::1'` |
| CNAME, NS, PTR | a name: `'alias.example.com'` |
| TXT | the character-strings in order: `['v=spf1 -all']` |
| MX | `['preference' => 10, 'exchange' => 'mail.example.com']` |
| SRV (class IN) | `['priority' => 10, 'weight' => 5, 'port' => 5060, 'target' => 'sip.example.com']` |
| CAA | `['flags' => 0, 'tag' => 'issue', 'value' => 'ca.example.net']` |
| SOA | `['mname' => ..., 'rname' => ..., 'serial' => ..., 'refresh' => ..., 'retry' => ..., 'expire' => ..., 'minimum' => ...]` |
| any other type | the raw RDATA bytes (RFC 3597) |

`encode()` takes the same shapes, so a decoded message encodes again.

The negative answer to a lookup sits in the header and the authority section. NXDOMAIN means the
name does not exist. NOERROR with no answers (NODATA) means the name exists but has no record of
the type asked. Either way, the authority section usually holds the zone's SOA, and that SOA's
`minimum` caps how long the negative answer may be cached (RFC 2308).

## Handle a truncated answer

When an answer does not fit, the server sets TC and cuts it. `decode()` reads only the questions of
a TC message. Its sections stay empty and nothing after the questions is read. Ask again over TCP:

```php
use Bootgly\ABI\Data\DNS;
use Bootgly\ABI\Data\DNS\Message;

$Answer = DNS::decode($datagram);

if ($Answer instanceof Message && $Answer->truncated) {
   // $Answer->Answers === []: retry the same query over TCP
}
```

The OPT record of a truncated answer is not read either: `size` is `null` and `rcode` holds only the
header's 4 bits. Never cache a truncated answer, and never retry a TCP answer with TC set over TCP
again.

## What `decode()` refuses

Each case below makes `decode()` return its `Faults` case instead of a `Message`:

- fewer than the 12 header bytes (`Short`), or a read past the end (`Overrun`);
- section counts that the remaining bytes cannot hold (`Count`). This is checked before any record
  is read, so a 12-byte message that claims 65,535 answers costs nothing. A standard query
  (opcode 0) with more than one question is also refused here (RFC 9619);
- a label over 63 bytes or a reserved label type (`Label`), and a name over 255 wire bytes
  (`Name`). The 255-byte limit also covers a name built across compression pointers;
- a compression pointer at or after itself (`Forward`), back into the name being read, or followed
  more than 128 times (`Loop`), or into the 12-byte header (`Pointer`). Pointers may only go
  backwards, so every chain ends;
- RDATA that does not match its type exactly (`Data`): an A record of 5 bytes, an MX whose name
  ends before its RDATA does, a TXT string that runs past its RDATA, a CAA tag that is not 1 to 15
  letters and digits;
- an OPT record that is not in the additional section, that is not owned by the root, or that
  appears twice (`EDNS`);
- bytes left after the last section (`Trailing`);
- names that add up to more than 1 MiB of text (`Size`, `Name::BUDGET`). Compression lets 64 KiB
  name millions of characters; a real answer stays far below the budget, which holds about 2,000
  records whose owner and data are each a 253-character name (and fewer when the names are
  escaped). A message over it is refused whole, so `Size` on a well-formed answer means one that
  big, not a malformed one.

```php
DNS::decode("\x00\x01");                                     // Faults::Short
DNS::decode(hex2bin('1a2b81800001000000000000c00000010001')); // Faults::Pointer
```

A message of 64 KiB built to cost as much as possible to read decodes in milliseconds. Once a
pointer reaches a byte of a name, that byte is read once per message, however many pointers reach
it, so pointers cannot multiply the work. When a message breaks two bounds at once, which of their
`Faults` cases comes back is not specified.

## Names

Names use presentation form: labels joined by `.`, without the trailing dot. The root is `''`.
`Name` converts one name between that form and its wire form:

```php
use Bootgly\ABI\Data\DNS\Name;

bin2hex(Name::encode('example.com'));  // '076578616d706c6503636f6d00'
Name::encode('example.com.');          // the same bytes: one trailing dot is dropped
Name::encode(str_repeat('a', 64));     // Faults::Label: a label holds at most 63 bytes
```

A label may hold any byte. When a label holds a `.`, a `\` or a byte outside `!`–`~`, the
presentation form escapes it (`\.`, `\\`, `\DDD` in decimal). That way a name read from the wire
never reads as a different name:

```php
$offset = 0;
Name::decode("\x03a.b\x07example\x00", $offset); // 'a\.b.example': one label 'a.b', then 'example'
$offset;                                          // 13: just past the name
```

Case is kept as sent, so compare names in a way that ignores it, such as `strcasecmp()` (RFC 4343).
`DNS::encode()` compresses names case-sensitively, which means a query with a randomized case
(0x20 encoding) keeps its exact letters.

## Reference

### DNS

```php
public static function encode (Message $Message): string|Faults
```

Writes a message to bytes. Question and owner names, and the names inside NS, CNAME, PTR, MX and
SOA RDATA, are compressed (RFC 1035 §4.1.4). An SRV target and other RDATA are never compressed.
An OPT record is appended when `size` is set. Returns `Faults::Field` for a field out of its range
(an id outside 0–65535, an rcode above 15 without `size`, a `size` outside 512–65535, more than one
question in a standard query), `Faults::Data` for RDATA of the wrong shape, `Faults::EDNS` for an
OPT record listed in a section, `Faults::Label` or `Faults::Name` for a name `Name::encode()`
refuses, and `Faults::Size` for a message over 65,535 bytes.

```php
public static function decode (string $bytes): Message|Faults
```

Reads one whole message (without a TCP length prefix). Returns the `Message`, or the `Faults` case
that says why it was refused. A refused message yields nothing else. A TC message is read for its
questions only, without its OPT record. RDATA of A, AAAA and SRV is read only for class IN. A TTL
with its top bit set reads as 0 (RFC 2181 §8). Names that add up to more than `Name::BUDGET`
characters are refused as `Faults::Size`.

### Name

```php
public static function encode (string $name): string|Faults
```

Writes one name to its flat wire form, without compression. `''` and `'.'` are the root. Returns
`Faults::Label` for an empty inner label or one over 63 bytes, and `Faults::Name` for a malformed
escape or a name over 255 wire bytes.

```php
public static function decode (string $bytes, int &$offset, array &$suffixes = []): string|Faults
```

Reads one name at `$offset` and follows compression pointers. On success, `$offset` moves past the
name's bytes at that place. On a fault it is left as it was; a negative `$offset` is
`Faults::Overrun`. `$suffixes` is the message's memo: pass the same array, empty at first, for every
name of one message (never across messages). After a pointer, each position is read once per
message; the names read with one memo add up to `Name::BUDGET` (1,048,576) characters at most, and
the name that would pass it is `Faults::Size`. Its entries
are internal.

### Message

```php
public function __construct (int $id = 0, bool $response = false, int $opcode = 0, bool $authoritative = false, bool $truncated = false, bool $recursion = false, bool $recursive = false, bool $authentic = false, bool $unchecked = false, int $rcode = 0, null|int $size = null, array $Questions = [], array $Answers = [], array $Authorities = [], array $Additionals = [])
```

One message: the header flags are QR (`response`), AA (`authoritative`), TC (`truncated`),
RD (`recursion`), RA (`recursive`), AD (`authentic`) and CD (`unchecked`). `rcode` (0–4095)
includes the extended bits of the OPT record. `size` is the EDNS(0) UDP payload size, or `null`
for no OPT record. A decoded size below 512 reads as 512. A decoded TC message has `size` `null`
and the header's 4 rcode bits only. `Additionals` never lists the OPT record.

### Question

```php
public function __construct (string $name, int $type, int $class = 1)
```

One question: a name, a type (`DNS::TYPE_*`) and a class (`DNS::CLASS_IN` by default).

### Record

```php
public function __construct (string $name, int $type, int $TTL, string|array $data, int $class = 1)
```

One resource record. Its `data` shape depends on the type (see the table above).

### Faults

```php
enum Faults
```

Why a message was refused: `Short`, `Overrun`, `Count`, `Label`, `Name`, `Loop`, `Forward`,
`Pointer`, `Data`, `EDNS`, `Trailing`, `Size` (from `decode()`), plus `Field` (from `encode()`,
which also returns `Data`, `EDNS`, `Label`, `Name` and `Size`).

### Constants

On `DNS`: `PORT` (53), `SIZE` (512); record types `TYPE_A`, `TYPE_NS`, `TYPE_CNAME`,
`TYPE_SOA`, `TYPE_PTR`, `TYPE_MX`, `TYPE_TXT`, `TYPE_AAAA`, `TYPE_SRV`, `TYPE_OPT`, `TYPE_CAA`;
classes `CLASS_IN`, `CLASS_NONE`, `CLASS_ANY`; `OPCODE_QUERY`; response codes `RCODE_NOERROR`,
`RCODE_FORMERR`, `RCODE_SERVFAIL`, `RCODE_NXDOMAIN`, `RCODE_NOTIMP`, `RCODE_REFUSED`,
`RCODE_BADVERS`.
