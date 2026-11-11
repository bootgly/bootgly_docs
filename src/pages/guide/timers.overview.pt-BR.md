# Timers de Intervalo

O Bootgly tem dois timers de intervalo. O `Bootgly\ACI\Events\Timer`, visto primeiro, é a
roda de timers nativa e sem dependências, em segundos inteiros, que funciona em qualquer
processo. Dentro de um worker de servidor, a event loop também executa
[timers recorrentes](#timers-recorrentes-na-event-loop) em frações de segundo.

Os callbacks do `Timer` são locais ao processo e cooperativos: a event loop despacha `tick()`,
portanto código bloqueante da aplicação pode atrasar um callback.

```php
use Bootgly\ACI\Events\Timer;
use Bootgly\ACI\Events\Timer\Registry;

$id = Timer::add(
   interval: 5,
   handler: static function (): void {
      // trabalho periódico
   },
);

if ($id !== false && Registry::check($id)) {
   Timer::del($id);
}
```

`add()` retorna um identificador inteiro vivo para todo intervalo positivo ou `false` quando
o intervalo não é positivo. Timers persistentes são rearmados após cada callback; passe
`persistent: false` para um timer one-shot.

Cada timer vencido roda no máximo uma vez por `tick()`, e um timer adicionado ou rearmado durante
um tick só roda num tick seguinte. Quando um callback lança uma exceção, a roda continua: a falha
é reportada por `Throwables::notify()` — todo reporter registrado em `Throwables::$reporters` a
recebe com o contexto `['origin' => 'timer', 'id' => $id]`, uma vez por instância de Throwable (um
callback que lança de novo a mesma instância guardada só é reportado na primeira vez) —, um timer
persistente mantém seu agendamento e um timer one-shot é liberado. Os valores que um callback
deixa para trás (suas capturas, seus argumentos, a própria falha) também são liberados de forma
contida, então um destrutor que lança — mesmo um cuja exceção lança no próprio destrutor — nunca
escapa para o handler de sinal do worker. Só uma cadeia de falhas de destrutores com mais de 64
gerações é cortada: sua última falha fica estacionada pelo resto do processo em vez de liberada —
o PHP a destrói no encerramento, onde um destrutor que lança transforma o status de saída em 255.

`Timer\Registry::check(int $id): bool` informa se aquele identificador ainda está vivo. O resultado passa a
`false` após remoção específica, remoção global ou conclusão do callback one-shot. Use-o
quando um owner precisar se recuperar depois que outro componente limpar intencionalmente
a roda de timers do processo. `Timer\Registry::snapshot(): array<int>` retorna a lista pontual de
todos os identificadores vivos sem expor callbacks ou argumentos. Os identificadores retornados
podem ficar obsoletos imediatamente; valide-os novamente com `check()` antes de usá-los.

`del(int $id = 0): bool` remove um identificador. Chamar `del()` sem identificador limpa
todos os timers do processo e então notifica observers registrados em `Timer\Reset`. Owners
do framework cuja limpeza limitada ainda esteja pendente podem, portanto, restaurar um
supervisor essencial antes de `del()` retornar; owners comuns ainda devem validar o timer ao
receber novo trabalho. Antes de liberar callbacks e argumentos destacados, a roda confirma a
remoção e contém falhas geradas pelos destructors desses valores. As remoções compartilham uma
fila FIFO local ao processo: um destructor que pede outra remoção específica ou global apenas confirma
e enfileira aquela geração, sem recursão. Um toque externo do Timer libera no máximo 256 gerações
destacadas e então executa a notificação de reset coalescida; qualquer restante limitado avança
em um `add()`, `tick()` ou `del()` posterior. Isso mantém o recovery dos owners alcançável
sem uma pilha de remoções controlada pelo atacante. A remoção também é uma barreira dentro do
`tick()`: um timer que um callback anterior do mesmo tick removeu — pelo identificador ou limpando
a roda — nunca roda naquele tick.

`Timer\Reset::add(Closure $Observer): int` e `del(int $id): void` gerenciam essa notificação
local ao processo. `notify()` é a operação de despacho usada pela roda; código da aplicação
não deve chamá-la como substituto de `Timer::del()`. Cada passagem percorre um snapshot LIFO
estável e rotativo, isolando falhas dos observers e da liberação de valores capturados. Resets aninhados são
coalescidos em outra passagem; somente o observer que causou um reset aninhado é omitido das
passagens posteriores desse despacho. Os demais observers comuns rodam novamente. Mutações do
registro não alteram o snapshot ativo e ficam visíveis para uma passagem coalescida posterior.
Uma notificação externa tem orçamento global finito de callbacks, então um observer que registra
sucessores continuamente não consegue impedir o retorno de `Timer::del()`. A próxima notificação
externa retoma depois do último observer que consumiu orçamento, então observers antigos não
permanecem famintos por novos registros.

Os supervisores de cleanup do Bootgly usam um tier de recovery separado e selado após o dispatch
comum. Ele congela as identidades iniciais, contém falhas, suprime o callback que causar outro
reset completo e permite no máximo oito execuções de callbacks de recovery. O `add()` comum não
consegue reivindicar esse tier, e o `del(int $id)` público não remove suas identidades internas;
o componente owner as desregistra quando o estado protegido fica vazio. Isso permite recuperar
um supervisor obrigatório depois do último reset comum ou aninhado limitado sem transformar a
API pública de observers em um caminho prioritário sem bound. Os IDs dos observers são positivos
e não são reutilizados enquanto o observer estiver vivo ou representado no snapshot do despacho.

## Timers recorrentes na event loop

Dentro de um worker de servidor, a própria event loop pode executar um callback em um intervalo
fixo — em frações de segundo, no relógio monotônico, sem nenhum sinal envolvido. A loop oferece
isso como uma capacidade opcional, `Bootgly\ACI\Events\Repeating`, então verifique antes de
usar:

```php
use Bootgly\ACI\Events\Repeating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;

$Loop = HTTP_Server_CLI::$Event;

if ($Loop instanceof Repeating) {
   $id = $Loop->repeat(0.25, static function (): void {
      // a cada 250 ms, na event loop deste worker
   });

   // depois — pare o timer
   $Loop->cancel($id);
}
```

A loop nativa (`Bootgly\WPI\Events\Select`) implementa `Repeating`. Registre a partir de
código que roda no worker — um handler de rota, por exemplo — porque cada worker tem a sua
própria loop. O objeto da loop já existe no processo master, onde ela nunca roda: um timer
registrado ali, em código de boot, não faz nada no master e é copiado para cada worker criado
depois, onde cada worker roda a sua própria cópia.

**A agenda é uma grade fixa.** A execução `k` vence em `registro + k × intervalo`: nem o tempo
que o callback leva nem a latência da loop se acumulam como drift. Quando a loop chega atrasada
a uma execução — um handler bloqueante a segurou por um segundo — o callback roda **uma vez**, os
pontos da grade que passaram nesse meio-tempo são pulados, e a próxima execução é o primeiro
ponto da grade depois dela. Um timer atrasado nunca dispara uma rajada.

**Cancelamento.** O identificador vem da mesma sequência do `defer()` de disparo único e é
parado com o mesmo `cancel()`, que responde `true` uma única vez. Um callback pode cancelar a si
mesmo ou qualquer outro timer; um callback recorrente cancelado antes na mesma passada não roda
nessa passada, e um registrado dentro de um callback roda pela primeira vez em uma passada
posterior.

**Falhas.** Um callback que lança não para a loop nem a sua própria agenda: a falha é reportada
via `Throwables::notify()` com o contexto `['origin' => 'loop.repeat', 'id' => $id]`, e o
callback roda de novo no próximo período.

**Intervalos.** Um intervalo zero, negativo, `NAN` ou infinito é recusado com uma
`InvalidArgumentException`, assim como um maior que `Select::HORIZON`. Um intervalo menor que
`Select::RESOLUTION` (um milissegundo) é elevado até ele, de modo que nenhum intervalo
transforma a loop em um busy loop.

Os callbacks rodam na loop, entre dois despachos de I/O: mantenha-os curtos. Eles são locais ao
processo — um timer registrado em um worker não existe em outro. Uma passada da loop custa os
timers que venceram, não os que estão esperando, então milhares de timers com vencimentos
diferentes não são problema; o que eles custam são os seus callbacks.

A mesma loop também executa os handlers de sinal do worker — inclusive o `SIGALRM`, que move o
`Timer` estático — entre callbacks. Para executar o seu próprio handler quando um sinal chegar,
veja [Select](/manual/WPI/Events/Select/overview/).

### Quando o `Timer` ainda se aplica

- **Fora da loop de um worker** — o processo master nunca roda a sua loop, e um comando ou um
  script não tem nenhuma: use o `Timer`.
- **Em uma loop sem a capacidade** — uma loop customizada que implementa apenas `Scheduler`
  continua funcionando; `instanceof Repeating` é `false` nela, e o `Timer` é o fallback.
- **Segundos inteiros bastam e o código já o usa** — o `Timer` mantém a sua API.

## Referência

### `Repeating`

```php
public function repeat (float $interval, Closure $Callback): int
```

Registra `$Callback` para rodar a cada `$interval` segundos no relógio monotônico e retorna o
seu identificador. Lança `InvalidArgumentException` para um intervalo zero, negativo, não
numérico, infinito ou maior que o horizonte da loop.

```php
public function cancel (int $ID): bool
```

Herdado de `Bootgly\ACI\Events\Scheduler`: para um timer recorrente (ou cancela um `defer()`
de disparo único antes de ele disparar). Retorna `false` para um identificador desconhecido ou
já parado.

### `Select`

```php
public const float RESOLUTION = 0.001;
```

Menor intervalo recorrente, em segundos; o `repeat()` eleva um intervalo menor até ele.

```php
public const float HORIZON = 1_000_000_000.0;
```

Maior intervalo recorrente, em segundos (cerca de 31 anos); o `repeat()` recusa um maior.

### `Timer`

```php
public static function init (callable $handler): bool
```

Instala o handler de `SIGALRM` do processo.

```php
public static function add (
   int $interval,
   callable $handler,
   array $args = [],
   bool $persistent = true
): int|false
```

Agenda um callback ou retorna `false` para um intervalo não positivo.

```php
public static function tick (): void
```

Despacha cada callback vencido uma vez — nunca um que um callback anterior do tick removeu — e
rearma os persistentes. A falha de um callback é reportada por `Throwables::notify()` com
`['origin' => 'timer', 'id' => $id]` (uma vez por instância de Throwable), e todo valor que um
callback deixa para trás é liberado de forma contida.

```php
public static function del (int $id = 0): bool
```

Remove um timer ou todos quando `id` é zero.

### `Timer\Registry`

```php
public static function check (int $id): bool
```

Verifica se um identificador está vivo.

```php
public static function snapshot (): array
```

Captura os identificadores de todos os timers vivos.

### `Timer\Reset`

```php
public static function add (Closure $Observer): int
```

Registra um observer de reset global.

```php
public static function del (int $id): void
```

Remove um observer público de reset global.

```php
public static function notify (): void
```

Despacha o snapshot de reset usado internamente por `Timer`.
