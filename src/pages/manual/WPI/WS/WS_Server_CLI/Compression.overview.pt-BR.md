# Compressão

O servidor suporta `permessage-deflate` (RFC 7692). Ele é negociado automaticamente durante o
handshake sempre que o cliente oferece e `compression` está ligado (o padrão), usando o `zlib`
embutido do PHP — sem dependência extra, e respeitando o core sem dependências do Bootgly.

## Como funciona

- O cliente anuncia `Sec-WebSocket-Extensions: permessage-deflate` na requisição de upgrade.
- O servidor aceita e ecoa os parâmetros negociados de volta na resposta `101`.
- Mensagens comprimidas de entrada (RSV1 setado) são **infladas** antes do seu handler rodar —
  `$Message->payload` é sempre os bytes descomprimidos.
- Respostas em string (e `Session->send()`) são **comprimidas** na saída e marcadas com RSV1.

Nada no seu handler muda; a compressão é transparente.

## Ligar/desligar

Vem ligada por padrão. Desligue por servidor:

```php
$WS->configure(host: '0.0.0.0', port: 8083, workers: 1, compression: false);
```

O servidor negocia as flags `client_no_context_takeover` / `server_no_context_takeover` e os limites
de window-bits que o cliente oferece, usando uma janela completa de 15 bits caso contrário.

> [!NOTE]
> Frames de broadcast (veja **Channels**) são enviados **sem compressão** — um único frame
> compartilhado não carrega o contexto de deflate por sessão que o `permessage-deflate` exige.
> `send()` direto e respostas do handler para um único cliente são comprimidos normalmente.
