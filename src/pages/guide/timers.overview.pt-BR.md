# Timers de Intervalo

`Bootgly\ACI\Events\Timer` é a roda de timers por intervalo, nativa e sem dependências,
usada pelos workers do Bootgly. Os timers são locais ao processo e cooperativos: a event
loop despacha `tick()`, portanto código bloqueante da aplicação pode atrasar um callback.

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
sem uma pilha de remoções controlada pelo atacante. A remoção não é uma barreira
para o snapshot vencido já em execução:
um callback destacado naquele snapshot ainda pode rodar uma vez depois, no mesmo `tick()`.

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

## Referência

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

Despacha callbacks vencidos e rearma os persistentes.

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
