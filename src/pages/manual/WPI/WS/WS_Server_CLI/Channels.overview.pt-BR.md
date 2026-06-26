# Channels

Channels são salas nomeadas. Adicione sessões a um channel e espalhe uma mensagem para todos os
membros com uma chamada — o frame é construído **uma vez** e escrito em cada membro (codifica-uma-
vez, entrega-a-muitos).

> [!NOTE]
> Cada worker `SO_REUSEPORT` tem seu próprio registro de channels, mas o `broadcast()` republica o
> frame para os workers vizinhos por um relay de datagramas por worker, então um broadcast alcança
> todo membro do channel em todos os workers — sem precisar de `workers: 1` ou load balancer sticky.

## Entrar, broadcast, sair

Entre no connect, faça broadcast na mensagem, e deixe o disconnect limpar a participação
automaticamente:

```php
use Bootgly\WPI\Nodes\WS_Server_CLI\Events;

$WS
   ->on(Events::Connected, function ($Session) {
      $Session->join('lobby');
   })
   ->on(Events::MessageReceived, function ($Session, $Message) {
      // repassa para todos os outros do lobby; ecoa de volta para o remetente
      $Session->broadcast('lobby', $Message->payload);

      return "você disse: {$Message->payload}";
   })
   ->on(Events::Disconnected, function ($Session) {
      // a participação é liberada automaticamente; nenhum leave() manual é preciso
   });
```

`broadcast()` exclui o remetente por padrão — passe `self: true` para incluí-lo. Um channel é criado
no primeiro `join()` e descartado automaticamente quando seu último membro sai. Para mover um
cliente entre salas, chame `leave()` e depois `join()`:

```php
$Session->leave('lobby');
$Session->join('room-42');
```

## Referência

### Métodos

```php
Session->join (string $channel): Channel
```

Adiciona esta sessão a um channel, criando-o no primeiro uso. Retorna o `Channel` para você
inspecionar `count()` ou fazer broadcast direto.

```php
Session->leave (string $channel): void
```

Remove esta sessão de um channel. O channel é descartado do registro quando fica vazio.

```php
Session->broadcast (string $channel, string $payload, bool $binary = false, bool $self = false): int
```

Codifica a mensagem uma vez e a escreve em cada membro de `$channel`, republicando para os workers
vizinhos pelo relay para que membros em outros workers também recebam. O remetente é pulado a menos
que `$self` seja `true`. Retorna o número de destinatários **locais**. Frames de broadcast são
enviados sem compressão (um único frame compartilhado não carrega o estado de compressão por sessão).

```php
Channel->count (): int
```

O número de sessões atualmente no channel (neste worker).
