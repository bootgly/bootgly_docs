# Resolver

`Resolver` transforma um nome de host nos seus endereços IP usando o próprio resolvedor do
sistema — a mesma consulta que o PHP faz quando conecta a um nome. Ele é síncrono: a chamada
bloqueia até o sistema responder. As conexões síncronas do Bootgly que precisam conferir para onde
vão antes de conectar — o cliente ACME do Auto TLS e a busca remota de JWKS da autenticação JWT —
resolvem por ele.

Ele só resolve. Decidir se um endereço pode ser usado (loopback, faixas privadas ou reservadas)
continua sendo responsabilidade de quem chama.

## Resolver um host

```php
use Bootgly\ABI\IO\Resolver;

$Resolver = new Resolver;

$Resolver->resolve('localhost');        // ['::1', '127.0.0.1'] on a typical Linux host
$Resolver->resolve('::ffff:127.0.0.1'); // ['127.0.0.1']
$Resolver->resolve('2001:DB8:0:0::1');  // ['2001:db8::1']
```

Os endereços voltam na forma canônica, na ordem em que o resolvedor do sistema os entregou, cada
um uma vez só. Um IP literal não precisa de consulta: ele volta na forma canônica, e um endereço
IPv6 mapeado de IPv4 (`::ffff:a.b.c.d`) volta como o endereço IPv4 que carrega. Passe um literal
IPv6 sem os colchetes.

Um nome com ponto final (`api.example.com.`) é absoluto: os domínios de busca do sistema não são
acrescentados a ele.

## Diferenciar "sem resposta" de "resposta inválida"

`resolve()` tem dois resultados de falha, e eles significam coisas diferentes:

```php
$addresses = $Resolver->resolve($host);

if ($addresses === null) {
   // An answer was not an IP address: the lookup itself is not trustworthy
}
else if ($addresses === []) {
   // Nothing resolved: the name does not exist, or the resolver did not answer
}
```

- `[]` — nada foi resolvido. Um host que nenhum resolvedor deveria receber resolve para `[]` sem
  consulta: um nome vazio, um nome com mais de 253 caracteres, ou um que contenha um byte NUL,
  `%`, `[` ou `]`. O mesmo vale para `invalid` ou qualquer nome `*.invalid`, que nunca resolve
  (RFC 6761) — nem pelo arquivo hosts.
- `null` — a consulta é inválida: uma das respostas não é um endereço IP. Nenhuma das outras
  respostas é devolvida.

## Sem ext-sockets

Com a ext-sockets carregada, um nome vai para o `getaddrinfo()` (`socket_addrinfo_lookup()`), e a
resposta dele é final — uma consulta que falha não é refeita de outro jeito. Sem a ext-sockets, o
`Resolver` consulta:

1. as respostas IPv4 do sistema (`gethostbynamel()`, incluindo o arquivo hosts), e depois
2. os registros DNS AAAA do nome (`dns_get_record()`), pedidos para o nome absoluto — nunca para
   `localhost` ou um nome `*.localhost`, que ficam locais. Um nome `local` ou `*.local` também não
   é pedido quando o `/etc/nsswitch.conf` lista uma fonte de DNS multicast (`mdns*`, ou `resolve`)
   antes de `dns`: ele pertence ao DNS multicast, não aos nameservers unicast (RFC 6762). Sem essa
   fonte, é um nome DNS comum e os registros AAAA dele são pedidos.

## Conectar ao que você resolveu

Quando você confere os endereços antes de conectar, conecte ao próprio endereço conferido — nunca
ao nome de novo, senão uma segunda resposta de DNS pode mandar a conexão para outro lugar — e
mantenha o nome para o header HTTP `Host` e para o nome do peer no TLS:

```php
$addresses = $Resolver->resolve('api.example.com');
if ($addresses === null || $addresses === []) {
   throw new RuntimeException('api.example.com could not be resolved.');
}

$IP = $addresses[0];
$literal = str_contains($IP, ':') ? "[{$IP}]" : $IP;

$Context = stream_context_create([
   'ssl' => ['peer_name' => 'api.example.com'],
]);
$Socket = stream_socket_client("tls://{$literal}:443", $code, $message, 5, STREAM_CLIENT_CONNECT, $Context);
```

## Responder a partir de um teste

Cada fonte do resolvedor pode ser trocada por uma closure no lugar da função PHP que ela nomeia,
então um teste modela respostas de DNS sem rede:

```php
$Resolver = new Resolver(
   Lookup: false, // no getaddrinfo(): resolve as without ext-sockets
   List: static fn (string $host): array => ['192.0.2.10'],
   Query: static fn (string $name): array => [['type' => 'AAAA', 'ipv6' => '2001:db8::10']],
);

$Resolver->resolve('api.example.test'); // ['192.0.2.10', '2001:db8::10']
```

`Query` recebe o nome absoluto (`api.example.test.`). Uma closure em `Lookup` fica no lugar do
`getaddrinfo()` e devolve as respostas no formato do `socket_addrinfo_explain()`:

```php
$Resolver = new Resolver(
   Lookup: static fn (string $host): array => [
      ['ai_addr' => ['sin6_addr' => '2001:db8::10']],
      ['ai_addr' => ['sin_addr' => '192.0.2.10']],
   ],
);
```

## Referência

```php
public function __construct (false|null|Closure $Lookup = null, null|Closure $List = null, null|Closure $Query = null, null|string $nsswitch = '/etc/nsswitch.conf')
```

Cria um resolvedor do resolvedor do sistema. Cada argumento troca uma fonte, e `null` mantém a
real: `$Lookup` fica no lugar do `getaddrinfo()` — `fn (string $host): false|array` de arrays do
`socket_addrinfo_explain()` — e `false` resolve como sem a ext-sockets; `$List` no lugar do
`gethostbynamel()` — `fn (string $host): false|array` de strings IPv4; `$Query` no lugar do
`dns_get_record($name, DNS_AAAA)` — `fn (string $name): false|array` de registros. Com `$Lookup`
`null`, o `getaddrinfo()` real é usado quando a ext-sockets está carregada, e o caminho sem ela
nos outros casos. `$nsswitch` é o `nsswitch.conf` que o caminho sem ext-sockets lê para saber se
uma fonte de DNS multicast responde nomes `*.local`; `null` não lê nenhum (são nomes DNS comuns).

```php
public function resolve (string $host): null|array
```

Resolve `$host` — um nome, ou um IP literal (IPv6 sem colchetes) — para os seus endereços IP
canônicos, bloqueando até o sistema responder. Um IP literal volta na forma canônica sem consulta.
Devolve os endereços na ordem do resolvedor, cada um uma vez só; `[]` quando nada resolve (ou o
host é vazio, tem mais de 253 caracteres, contém um byte NUL, `%`, `[` ou `]`, ou é `invalid` ou
um nome `*.invalid`, recusado sem consulta); `null` quando uma resposta não é um endereço IP.

```php
public static function normalize (string $IP): null|string
```

Devolve a forma canônica de um IP literal — um IPv4 em quatro octetos, ou a forma IPv6 mais
curta, com um endereço IPv6 mapeado de IPv4 transformado no seu endereço IPv4 — ou `null` quando
`$IP` não é um IP literal (um nome, colchetes, uma zona, uma forma numérica antiga como
`010.1.1.1`, um byte NUL).
