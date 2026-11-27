# DNS Client CLI

`DNS_Client_CLI` resolve nomes de host e pede registros ao DNS sem parar um worker do servidor.
Dentro de um worker, uma busca feita a partir de trabalho adiado (`defer()`) estaciona no event loop
do worker enquanto a consulta está em voo: o worker continua respondendo outras requisições. Em
qualquer outro lugar — um comando, um script, um teste — a mesma chamada simplesmente bloqueia até
ter uma resposta.

Ele lê as configurações do sistema do jeito que o `getaddrinfo()` da glibc lê: `/etc/resolv.conf`,
`/etc/hosts`, `/etc/nsswitch.conf` e as variáveis de ambiente `LOCALDOMAIN` / `RES_OPTIONS`.

## Resolver um host

```php
use Bootgly\WPI\Nodes\DNS_Client_CLI;

$DNS = new DNS_Client_CLI;

$DNS->resolve('api.example.com'); // ex.: ['2001:db8::10', '192.0.2.10']
$DNS->resolve('[2001:db8::1]');   // ['2001:db8::1']
$DNS->resolve('no.such.name');    // []
```

`resolve()` retorna os endereços canônicos que um discador deve tentar, em ordem: endereços de uma
família que a máquina alcança (ela tem um endereço de origem global dessa família) vêm primeiro,
IPv6 antes de IPv4; endereços de loopback são sempre alcançáveis. Voltam no máximo 32 endereços de
cada família. Uma lista vazia significa que o nome não resolveu. Um literal IP — IPv6 puro ou entre
colchetes — volta canônico, sem busca.

Fora de um worker, `resolve()` pergunta ao resolvedor do sistema (`getaddrinfo()`), então a
resposta é a mesma que qualquer outro programa da máquina receberia.

## Resolver a partir de um handler de requisição

Passe a ponte de espera da resposta de dentro do `defer()`: a busca estaciona em vez de bloquear o
worker.

```php
use Bootgly\WPI\Nodes\DNS_Client_CLI;

$Router->route('/weather', function (Request $Request, Response $Response) {
   return $Response->defer(function (Response $Response) {
      $DNS = new DNS_Client_CLI;
      $addresses = $DNS->resolve('api.weather.example', fn ($value = null) => $Response->wait($value));

      $Response->JSON->send(['address' => $addresses[0] ?? null]);
   });
}, GET);
```

Enquanto a consulta está em voo, o worker atende outras conexões. Buscas do mesmo nome feitas ao
mesmo tempo compartilham uma consulta: dez requisições pedindo `api.weather.example` enviam uma
pergunta A e uma AAAA, e as dez acordam com a resposta.

Num worker, o nome é perguntado direto ao DNS — A e AAAA de uma vez — seguindo a lista de busca do
jeito que o `res_search()` da glibc faz. Um nome que não resolve pelo DNS não é perguntado de novo
ao resolvedor do sistema: essa chamada bloquearia o worker.

Você raramente chama `resolve()` para discar: [`HTTP_Client_CLI`](/manual/WPI/HTTP/HTTP_Client_CLI/#discando-um-nome),
`WS_Client_CLI` e os response resources construídos sobre eles resolvem o seu host por ele, e a
discagem deles estaciona do mesmo jeito.

Criar uma instância por requisição não custa nada. Toda instância de um processo compartilha um
estado por configuração — o cache, as consultas em voo, a tabela do hosts, as configurações — e um
processo forkado começa com o seu próprio.

## O que resolve sem consulta

Antes de qualquer consulta, `resolve()` responde a partir de:

1. **Literais IP** — retornados canônicos.
2. **`invalid` e `*.invalid`** — nada: esses nomes nunca resolvem, nem pelo arquivo hosts.
3. **O arquivo hosts** — quando `files` está listado no `nsswitch.conf` (está, por padrão). Um nome
   do `/etc/hosts` nunca chega ao DNS.
4. **`localhost` e `*.localhost`** — `::1` e `127.0.0.1`.

Alguns nomes pertencem ao resolvedor do sistema mesmo num worker, então são perguntados lá
(bloqueando):

- nomes `*.local`, quando uma fonte mDNS (`mdns*`, ou `resolve`) vem antes de `dns` no
  `nsswitch.conf`; senão, são nomes DNS comuns.
- O próprio nome da máquina, `_gateway` e `_outbound`, quando `myhostname` (ou `resolve`) vem antes
  de `dns`.
- Formas numéricas de host como `127.1` ou `0x7f.1`.

Essas respostas são guardadas por 5 segundos.

Três comportamentos diferem do `getaddrinfo()` do glibc, que as discagens dos clientes usavam antes de
resolver por este node:

- o arquivo hosts responde primeiro sempre que `files` está listado, mesmo depois de `dns`
  (`hosts: dns files`);
- um arquivo hosts maior que 1 MiB é ignorado, então um lookup que faz park pergunta seus nomes
  ao DNS;
- `::1` é sempre classificado como alcançável, então `localhost` o coloca primeiro mesmo onde o IPv6
  está desligado — a discagem então chega a `127.0.0.1` no endereço seguinte.

## A lista de busca

Um nome com menos pontos que `ndots` (1 por padrão) é tentado primeiro com cada domínio de busca,
depois como está; um nome com pelo menos `ndots` pontos é tentado primeiro como está. Um nome
terminado em ponto é absoluto: só esse nome é perguntado.

O avanço pela lista de busca segue a glibc:

- uma resposta encerra a busca;
- "nome inexistente", "sem dados desse tipo" e uma falha do servidor (`SERVFAIL`) tentam o próximo
  domínio;
- um timeout, uma recusa ou qualquer outro erro param a lista, e o nome ainda é perguntado como
  está;
- quando nenhum nameserver escuta, a busca termina na hora.

## Pedir outros registros

`query()` pede ao DNS um tipo de registro num nome absoluto — sem lista de busca, sem arquivo hosts,
sem resolvedor do sistema. `invalid` e `*.invalid` são `Absent` sem consulta; `local` e `*.local`
são `Failed` sem consulta quando uma fonte mDNS vem antes de `dns` no `nsswitch.conf` (aí eles nunca
são perguntados ao DNS unicast):

```php
use Bootgly\ABI\Data\DNS;
use Bootgly\WPI\Nodes\DNS_Client_CLI;
use Bootgly\WPI\Nodes\DNS_Client_CLI\Answer\Outcomes;

$DNS = new DNS_Client_CLI;
$Answer = $DNS->query('example.com', DNS::TYPE_MX);

if ($Answer->Outcome === Outcomes::Answered) {
   foreach ($Answer->Records as $Record) {
      echo "{$Record->data['exchange']} ({$Record->data['preference']})\n";
   }
}
```

O `Answer` traz:

- `Outcome` — `Answered` (vieram registros), `Absent` (o nome não existe), `Empty` (o nome existe
  sem registros desse tipo) ou `Failed` (nenhuma resposta usável: timeouts, falhas do servidor, uma
  cadeia de CNAME quebrada);
- `name` — o nome canônico, no fim de qualquer cadeia de CNAME;
- `Records` — os registros do tipo pedido, como `Bootgly\ABI\Data\DNS\Message\Record` (cópias:
  alterar um nunca altera a resposta guardada);
- `TTL` — segundos que a resposta continua válida.

`query()` aceita a mesma ponte de espera que `resolve()`.

## Respostas em que dá para confiar

Toda resposta é conferida antes de ser usada: ela precisa trazer o id de uma pergunta em voo,
responder exatamente aquela pergunta (nome, tipo e classe) e caber no tamanho que a consulta
anunciou. Qualquer outra coisa é descartada, e a consulta continua esperando a resposta verdadeira.

Uma resposta truncada é perguntada de novo por TCP, uma vez, ao mesmo nameserver; ela mesma nunca é
usada. Uma cadeia de CNAME é seguida por até 8 saltos; um laço, ou dois CNAMEs num mesmo nome, faz a
resposta falhar. O alvo de uma cadeia é sempre um nome DNS, mesmo quando parece um endereço.

## O cache

Respostas ficam guardadas pelo seu TTL, entre 5 segundos e 1 hora. Um nome ou dado ausente fica
guardado pelo TTL negativo da zona, entre 5 e 60 segundos (5 quando a resposta não traz nenhum).
Uma busca que estourou o tempo ou foi recusada fica guardada 5 segundos, para que um nameserver
morto não seja perguntado de novo a cada requisição; uma falha do servidor (`SERVFAIL`) não fica.

Quando uma busca falha — nova, ou guardada como falha nos últimos 5 segundos — uma resposta
expirada dos últimos 5 minutos é retornada no lugar, com TTL 0. Cada worker guarda no máximo 1024
respostas e cerca de 4 MiB, compartilhados por todas as configurações (cada uma só vê as próprias
respostas); uma resposta maior que 8 KiB é retornada, mas nunca guardada.

## Limites

- Cada tentativa espera `timeout` segundos; cada nameserver recebe `attempts` tentativas. A busca
  inteira termina em até `timeout × (attempts × nameservers + 1)`.
- No máximo 64 consultas ficam em voo num worker, somadas todas as configurações; além disso, uma
  busca no worker fica sem resolução na hora, e nada é cacheado.
- Uma ponte de espera que não suspende (que retorna na hora) é percebida após alguns despertares, e
  a busca termina sem resolução em vez de girar em falso.
- Um nome é recusado sem busca quando é vazio, tem mais de 253 caracteres, contém um byte NUL, `%`
  ou um colchete solto, ou tem um rótulo vazio ou com mais de 63 caracteres.

## Configurar

Sem `configure()`, valem os arquivos do sistema. Um valor dado em `Configs` vence o do sistema:

```php
use Bootgly\WPI\Nodes\DNS_Client_CLI;
use Bootgly\WPI\Nodes\DNS_Client_CLI\Configs;

$DNS = new DNS_Client_CLI;
$DNS->configure(new Configs(
   nameservers: ['192.0.2.53', '2001:db8::53'],
   search: ['corp.example'],
   timeout: 2,
   attempts: 2,
   hosts: null, // sem arquivo hosts
));
```

Do `resolv.conf` e do `RES_OPTIONS`, o resolvedor respeita `nameserver` (até 3), `domain`, `search`
e as opções `ndots`, `timeout`, `attempts`, `rotate` e `edns0`. `LOCALDOMAIN` substitui a lista de
busca. Um domínio de busca que não é um nome de domínio (um rótulo vazio, um com mais de 63
caracteres, um caractere fora de letras, dígitos, `-` e `_`) é ignorado. As opções `use-vc`, `no-aaaa`, `single-request` e `sortlist`, e a variável `HOSTALIASES`,
são ignoradas.

As buscas compartilham o estado por configuração: valores iguais, e seams que fazem a mesma coisa. Uma
closure `Probe` (ou cada fonte de um `Resolver`) conta pelo seu código — onde está escrita, o `$this`
a que está ligada (ou a classe em que foi chamada, para `static::`) e os valores que captura —, então uma `Configs` montada de novo a cada requisição
com um seam da mesma linha compartilha o estado da anterior. Escalares e arrays capturados contam
pelo valor; objetos capturados, pela identidade. Um seam cujo comportamento o código não determina
conta pelo objeto, então um novo por requisição é um estado novo por requisição: um que captura por
referência (`use (&$x)`) ou guarda uma variável `static`, um escrito em código de `eval()` ou num
arquivo alterado no segundo em que o processo começou ou depois, um que começa na mesma linha que outra closure, ou um
que captura um array de mais de 64 elementos.

## Referência

```php
public function configure (Configuring ...$Configs): self
```

Aplica uma `DNS_Client_CLI\Configs` (`Configuring` é a interface `Bootgly\ABI\Configs`). Retorna o nó.

```php
public function resolve (string $host, null|Closure $Wait = null, null|int $deadline = null, null|(Events & Loops & Scheduler) $Reactor = null): array
```

Resolve `$host` — um nome (um ponto final pula a lista de busca) ou um literal IP (IPv6 puro ou
entre colchetes) — para os endereços canônicos que um discador deve tentar, em ordem, no máximo 32
por família. Com `$Wait` — a ponte de espera de quem chama, `fn ($value = null) =>
$Response->wait($value)` — dentro de uma Fiber num worker do servidor, a busca estaciona em vez de
bloquear. `$deadline` (monotônico, nanossegundos de `hrtime(true)`) encerra a busca sem resolver
quando passa, mesmo antes do timeout do próprio resolvedor; um deadline já vencido não pergunta
nada. `$Reactor` é o loop em que quem chama roda: quem chama de outro loop que não o do worker vai
ao resolvedor do sistema em vez de estacionar num driver que ninguém rodaria. Fora de um worker, um
nome não resolvido é perguntado de novo na próxima chamada. Retorna `[]` quando o nome não resolve
ou é recusado. Esta é a forma do seam de discagem `TCP_Client_CLI::$Resolution`, que os clientes
HTTP e WebSocket definem como este método.

```php
public function query (string $name, int $type, null|Closure $Wait = null): Answer
```

Pede ao DNS os registros do tipo `$type` (`DNS::TYPE_MX`, `DNS::TYPE_TXT`, …) no nome absoluto
`$name` (o ponto final é opcional). Respostas frescas vêm do cache; uma busca que falha (ou uma
falha guardada) retorna uma resposta expirada dos últimos 5 minutos quando houver. `invalid` e
`*.invalid` são `Absent`, e `*.local` com uma fonte mDNS configurada é `Failed`, sem consulta. `$Wait` como em `resolve()`. Retorna um
`Answer`; um nome recusado ou um tipo fora de `1`–`65535` é `Failed` na hora.

```php
public null|(Events & Loops & Scheduler) $Reactor
```

O event loop do worker em que as buscas estacionam; `null` fora de um worker do servidor. Somente
leitura.

```php
new Configs(
   null|array $nameservers = null,
   int $port = 53,
   null|array $search = null,
   null|int $ndots = null,
   null|int|float $timeout = null,
   null|int $attempts = null,
   null|bool $rotate = null,
   null|bool $EDNS = null,
   null|string $resolv = '/etc/resolv.conf',
   null|string $hosts = '/etc/hosts',
   null|string $nsswitch = '/etc/nsswitch.conf',
   null|array $environment = null,
   null|string $hostname = null,
   null|Resolver $Resolver = null,
   null|Closure $Probe = null
)
```

Somente argumentos nomeados. `null` usa o valor do sistema. `nameservers`: 1 a 3 literais IP (um
IPv6 link-local pode trazer um zone id). `search`: até 6 nomes de domínio (rótulos de 1 a 63 caracteres, no máximo 253 caracteres, um ponto final opcional); `.` sozinho (a raiz) não busca nada. `ndots`: 0–15. `timeout`:
segundos por tentativa, acima de 0 e no máximo 30. `attempts`: 1–5. `rotate`: começa cada consulta
no próximo nameserver. `EDNS`: anuncia EDNS(0) com payload de 1232 bytes. `resolv`, `hosts`,
`nsswitch`: os arquivos a ler, `null` para nenhum (`nsswitch` `null` significa `files dns`).
`environment`: os valores de `LOCALDOMAIN` / `RES_OPTIONS`, `null` para o ambiente do processo.
`hostname`: o nome da máquina, `null` para `gethostname()`. `Resolver`: o resolvedor do sistema
usado onde a busca bloqueia (um `ABI\IO\Resolver`). `Probe`: `fn (int $family): null|string`, que
retorna o endereço de origem local para um destino global da família `4` ou `6`, `null` quando não
há. Lança `InvalidArgumentException` com um valor fora da faixa.
