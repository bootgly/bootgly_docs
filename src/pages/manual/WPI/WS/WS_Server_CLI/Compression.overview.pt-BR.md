# Compressão

O servidor suporta `permessage-deflate` (RFC 7692). Ele é negociado automaticamente durante o
handshake sempre que o cliente oferece e `compression` está ligado (o padrão), usando o `zlib`
embutido do PHP — sem dependência extra, e respeitando o core sem dependências do Bootgly.

## Como funciona

- O cliente anuncia `Sec-WebSocket-Extensions: permessage-deflate` na requisição de upgrade.
- O servidor aceita e responde os parâmetros negociados na resposta `101` — sempre com
  `server_no_context_takeover` e `client_no_context_takeover`:
  `Sec-WebSocket-Extensions: permessage-deflate; server_no_context_takeover; client_no_context_takeover`.
- Mensagens comprimidas de entrada (RSV1 setado) são **infladas** antes do seu handler rodar —
  `$Message->payload` é sempre os bytes descomprimidos.
- A inflação consome incrementalmente o orçamento de `maxMessageSize`. Uma expansão que ultrapassa
  o limite é interrompida com o código de close `1009` antes de reter toda a saída controlada pelo atacante.
- Respostas em string (e `Session->send()`) são **comprimidas** na saída e marcadas com RSV1.

Nada no seu handler muda; a compressão é transparente.

## Cada mensagem por si

O servidor comprime e infla **cada mensagem de forma independente** — nenhum estado de compressão é
mantido entre mensagens, em nenhuma direção:

- Na saída, todas as sessões de um worker compartilham um compressor por tamanho de janela, esvaziado
  por completo após cada mensagem. Uma mensagem nunca referencia bytes de uma mensagem anterior, dessa
  sessão ou de qualquer outra.
- Na entrada, cada mensagem comprimida é inflada por um inflater novo. O cliente deve respeitar
  `client_no_context_takeover` (RFC 7692 §7.1.1.2 — navegadores e clientes padrão respeitam): uma
  mensagem que referencia a mensagem anterior do cliente é dado inválido e encerra a conexão com `1007`.
  Um cliente configurado para recusá-la falha no handshake — por exemplo o cliente `ws` do Node.js com
  `perMessageDeflate: { clientNoContextTakeover: false }`; mantenha os padrões dele, ou desligue a
  compressão de um dos lados.
- Assim, uma conexão comprimida não guarda memória de compressão própria: uma conexão comprimida ociosa
  custa praticamente o mesmo que uma sem compressão, e o worker chega ao limite de conexões com a
  compressão ligada em vez de esgotar a memória.

A contrapartida é a taxa em mensagens pequenas e repetitivas: cada mensagem é comprimida sem o
dicionário das anteriores, então um fluxo de JSONs curtos e parecidos comprime menos do que comprimiria
com context takeover, e cada uma custa alguns microssegundos a mais de CPU para comprimir. Mensagens
grandes quase não são afetadas. Se o seu tráfego é sobretudo de
mensagens minúsculas, compare o tamanho no fio com `compression: false` antes de mantê-la ligada.

## Ligar/desligar

Vem ligada por padrão. Desligue por servidor:

```php
$WS->configure(
   new WS_Server_CLI\Configs(host: '0.0.0.0', port: 8083, workers: 1, compression: false)
);
```

> [!NOTE]
> `configure()` recebe value objects **Configs**, **apenas named arguments** — um
> `new WS_Server_CLI\Configs('0.0.0.0', 8083, 1)` posicional levanta um `TypeError`. Veja a página
> **WS Server CLI** para o contrato completo.

Um limite `server_max_window_bits` oferecido pelo cliente (de 9 a 15) é aceito e ecoado na resposta, e
o servidor comprime dentro dele. Um limite fora de 9–15 (em `server_max_window_bits` ou
`client_max_window_bits`) recusa aquela oferta: o servidor tenta a próxima oferta do header e, sem
nenhuma restante, a conexão segue sem compressão. Sem o limite, o servidor comprime com uma janela
completa de 15 bits. Ele sempre infla com a janela completa, então decodifica qualquer janela do cliente
de 9 a 15. As duas flags `no_context_takeover` sempre fazem parte da resposta, tenha o cliente oferecido
ou não.

Para saber se uma sessão negociou compressão, teste `$Session->extensions !== []` — ele guarda os
parâmetros negociados.

> [!NOTE]
> Frames de broadcast (veja **Channels**) são enviados **sem compressão** — um único frame é montado
> uma vez para todos os membros do canal, tenha cada membro negociado compressão ou não. `send()` direto
> e respostas do handler para um único cliente são comprimidos normalmente.
