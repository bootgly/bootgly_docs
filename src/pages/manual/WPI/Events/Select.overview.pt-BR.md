# Select

`Select` é o event loop que todo worker de servidor executa: ele espera pelos sockets do worker,
retoma suas Fibers e executa seus timers. Desde a v1.3.0 ele também é o dono dos **sinais** do
worker: um handler que você registra no loop roda no loop, entre dois callbacks, quando o
processo recebe o sinal.

Esta página cobre essa capacidade. Para os timers do loop, veja o
[guia de Timers](/guide/timers/overview/).

## Execute um handler quando um sinal chegar

O loop oferece sinais como uma capacidade opcional, `Bootgly\ACI\Events\Signalling`, então
verifique-a antes de usar. Registre a partir de código que roda no worker — um handler de rota,
por exemplo — porque cada worker é um processo com o seu próprio loop:

```php
use Bootgly\ACI\Events\Signalling;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;

$Loop = HTTP_Server_CLI::$Event;

if ($Loop instanceof Signalling) {
   $Loop->trap(SIGRTMIN, static function (int $signal): void {
      // roda no event loop deste worker cada vez que o worker recebe o sinal
   });
}
```

Envie o sinal para o PID do worker para executá-lo:

```bash
kill -s RTMIN <pid do worker>
```

O handler recebe o número do sinal, então uma mesma closure pode atender vários sinais.

Sinais de tempo real (`SIGRTMIN` a `SIGRTMAX`) existem só no Linux. Em outro sistema, escolha
um sinal que o servidor não usa — veja a tabela abaixo.

**Quando ele roda.** Os sinais são despachados no início de cada passada do loop, e de novo
logo após uma espera que um sinal interrompeu — sempre entre callbacks, nunca no meio de um
handler de rota, de um callback de timer ou de uma escrita. Um sinal que chega enquanto um
callback roda espera pela próxima passada; um que chega enquanto o loop está esperando o
acorda. O que o handler fizer com o loop — armar um timer, registrar ou
liberar um sinal, parar o loop — vale já naquela mesma passada.

**Um handler por sinal.** Registrar um sinal que o loop já detém substitui o handler:

```php
$Loop->trap(SIGRTMIN, $First);
$Loop->trap(SIGRTMIN, $Second); // $First não roda mais
```

Mantenha os handlers curtos: eles rodam no loop, então toda conexão do worker espera por eles.

## Pare de tratar um sinal

`untrap()` libera o sinal e responde se o loop o detinha:

```php
$Loop->untrap(SIGRTMIN); // true
$Loop->untrap(SIGRTMIN); // false — já liberado
```

O processo volta a fazer com o sinal o que fazia antes de o loop registrá-lo: o handler que
estava instalado então, ou a ação padrão do sinal. Um sinal ainda pendente quando você o libera
chega ao handler que recebe o sinal de volta; quando o que volta é a ação padrão, o sinal
pendente é descartado — ele não encerra o processo.

O PHP não consegue distinguir um sinal que o processo herdou como ignorado — um que o processo
pai ignorou antes de iniciá-lo — de um com a sua ação padrão. Liberado, esse sinal toma a ação
padrão; ignore-o de novo você mesmo (`pcntl_signal($signal, SIG_IGN)`) quando isso importar.

## Sinais que o servidor já usa

Um worker começa entregando os sinais do seu servidor ao seu loop, então eles seguem a mesma
regra dos seus: despachados entre callbacks, no loop.

| Sinal | O que o servidor faz com ele |
|---|---|
| `SIGALRM` | Executa a roda de timers estática do `Timer` |
| `SIGHUP`, `SIGINT`, `SIGTERM` | Parada |
| `SIGQUIT` | Parada graciosa de um worker baseado em TCP: ele termina antes as conexões em andamento (um worker UDP para) |
| `SIGTSTP` / `SIGCONT` | Pausa / retomada |
| `SIGUSR2` | Reload |
| `SIGUSR1` | Comando customizado |
| `SIGCHLD` | Recuperação de workers |
| `SIGIOT`, `SIGIO` | Informações / estatísticas de conexões |
| `SIGURG` | Despertar fora de banda (servidores baseados em TCP) |

Registrar um deles substitui o tratamento do próprio servidor naquele worker — um worker cujo
`SIGTERM` você registrou não para mais com `SIGTERM` — e `untrap()` devolve o sinal ao servidor.
Escolha um sinal que o servidor não usa, como um de tempo real (`SIGRTMIN` a `SIGRTMAX`), a
menos que substituir seja o que você quer.

`SIGPIPE` é ignorado pelo processo inteiro e não é tratado no loop.

## Quando um handler lança

Um handler que lança não para o loop, e não esconde os outros sinais pendentes na mesma passada
— cada um ainda chega ao seu handler. A falha é reportada por `Throwables::notify()`: todo
reporter registrado em `Throwables::$reporters` a recebe com o contexto
`['origin' => 'loop.signal', 'signal' => $signal]`.

Só o servidor HTTP registra um reporter por conta própria — ele grava a falha no seu log
`exceptions`. Em um servidor TCP, WebSocket ou UDP, ou em um loop que você mesmo executa, nada
registra a falha até você registrar um reporter:

```php
use Bootgly\ABI\Debugging\Data\Throwables;

Throwables::$reporters[] = static function (Throwable $Throwable, array $context): void {
   $origin = $context['origin'] ?? 'unknown';

   error_log("{$origin}: {$Throwable->getMessage()}");
};
```

Registre-o antes de o servidor iniciar, para que todo worker o herde.

## Sinais que são recusados

`trap()` recusa, com uma `InvalidArgumentException`, um sinal que nenhum processo pode capturar
(`SIGKILL`, `SIGSTOP`) e um número que não é um sinal.

Sinais pertencem ao processo, não a um loop, então só um loop de um processo detém um dado sinal
por vez: registrar um sinal que outro loop do mesmo processo detém lança uma `LogicException`
até que aquele loop o libere.

`trap()` também lança uma `LogicException` quando o handler instalado para o sinal é um que o
loop não conseguiria devolver no `untrap()` — um método privado que só a própria classe pode
chamar. Nada muda nesse caso: o handler continua instalado.

## Forks e `destroy()`

Um handler registrado antes de um fork é copiado para o filho junto com o loop, como os timers
— o filho trata o sinal desde a sua primeira passada, sem janela em que o sinal tomaria a sua
ação padrão.

O objeto do loop já existe no processo master, onde ele nunca roda. Um handler registrado ali,
em código de boot, é copiado para todo worker criado depois — e também roda no master, sempre
que o master despacha os sinais que recebeu. Isso vale para um sinal que o servidor não usa:
para um dos seus, o servidor instala os próprios handlers ao iniciar e cada worker os assume,
então um handler registrado em código de boot não roda em lugar nenhum. Registre no worker
quando o handler for só para os workers, ou substituir o do servidor.

`destroy()` libera todo sinal que o loop detém, como descarta os seus timers. Um loop executado
de novo depois disso começa sem handler: registre de novo.

## Um loop sem a capacidade

`Signalling` é opcional, e o contrato do loop em si (`Bootgly\ACI\Events\Loops`) não tem método
de sinal. Um servidor iniciado sobre um loop customizado que não a implementa funciona como
antes: o seu worker mantém os handlers que o servidor instalou antes do fork, e eles rodam onde
esse loop chamar `pcntl_signal_dispatch()`.

## Referência

`Bootgly\WPI\Events\Select` implementa `Bootgly\ACI\Events\Signalling`.

```php
public function trap (int $signal, Closure $Handler): void
```

Executa `$Handler` no loop cada vez que o processo recebe `$signal`. O handler recebe o número
do sinal e roda entre callbacks, fora de qualquer Fiber. Registrar um sinal que este loop já
detém substitui o handler. Lança `InvalidArgumentException` quando o sinal não pode ser
capturado (`SIGKILL`, `SIGSTOP`) ou não é um número de sinal, e `LogicException` quando outro
loop do processo detém o sinal ou o handler instalado para ele não poderia ser devolvido.

```php
public function untrap (int $signal): bool
```

Libera `$signal` e restaura o que o processo fazia com ele antes de este loop registrá-lo.
Retorna se este loop detinha o sinal.
