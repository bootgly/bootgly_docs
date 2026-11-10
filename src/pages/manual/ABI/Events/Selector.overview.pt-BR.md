# Selector

O `Selector` avisa quando um stream pode ser lido ou escrito sem bloquear. Você entrega a ele os
streams que interessam e espera — até um ficar pronto, até um deadline ou até chegar um sinal. É
a primitiva de prontidão por baixo dos loops bloqueantes: um leitor de pipe, um cliente esperando
a resposta, uma ferramenta acompanhando vários sockets ao mesmo tempo.

Ele só informa a prontidão. Ler, escrever, timers e Fibers continuam com o seu código.

## Esperando um stream

Observe o stream e espere. O `wait()` retorna quantos streams estão prontos e preenche
`$Selector->readable`:

```php
use Bootgly\ABI\Events\Selector;

$Selector = new Selector;
$Selector->watch($socket);

$Selector->wait(); // bloqueia até $socket ter algo para ler

foreach ($Selector->readable as $id => $stream) {
   $data = fread($stream, 8192);
}
```

Um stream está pronto para leitura quando chegaram dados, quando o outro lado fechou a ponta
dele (a leitura então retorna uma string vazia) ou, em um socket de escuta, quando há uma conexão
esperando para ser aceita.

A prontidão é level-triggered: um stream que você não esvaziou volta a ser reportado pelo próximo
`wait()`.

## Esperando até um deadline

Passe um deadline para desistir depois de um tempo. O deadline é um instante **absoluto** no
relógio monotônico — `$Selector->Clock->tick`, em nanossegundos —, não uma duração:

```php
$deadline = $Selector->Clock->tick + 5 * 1_000_000_000; // daqui a 5 s

$ready = $Selector->wait($deadline);

if ($ready === 0) {
   // nada chegou em 5 s
}
```

Como o deadline é absoluto, um loop que espera várias vezes mantém um único orçamento de tempo
para a troca inteira, em vez de reiniciar o relógio a cada chamada:

```php
$deadline = $Selector->Clock->tick + 5 * 1_000_000_000;
$reply = '';

while (str_ends_with($reply, "\r\n") === false) {
   if ($Selector->wait($deadline) === 0 && $Selector->interrupted === false) {
      throw new RuntimeException('No complete reply in 5 s.');
   }

   foreach ($Selector->readable as $stream) {
      $chunk = fread($stream, 8192);

      if ($chunk === '' || $chunk === false) {
         throw new RuntimeException('The peer closed before the reply was complete.');
      }

      $reply .= $chunk;
   }
}
```

Uma espera que estoura o tempo nunca retorna antes do deadline, então esperar de novo depois de
um timeout não tem como girar em falso. Com a prontidão é diferente: um stream cujo outro lado
fechou fica legível para sempre. Por isso trate sempre a leitura vazia — como acima —, senão o
loop rodaria sem nunca esperar.

## Consultando sem esperar

Com um deadline que não está no futuro, o `wait()` responde na hora com o que está pronto
naquele momento. `0` está sempre no passado:

```php
if ($Selector->wait(0) > 0) {
   // algo está pronto
}
```

## Observando vários streams, cada um com seu payload

Passe um payload ao `watch()` — o objeto da conexão, um rótulo, um callback — e os conjuntos de
prontos trazem o payload no lugar do stream. As chaves dos conjuntos são os ids dos streams
(`(int) $stream`):

```php
foreach ($Connections as $Connection) {
   $Selector->watch($Connection->socket, payload: $Connection);
}

while ($Selector->reads !== []) {
   $Selector->wait();

   foreach ($Selector->readable as $id => $Connection) {
      if ($Connection->receive() === false) {
         $Selector->forget($Connection->socket);
         fclose($Connection->socket);
      }
   }
}
```

Observar de novo um stream para o mesmo interesse substitui o payload. `$Selector->reads` e
`$Selector->writes` listam o que está sendo observado, por id.

## Esperando até poder escrever

Por padrão, um stream é observado para leitura. Peça o interesse de escrita quando uma escrita
não bloqueante não conseguiu enviar tudo — e remova-o assim que o buffer esvaziar, senão o
`wait()` vai continuar reportando o stream:

```php
use Bootgly\ABI\Events\Selector\Interests;

$Selector->watch($socket, Interests::Write);

while ($pending !== '') {
   $Selector->wait();

   foreach ($Selector->writable as $stream) {
      $written = fwrite($stream, $pending);

      if ($written === false) {
         throw new RuntimeException('The peer is gone.');
      }

      $pending = substr($pending, $written);
   }
}

$Selector->forget($socket, Interests::Write);
```

Um stream pode ser observado para os dois interesses, cada um com o seu payload: chame o
`watch()` uma vez por interesse. Nesse caso ele conta uma vez por interesse pronto no número que
o `wait()` retorna.

## Sinais

Um sinal que chega durante a espera encerra a espera antes da hora: o `wait()` retorna `0` e
marca `$Selector->interrupted`. Despache os sinais pendentes e espere de novo com o **mesmo**
deadline — a espera continua de onde parou, sem ganhar tempo extra:

```php
$deadline = $Selector->Clock->tick + 30 * 1_000_000_000;

do {
   pcntl_signal_dispatch();

   $ready = $Selector->wait($deadline);
} while ($ready === 0 && $Selector->interrupted);
```

As três respostas do `wait()` se distinguem assim:

| `wait()` retorna | `$interrupted` | Significado |
|---|---|---|
| `> 0` | — | essa quantidade de entradas prontas em `$readable` + `$writable` |
| `0` | `true` | um sinal chegou antes |
| `0` | `false` | o deadline passou |

Com sinais assíncronos (`pcntl_async_signals(true)`) o handler roda durante a própria espera.
Uma exceção lançada por ele não é capturada pelo Selector: ela chega ao código que chamou o
`wait()`.

## Parando de observar

O `forget()` remove um stream — um interesse, ou os dois quando você não informa nenhum. Remova o
stream **antes** de fechá-lo:

```php
$Selector->forget($socket);                    // os dois interesses
$Selector->forget($socket, Interests::Write);  // só a escrita

fclose($socket);
```

Um stream fechado enquanto ainda era observado não pode mais ser esperado. O Selector não trava
nem gira em falso por causa dele: o próximo `wait()` descarta o stream e lança um `Refusal`
dizendo qual foi (veja abaixo). Um stream já fechado ainda pode ser passado ao `forget()`.

## Recusas

Quando o Selector não consegue atender um stream ou uma espera, ele lança
`Bootgly\ABI\Events\Selector\Refusal` e diz o motivo em `$Refusal->Reason`:

| Motivo | Lançado por | O que aconteceu |
|---|---|---|
| `Reasons::Invalid` | `watch()` | o valor não é um stream aberto (fechado, outro tipo de resource, não é um resource) |
| `Reasons::Unselectable` | `watch()` | o stream não tem um descritor que o sistema consiga esperar (`php://memory`) |
| `Reasons::Overflow` | `watch()` | o descritor do stream está além do que o `select()` aceita — veja Limites, abaixo |
| `Reasons::Closed` | `wait()` | streams observados foram fechados sem `forget()`; eles foram descartados |
| `Reasons::Empty` | `wait()` | nada é observado e não há deadline: a espera nunca retornaria |
| `Reasons::Failure` | os dois | o sistema recusou a chamada por outro motivo (está na mensagem) |

O stream é verificado uma vez, quando começa a ser observado. Por isso um stream que não pode ser
esperado é recusado no `watch()` e nunca surpreende um `wait()`.

Depois de uma recusa `Reasons::Closed` o Selector volta a funcionar: os streams fechados já
saíram e `$Refusal->streams` lista os ids deles, para você liberar o que guardava para cada um.

```php
use Bootgly\ABI\Events\Selector\Reasons;
use Bootgly\ABI\Events\Selector\Refusal;

try {
   $Selector->wait($deadline);
}
catch (Refusal $Refusal) {
   if ($Refusal->Reason !== Reasons::Closed) {
      throw $Refusal;
   }

   foreach ($Refusal->streams as $id) {
      unset($Connections[$id]);
   }
}
```

## Dormindo até um deadline

Sem nada observado, `wait($deadline)` é uma pausa simples que um sinal pode interromper — útil em
um loop cujos streams entram e saem:

```php
$Selector = new Selector;

$Selector->wait($Selector->Clock->tick + 250_000_000); // 250 ms
```

## Limites

- **Um backend só: `select()`.** Um stream é recusado (`Reasons::Overflow`) quando o número do
  descritor dele é igual ou maior que `FD_SETSIZE` — 1024 em um build padrão do PHP. O limite
  vale para o **número** do descritor, não para quantos streams o Selector observa: um processo
  que já mantém mil arquivos abertos esbarra nele logo no primeiro socket.
- **Os conjuntos de prontos são uma foto** do último `wait()`. Eles são refeitos pelo próximo; o
  `forget()` não mexe neles.
- **Dados em buffer contam como legíveis.** Se o PHP já guarda bytes não lidos de um stream no
  buffer dele, o `wait()` reporta o stream na hora — e essa resposta lista **só** os streams com
  dados em buffer: `$writable` volta vazio mesmo que algum stream pudesse ser escrito. Leia o que
  está legível e espere de novo.
- **Não é um reactor.** Não tem callbacks, timers nem Fibers: o event loop do servidor HTTP é o
  `Bootgly\WPI\Events\Select`.

## Testando com um relógio fake

O Selector mede o tempo que falta no `Clock` que recebeu, então um teste decide que horas são:

```php
use Bootgly\ABI\Events\Selector;
use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock;
$Selector = new Selector($Clock);
$Selector->watch($socket);

$deadline = $Clock->tick + 60 * 1_000_000_000; // um minuto a partir do agora fake
$Clock->advance(61);

$Selector->wait($deadline); // 0 na hora — o deadline ficou para trás do relógio
```

A espera em si continua acontecendo no sistema: com o relógio fake **antes** do deadline, o
`wait()` bloqueia de verdade pelo tempo que falta. Veja [Clock](/manual/ABI/Clock/overview/).

## No framework

O `Bootgly\ABI\IO\IPC\Pipe::reading()` espera em um Selector: cada espera dura o timeout
informado, os sinais pendentes são despachados entre uma espera e outra, e um sinal que
interrompe a espera faz ela continuar sem estender o timeout. Um timeout não encerra o loop —
ele entrega `null` e espera de novo —, então quem consome sai com `break` quando já esperou o
bastante.

## Referência

```php
public function __construct (null|Clock $Clock = null)
```

Cria um Selector que não observa nada. Os deadlines são medidos em `$Clock` (o `Clock` do sistema
quando null).

```php
public function watch (mixed $Stream, Interests $Interest = Interests::Read, mixed $payload = null): void
```

Observa `$Stream` (um resource de stream aberto, com descritor) para um interesse. `$payload` é o
que os conjuntos de prontos trazem para ele — por padrão, o próprio stream. Observar de novo para
o mesmo interesse substitui o payload. Lança `Refusal` com `Reasons::Invalid`,
`Reasons::Unselectable`, `Reasons::Overflow` ou `Reasons::Failure`.

```php
public function forget (mixed $Stream, null|Interests $Interest = null): bool
```

Para de observar `$Stream` para `$Interest`, ou para os dois interesses quando null. Aceita um
stream que já foi fechado. Retorna se o stream era observado para aquele interesse.

```php
public function wait (null|int $deadline = null): int
```

Espera até um stream observado ficar pronto, `$deadline` passar ou um sinal chegar; preenche
`$readable`, `$writable` e `$interrupted` e retorna a quantidade de entradas prontas. `$deadline`
é um instante monotônico em nanossegundos (`$Selector->Clock->tick`): null espera
indefinidamente, um instante que não está no futuro só consulta. Lança `Refusal` com
`Reasons::Closed`, `Reasons::Empty` ou `Reasons::Failure`.

```php
public private(set) Clock $Clock
```

O relógio em que os deadlines são medidos.

```php
public private(set) array $reads
```

Os streams observados para leitura, por id (`(int) $stream`).

```php
public private(set) array $writes
```

Os streams observados para escrita, por id.

```php
public private(set) array $readable
```

Os payloads dos streams que o último `wait()` encontrou prontos para leitura, por id do stream.

```php
public private(set) array $writable
```

Os payloads dos streams que o último `wait()` encontrou prontos para escrita, por id do stream.

```php
public private(set) bool $interrupted
```

Se um sinal encerrou o último `wait()` antes da hora.

```php
enum Interests { case Read; case Write; }
```

`Bootgly\ABI\Events\Selector\Interests` — para que um stream é observado.

```php
enum Reasons { case Invalid; case Unselectable; case Overflow; case Closed; case Empty; case Failure; }
```

`Bootgly\ABI\Events\Selector\Reasons` — por que o Selector recusou; veja Recusas, acima.

```php
public private(set) Reasons $Reason
```

Em `Bootgly\ABI\Events\Selector\Refusal` (uma `RuntimeException`): por que o Selector recusou.

```php
public private(set) array $streams
```

Em `Refusal`: os ids dos streams a que a recusa se refere — o stream recusado de um `watch()`, os
streams que um `wait()` descartou. Vazio quando nenhum stream está envolvido.
