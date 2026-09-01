# CLI de Logs

"Como vejo o log do servidor **agora**?" tem uma resposta no Bootgly: `bootgly logs`. Ele lê tudo
que os sinks persistiram no `storage/logs/` compartilhado — o backlog — e, com `-f`, segue as
instâncias em execução **ao vivo**, de qualquer terminal, em qualquer modo de servidor. Daemon
incluído: sem `journalctl`, sem `tail`, sem ginástica de SSH.

## Siga um projeto ao vivo

Enderece o projeto pelo **nome** — nunca pela porta. Um projeto de Console não tem porta; a porta
de um servidor é um filtro de records e, com `-f`, o desempate do tap ao vivo:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI logs -f
```

Num terminal isso abre a mesma tela cheia do modo Monitor — mesma barra de status, filtros e
teclas (`l` severidade, `1`–`9` canais, `/` busca, `space` pausa, `Enter` detalhe, `q` sair). Duas
sessões podem anexar ao mesmo tempo; as duas recebem todos os records.

Sem TTY — ou com `--json` — a saída é um stream puro, um record por linha, pronto para `grep` ou
um coletor de logs:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI logs -f --json | grep -i error
```

Quando várias instâncias do mesmo projeto estão vivas, um alvo omitido **lista e recusa** —
escolha uma com `--instance`:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI logs -f --instance=8443
```

A mesma opção restringe o **backlog** também — todo record carrega a instância que o escreveu —
então um feed por instância é um comando só:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI logs --instance=8443 --since=15m --json
```

## Leia o backlog (e faça shipping)

Sem `-f`, `logs` imprime o que os sinks persistiram e sai. `--since` limita a leitura (rotações
incluídas), e todos os filtros compõem:

```bash :toolbar="true";
bootgly logs --since=15m --level=warning
bootgly logs --channel=exceptions --json
bootgly logs --project=Demo/HTTP_Server_CLI --since=2h
bootgly logs --framework
```

O escopo do kit (`bootgly logs`) enxerga os records de **todos** os projetos, cada linha marcada
pela sua [procedência](/guide/logging/overview/) — o campo `project` (`framework` para os
processos do próprio framework) — e pela sua `instance`, a porta vinculada ou o PID do master
que a escreveu. `bootgly logs -f` segue todas as instâncias vivas de uma vez.

## Projetos de Console também

Um worker de queue, um runner de schedule, um app TUI — projetos de Console não têm porta nem
servidor, mas têm identidade de instância (registrada pelo `project start`) e seus records seguem
pela **lane de arquivo**: o que os sinks deles persistirem flui na mesma sessão de `logs -f`.
Sockets de tap ao vivo são um recurso de servidor (WPI) neste ciclo.

## Custo zero até você olhar

O tap ao vivo é um socket unix por instância (só do dono, `0600`) publicado pelo master do
servidor em qualquer modo. **Anexar arma; desanexar desarma**:

- ninguém anexado → o `Logger::$Tap` dos workers fica `null`, nenhuma escrita, custo nenhum
  mensurável — o hot path de requisição nunca é tocado;
- anexado → cada record (não cada requisição) custa uma escrita de datagrama não-bloqueante,
  descartada inteira sob backpressure — um viewer lento jamais trava um worker;
- o master distribui os frames para cada sessão a partir do seu tick de supervisão (latência
  ≤ 0,5 s em Daemon/Foreground; ~30 ms sob Monitor).

Uma instância morta com `kill -9` deixa um socket morto para trás: o `logs -f` avisa e degrada
para arquivos; o próximo `start` religa o socket e o `stop` o remove.

> [!NOTE]
> Records emitidos **entre** o seu anexo e o armar dos workers (uma ida de sinal) chegam aos
> arquivos, não ao fluxo ao vivo — o backlog os cobre. No modo Interactive, frames represados
> enquanto um comando digitado executa são entregues no tick seguinte.

## Referência

```php
bootgly logs [-f|--follow] [--project=<Nome>] [--framework] [--instance=<id>]
             [--channel=<c>] [--level=<l>] [--since=<t>] [--json]
```

Escopo do kit: o backlog do `storage/logs/` compartilhado, mais o tap de cada instância viva com
`-f`. `--project` e `--framework` filtram por procedência do record e são mutuamente exclusivos.
`--instance` filtra pelo campo `instance` do record — a porta vinculada (servidores) ou o PID do
master (Console) — no backlog e ao vivo igualmente; linhas escritas antes do campo existir não
carregam instância e nunca casam.

```php
bootgly project <Nome> logs [-f|--follow] [--instance=<id>]
                            [--channel=<c>] [--level=<l>] [--since=<t>] [--json]
```

Escopo de projeto — a mesma implementação, pré-filtrada para `<Nome>` (o id de pasta canônico).
`--instance` seleciona uma instância: filtra o backlog pelo campo `instance` dos records e, com
`-f`, escolhe a qual tap ao vivo anexar; com várias vivas e sem `--instance`, o `-f` as lista e
recusa.

| Opção | Significado |
|---|---|
| `-f`, `--follow` | seguir records novos (não confundir com `start -f`, que é Foreground) |
| `--project=<Nome>` | só os records daquele projeto (escopo do kit) |
| `--framework` | só records com procedência `framework` |
| `--instance=<id>` | só os records daquela instância — porta (servidores) ou PID do master (Console); com `-f`, também o desempate do tap ao vivo |
| `--channel=<c>` | só esses canais (separados por vírgula) |
| `--level=<l>` | severidade mínima (`debug` … `emergency`) |
| `--since=<t>` | ponto de partida — `30s`/`15m`/`2h`/`7d` ou qualquer sintaxe de `strtotime` |
| `--json` | saída de máquina: um record JSON por linha (implica a lane de stream) |

```php
Bootgly\ACI\Logs\Backlog->__construct (string $directory, bool $rotations = true)
```

O leitor de logs persistidos por trás do comando. `scan()` lista os arquivos de log (rotações
primeiro, da mais antiga), `read(float $since = 0.0)` funde todos os arquivos em ordem crescente
de timestamp, e `following()` produz o NDJSON anexado depois da chamada — sobrevivendo a rotação
e a arquivos novos.

```php
Bootgly\ACI\Process\States::scan (string $id): array
```

Descoberta de instâncias em `storage/pids/` pelo id codificado — com `States::locate()` e
`States::authenticate()`, o mesmo endereçamento verificado que `project stop/restart` usa.

```php
Bootgly\CLI\UX\Components\Tail->run (Iterator $Source): void
```

O laço de follow do lado cliente: tela alternativa, input raw, o `LogsViewer` compartilhado — e a
restauração do terminal garantida em todo caminho de saída.

## Próximas referências

- **[Logging](/guide/logging/overview/)** — o pipeline que produz esses records: sinks,
  procedência, formatos, o viewer do Monitor.
- **[Plataforma Console](/guide/console-platform/overview/)** — projetos de Console e seu ciclo
  de vida.
