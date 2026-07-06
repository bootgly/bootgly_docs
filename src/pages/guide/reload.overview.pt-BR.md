# Reload

O `project reload` faz um **hot-reload gracioso** de um servidor em execução: ele drena as
requisições em andamento e então re-executa o processo master em uma imagem PHP nova, de modo
que toda a sua aplicação — closures de rota **e** classes autocarregadas — é recarregada do
disco. O master mantém o mesmo PID, e nenhuma requisição já aceita é descartada.

Use-o para publicar uma mudança de código em um servidor em execução sem um stop/start completo
e sem derrubar conexões.

## Recarregar um servidor em execução

Inicie um servidor e recarregue-o após editar seu código:

```bash
# Inicie o projeto (daemon por padrão; -f foreground, -m monitor)
bootgly project Demo/HTTP_Server_CLI start

# ...edite seus handlers de rota / código do projeto...

# Reload gracioso — código novo no ar, mesmo PID do master, sem requisições perdidas
bootgly project Demo/HTTP_Server_CLI reload
```

O servidor responde `HTTP 200` antes, durante (para requisições já aceitas) e depois do reload.
Há uma janela breve — entre o último worker antigo sair e os workers novos fazerem o bind — em
que **novas** conexões são recusadas; os clientes simplesmente tentam de novo.

Dentro de uma sessão interativa (`start -i`), digite o comando diretamente:

```text
reload
```

## O que acontece no reload

1. O master recebe o sinal de reload (`SIGUSR2`).
2. Cada worker para de aceitar novas conexões e **conclui suas requisições em andamento**
   (drain gracioso), depois sai. Um worker travado é encerrado à força após `drainTimeout`
   segundos (padrão `30`).
3. O master substitui a própria imagem de processo por uma nova (`pcntl_exec`) usando o exato
   comando com que foi iniciado. Como a imagem de processo é substituída, o PHP relê cada
   arquivo do disco — é por isso que as classes recarregam, o que um reboot in-place não
   consegue fazer.
4. O master novo refaz o bind (via `SO_REUSEPORT`) e forka novos workers rodando o código novo.

O PID do master nunca muda, então arquivos de PID, `project status` e qualquer supervisor
continuam válidos.

## Reload vs restart

```bash
bootgly project <nome> reload    # gracioso: drena em andamento, re-exec, sem requisições perdidas
bootgly project <nome> restart   # bruto: stop e start (derruba conexões, breve downtime total)
```

Prefira `reload` para publicar código em um servidor no ar. Use `restart` apenas quando quiser
um cold start limpo.

## Ressalvas

- **Janela breve sem accept.** Requisições em andamento nunca são descartadas, mas novas
  conexões são recusadas pelo curto intervalo em que os workers reciclam. Isso não é
  zero-downtime; os clientes tentam de novo.
- **OPcache em produção.** O reload re-executa em um novo processo, que normalmente relê os
  arquivos do disco. Se você roda OPcache com `opcache.validate_timestamps=0` (comum em
  produção), o novo processo pode ainda servir bytecode em cache — resete o OPcache no deploy,
  ou mantenha a validação de timestamps ligada, para que o reload realmente pegue o código novo.
- **Reload automático em mudança de arquivo** (observar o projeto no disco e recarregar quando
  ele muda) ainda não está ligado; `reload` é o gatilho explícito e canônico.

## Referência

```bash
bootgly project <nome> reload
```

Envia `SIGUSR2` ao processo master do projeto, que executa o re-exec gracioso descrito acima.
Exige que o projeto esteja em execução; imprime um erro caso não esteja.

```text
reload
```

O comando de modo interativo (disponível sob `start -i`). Sinaliza o master do servidor atual
para recarregar — comportamento idêntico ao `project <nome> reload`.

```php
\Bootgly\WPI\Interfaces\TCP_Server_CLI::$drainTimeout = 30;
```

Segundos que cada worker recebe para concluir suas requisições em andamento antes de o master
encerrá-lo à força durante um reload. Aumente para requisições longas; diminua para um reload
mais rápido e agressivo. Aplica-se aos servidores HTTP, WebSocket e TCP raw. (UDP é sem conexão
e não tem fase de drain.)
