# Performance

O Bootgly foi desenhado para manter o caminho do framework pequeno, mas performance ainda depende da configuração do projeto, do trabalho feito por cada rota e do comportamento dos serviços externos.

Use este guia como checklist antes de tratar um resultado de benchmark como limite do framework.

## Comece pelo baseline correto

Meça pelo menos duas rotas:

1. Uma rota estática que retorna um corpo pequeno e fixo.
2. A rota real que está sendo otimizada.

A rota estática mostra o teto do servidor HTTP para a máquina, build do PHP, quantidade de workers e cliente de benchmark atuais. Uma rota com banco, arquivo, rede ou template sempre será menor porque cada request executa trabalho adicional.

```bash
bootgly test benchmark HTTP_Server_CLI \
  --opponents=bootgly \
  --runner=tcp_client \
  --loads=benchmark:1 \
  --server-workers=13
```

Para famílias de rotas específicas, mantenha um router de benchmark dedicado e um conjunto de cenários próprio. Isso evita misturar overhead de roteamento, trabalho de aplicação e mudanças no setup do benchmark no mesmo número.

## Ajuste concorrência de forma deliberada

Throughput é limitado por concorrência e latência:

```text
throughput máximo ~= requests concorrentes em voo / latência média
```

Se uma rota de banco tem cerca de `2ms` de latência média e o cliente mantém só `128` requests em voo, o teto prático fica perto de `64k req/s` antes de considerar CPU e overhead de scheduler. Aumentar conexões do cliente pode expor mais capacidade, mas também aumenta latência.

Ordem recomendada de varredura:

1. Conexões do cliente de benchmark: `64`, `128`, `256`, `512`.
2. Workers do servidor: perto dos núcleos de CPU primeiro, depois acima e abaixo.
3. Recursos por rota, como tamanho do pool de banco.
4. Configurações de serviços externos.

Compare apenas execuções com o mesmo cenário, duração, warmup e carga da máquina.

## Workers do servidor HTTP

O `HTTP_Server_CLI` usa processos worker. Mais workers podem aumentar throughput até CPU, overhead do scheduler ou dependências compartilhadas virarem o gargalo.

Comece perto do número de cores físicos ou de um ótimo já conhecido em rota
estática, depois faça a varredura — `--server-workers` aceita valores de sweep
(`A..B`, `A..B:passo`, `N,N,...`) que executam um round por valor em um único
comando:

```bash
bootgly test benchmark HTTP_Server_CLI \
  --opponents=bootgly \
  --runner=tcp_client \
  --loads=benchmark:1 \
  --connections=256 \
  --server-workers=8..24:4
```

Cada round grava seu próprio arquivo `.bench.marks` e a execução termina com um
rodapé **Artifacts** apontando para todos os arquivos. Três opções globais
moldam a saída:

- `--output=full|compact` — estilo da saída (auto: compact ao fazer sweep — o
  banner do sistema e a lista de opponents imprimem uma vez, cada round ganha um
  header curto).
- `--format=text|json` — com `json`, a execução imprime **apenas** um documento
  JSON legível por máquina (todos os rounds, resultados e paths dos artefatos);
  toda a saída legível por humanos é suprimida, então a saída encadeia direto
  no `jq`.
- `--results=marks|report|charts` — níveis de artefatos: `report` também grava um
  `RESULTS-<set>-<timestamp>.md`; `charts` adiciona gráficos SVG nativos
  (throughput, ratio, latência) — sem tooling externo. Os reports ficam em
  `bootgly/storage/tests/benchmarks/<case>/results/`.

## Dimensionamento do pool de banco

No ADI Database, os limites de pool são por processo worker HTTP.

```text
total possível de sessões PostgreSQL = server workers * DB_POOL_MAX
```

Por exemplo, `24` workers e `DB_POOL_MAX=4` podem abrir até `96` sessões PostgreSQL.

Comece baixo:

- `DB_POOL_MAX=1` para uma operação ativa de banco por worker.
- `DB_POOL_MAX=2` quando as rotas frequentemente sobrepõem mais de uma query por worker.
- `DB_POOL_MAX=4` para trabalho moderado e paralelo no banco.
- Valores maiores só depois de medir ganho claro.

Sessões idle no PostgreSQL são esperadas com pool. Elas já estão conectadas e aguardando trabalho. Idle demais desperdiça memória e pode aumentar overhead de agendamento no PostgreSQL sem melhorar throughput.

Um pool grande demais pode ser mais lento que um pequeno, especialmente em rotas simples no estilo `SELECT 1`, onde o trabalho no banco é menor que o overhead de conexão, pool e scheduling.

## Configurações do PostgreSQL

O tuning do PostgreSQL precisa acompanhar o workload. Para queries minúsculas e read-only, buffers grandes e opções de durabilidade de escrita normalmente têm pouco efeito.

Checks úteis:

```sql
SHOW max_connections;
SHOW shared_buffers;
SHOW effective_cache_size;
SHOW work_mem;
SHOW jit;
SHOW synchronous_commit;
SHOW fsync;
```

Orientação prática:

- Configure `max_connections` acima do máximo esperado de sessões do pool mais conexões administrativas.
- Mantenha `shared_buffers` razoável para a máquina; aumentar isso não melhora automaticamente queries pequenas e quentes.
- `effective_cache_size` orienta o planner, mas não aloca memória diretamente.
- `jit=off` pode ajudar queries muito pequenas a evitar overhead desnecessário de planejamento.
- `synchronous_commit=off` importa para escritas, não para leituras simples.
- Evite `fsync=off` com dados reais. É inseguro e normalmente irrelevante para benchmarks read-only de rota.

## Mantenha rotas de banco assíncronas

Use o cliente nativo ADI Database ou um helper WPI que espere pelo scheduler da resposta HTTP. Não execute clientes de banco bloqueantes dentro de caminhos de event loop, a menos que a rota esteja intencionalmente isolada.

Uma chamada bloqueante pode parar um worker. Uma operação assíncrona de banco permite que o worker continue tratando eventos de prontidão enquanto o PostgreSQL processa a query.

## Dicas de query e resultado

- Prefira queries parametrizadas.
- Reutilize prepared statements quando fizer sentido.
- Selecione apenas as colunas necessárias para a resposta.
- Mantenha a serialização da resposta pequena em rotas quentes.
- Adicione índices para predicados reais antes de aumentar pool.
- Meça a rota com tamanhos de resultado realistas; `SELECT 1` testa protocolo e scheduling, não acesso a dados de aplicação.

## Leia os números de benchmark com cuidado

Um número alto em rota estática e um número menor em rota de banco podem estar ambos corretos. Rotas estáticas medem principalmente parsing HTTP, roteamento e escrita da resposta. Rotas de banco adicionam pelo menos um round-trip de rede, execução no PostgreSQL, decodificação do resultado e serialização JSON.

Quando uma rota de banco estabilizar em um teto:

1. Confira a concorrência do cliente.
2. Confira workers do servidor.
3. Confira o total de sessões de banco.
4. Inspecione sessões ativas versus idle no PostgreSQL.
5. Compare código native low-level com helper.
6. Só então ajuste memória e durabilidade do PostgreSQL.

Para muitas rotas, reduzir o pool melhora a estabilidade mesmo quando o maior número isolado de benchmark fica um pouco menor.
