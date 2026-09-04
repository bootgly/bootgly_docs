# Docker

O Bootgly publica **três** imagens, uma por repositório, cada uma com um trabalho diferente:

| Imagem | O que é | Use para |
|--------|---------|----------|
| `bootgly/bootgly.kit` | **O produto.** Framework + Console + Web + a entrada do kit — exatamente o que o `curl -fsSL https://bootgly.com/install \| bash` instala. | Rodar o Bootgly. |
| `bootgly/bootgly` | **Só o framework** — o ingrediente. Sem Console, sem Web, e os comandos `kit` não funcionam nela. | Construir sua própria imagem sobre o Bootgly. |
| `bootgly/bootgly_benchmarks` | **O harness de benchmark entre frameworks**, uma tag por concorrente. | Comparar o Bootgly com Swoole, FrankenPHP, Bun, … |

Se você só quer *usar* o Bootgly, quer a `bootgly/bootgly.kit` e mais nada nesta página até a
Referência.

> **Vindo de uma tag antiga? A `bootgly/bootgly` mudou de significado.** Toda tag que aquele
> repositório publicou até a `1.0.0-rc.1` inclusive — `:slim`, `:full`, as versões puras e os
> canais `:rc` / `:beta` — carregava uma imagem que se apresentava como o produto: um
> `docker run -it` puro abria o wizard de projetos. Aquele repositório agora é **só o
> framework**: um run puro imprime a ajuda, e os comandos `kit` recusam. O produto se mudou
> para `bootgly/bootgly.kit`.
>
> | Você rodava | Rode agora |
> |---|---|
> | `bootgly/bootgly:slim`, ou qualquer tag de versão pura | `bootgly/bootgly.kit` |
> | `bootgly/bootgly:rc` / `:beta` | `bootgly/bootgly.kit:rc` / `:beta` |
> | `bootgly/bootgly:full` | `bootgly/bootgly` (framework + suítes) ou `bootgly/bootgly_benchmarks` |
> | `FROM bootgly/bootgly:<versão>` numa imagem sua | não muda — é exatamente para isso que esta imagem existe |
>
> Tags já publicadas nunca são reescritas: a `bootgly/bootgly:1.0.0-rc.1` mantém os bytes com
> que foi publicada, e os dois workflows de release recusam sobrescrever uma tag de versão
> exata. O que se move são os canais — `:rc` e `:beta` acompanham a pre-release mais nova do
> que aquele repositório publica hoje, então fixe uma versão exata se você precisa que a
> imagem antiga fique onde está. A `:slim`, a `:full` e todas as `*-full` foram **deletadas**
> em 2026-09-04 e não resolvem mais — um pull nelas falha de vez, em vez de entregar em
> silêncio uma variante cujo nome dizia o oposto do conteúdo.
>
> Por que os nomes de variante sumiram: em qualquer outra imagem do Docker Hub, `slim`
> significa uma base de SO menor, não menos software — e a `slim` do Bootgly era o produto,
> enquanto a `full` era o harness de benchmark, ou seja, os nomes diziam o oposto da verdade.

> **A imagem do kit não tem `latest` enquanto o Bootgly está em pre-release** (e a imagem do
> framework nunca terá — veja o esquema de tags). Acrescente a tag de canal
> a todos os nomes de imagem abaixo — `bootgly/bootgly.kit:rc` — ou fixe uma versão exata
> (`bootgly/bootgly.kit:1.0.0-rc.1`). Veja [Esquema de tags](#esquema-de-tags).

## Rodar o Bootgly

### Primeira execução — o wizard

Uma execução interativa sem argumentos abre o instalador canônico de projetos:

```bash :toolbar="true";
docker run -it --rm \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  bootgly/bootgly.kit
```

É o mesmo wizard por trás do [`bootgly projects create`](/guide/getting-started) — modo de
início (do zero, a partir de um exemplo que já vem no kit, ou de um remoto Git), caminho do
projeto, interface (CLI ou WPI), metadados e scaffolding. Essa primeira execução também cria
os diretórios de recursos do kit e importa os projetos de exemplo — os Demos do framework,
os jogos do Console, os exemplos do Web — para `projects/`, como guias vivos para você e para
agentes de IA.

As flags `-it` são obrigatórias: sem TTY o wizard não abre e o container imprime uma dica no
lugar. Com Compose, defina `stdin_open: true` e `tty: true`.

Qualquer comando explícito pula o wizard e vai direto para a CLI `bootgly`:

```bash
docker run --rm bootgly/bootgly.kit help
docker run --rm bootgly/bootgly.kit test --bootgly 102          # uma suíte do framework
docker run --rm bootgly/bootgly.kit project Demo/HTTP_Server_CLI start -f
```

### Preserve seu trabalho — volumes

`/bootgly/projects` e `/bootgly/storage` são declarados como `VOLUME`. Faça bind-mount dos
dois e seus projetos, logs, PIDs e cache passam a viver no host:

```bash :toolbar="true";
docker run --rm -it \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  bootgly/bootgly.kit projects list
```

Depois que o wizard rodar, isso lista seus projetos e os exemplos importados.

Duas consequências que vale dizer sem rodeios:

- **Um `docker pull` de uma versão mais nova preserva tudo o que vive em um volume.** A
  atualização troca a imagem — o framework, as plataformas, a CLI — e nunca o volume.
- **O trabalho escrito dentro de um container sem volume morre com ele.** Sem `-v`, o Docker
  cria um volume *anônimo* a partir da imagem, e o `--rm` o apaga quando o container encerra.
  O wizard vai criar, alegremente, um projeto que você nunca mais verá.

O marcador de primeira execução é `projects/.initialized`, então ele também vive no volume:
monte `projects/` e o wizard abre uma vez, na primeira execução; as execuções seguintes sem
argumentos imprimem a ajuda da CLI.

### Rodar um servidor

Passe `-f` para rodar um servidor em **primeiro plano** (headless) — necessário em
containers. Sem ele o servidor vira daemon e o container encerra imediatamente. Em primeiro
plano ele envia logs para o stdout e drena de forma graciosa no `SIGTERM`, que é o que o
`docker stop` envia (a imagem declara `STOPSIGNAL SIGTERM`).

```bash :toolbar="true";
docker run --rm -p 8082:8082 \
  bootgly/bootgly.kit project Demo/HTTP_Server_CLI start -f
```

Depois, em outro terminal:

```bash :toolbar="true";
curl http://localhost:8082
```

Os projetos `Demo/*` vêm do framework que a imagem carrega, então rodam antes de o wizard ter
importado qualquer coisa para `projects/`.

Seu próprio projeto inicia do mesmo jeito, com `projects/` montado:

```bash
docker run --rm -p 8082:8082 \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  bootgly/bootgly.kit project MyApp start -f
```

Todo servidor que vem no kit lê a variável de ambiente `PORT` (com fallback para o padrão) e
escuta em `0.0.0.0`, então dá para mudar a porta sem reconstruir nada:

```bash :toolbar="true";
docker run --rm -e PORT=9090 -p 9090:9090 \
  bootgly/bootgly.kit project Demo/HTTP_Server_CLI start -f
```

### Mudar de versão

Dentro da imagem, um release **é** uma tag de imagem:

```bash
docker pull bootgly/bootgly.kit:1.0.0-rc.1
```

Os comandos `kit upgrade`, `kit downgrade` e `kit list` recusam dentro da imagem e explicam
por quê: a imagem entrega o *layout* do kit, não um checkout git (o build remove o `.git` de
propósito), então não há nada para eles moverem — e reescrever um sistema de arquivos que o
próximo `docker run` joga fora só pareceria ter funcionado. A recusa nomeia o `docker pull` e
imprime a versão que a imagem carrega.

### Construir a imagem do kit você mesmo

```bash
docker build -f Dockerfile --target kit \
  --build-arg BOOTGLY_VERSION=1.0.0-rc.1 \
  -t bootgly.kit:1.0.0-rc.1 .
```

Rode a partir de um clone do repositório
[`bootgly.kit`](https://github.com/bootgly/bootgly.kit). O build não pega **nada** do build
context: ele faz git clone do kit na tag do release, com submódulos, então uma única tag fixa
framework + Console + Web e a imagem se reproduz só a partir da tag. Duas consequências: o
build precisa de rede, e ele sempre constrói um ref *pushado* — trabalho não commitado nunca
entra na imagem. Para construir outro ref:

```bash
docker build -f Dockerfile --target kit \
  --build-arg BOOTGLY_VERSION=1.0.0-rc.1 \
  --build-arg BOOTGLY_KIT_REF=main \
  -t bootgly.kit:main .
```

## Construir sobre a imagem do framework

A `bootgly/bootgly` é o framework e nada mais — o ingrediente com que você compõe. Use quando
for publicar sua própria imagem e não quiser as plataformas do kit nem o registro de projetos
dele.

O `<version>` abaixo é um placeholder para uma tag real, e ela precisa ser uma publicada
**depois** desta divisão: tudo até a `1.0.0-rc.1` é a imagem antiga, em formato de produto, e
essas tags nunca são reescritas. Não há alias móvel para cair de volta — este repositório não
publica `latest`, e `:rc` / `:beta` seguem apenas pre-releases. Escolha a versão em
[a lista de tags](https://hub.docker.com/r/bootgly/bootgly/tags).

```dockerfile
# syntax=docker/dockerfile:1
FROM bootgly/bootgly:<version>

COPY . /bootgly/projects/MyApp/

# O registro é a allow-list: um caminho não registrado nunca inicia.
COPY <<'PHP' /bootgly/projects/Bootgly.projects.php
<?php

return [
   'MyApp' => ['interfaces' => ['WPI']],
];
PHP

EXPOSE 8082
CMD ["project", "MyApp", "start", "-f"]
```

```bash
docker build -t myapp .
docker run --rm -p 8082:8082 myapp
```

Fixe uma versão exata no `FROM`; quando existir um release estável você pode fixar o major
(`bootgly/bootgly:1`), que avança a cada release 1.x.

Escrever esse arquivo substitui o registro do próprio framework, então os projetos `Demo/*`
que vêm na imagem deixam de resolver — que é exatamente o que você quer em uma imagem de
aplicação. Mantenha o `CMD` como lista de argumentos: a CLI `bootgly` é o entrypoint da
imagem, então tudo o que você passa vai direto para ela.

### Rodar as suítes do framework

A imagem do framework também é onde o framework testa a si mesmo:

```bash
docker run --rm bootgly/bootgly:<version> test 16      # uma suíte, por índice
docker run --rm bootgly/bootgly:<version> test 16 1    # um case de uma suíte
docker run --rm -e AI_AGENT=1 bootgly/bootgly:<version> test 16   # saída legível por máquina
```

> **Rode suítes por índice dentro de um container.** Uma execução completa trava ali: uma suíte
> que sobe um servidor o deixa segurando o pipe de saída do runner, e o runner bloqueia na
> leitura — de vez. O container não sai, então o `--rm` também nunca dispara; você o recupera
> com `docker stop`. Cada suíte passa sozinha, então a forma confiável num container é um índice
> por vez. As suítes de Auto-TLS somam um segundo motivo: a imagem roda como root, e o Auto-TLS
> recusa tocar o armazenamento de credenciais como root sem um `user` nos Configs do servidor. A
> execução completa é do CI do framework, num host.


Um run reporta **todas** as falhas por padrão; `--fail-fast` para na primeira. Algumas suítes
assumem um usuário não-root (por exemplo, que `/sbin` não é gravável) — essas premissas não
valem dentro de um container limpo, e as falhas que elas produzem são uma característica
desses testes, não da imagem.

Na imagem do **kit** o escopo é resolvido pelo diretório de trabalho, então nomeie o escopo
explicitamente lá: `test --bootgly`, `--console` ou `--web`.

### Construir a imagem do framework você mesmo

A partir da raiz do repositório `bootgly` — o build context é o próprio repositório:

```bash
docker build -f Dockerfile --target framework -t bootgly:framework .
```

### Docker Compose

O repositório `bootgly` traz um arquivo Compose com dois profiles, os dois construindo a
mesma imagem do framework uma única vez:

```bash
docker compose --profile serve up        # servidor HTTP demo em :8082
docker compose --profile test  up        # uma suíte (SUITE=16 para escolher)
```

O estado e os PIDs do servidor persistem em um volume nomeado `storage`. Não existe profile
`bench`: o benchmark roda a partir da própria imagem publicada dele.

## Fazer benchmark contra outros frameworks

A `bootgly/bootgly_benchmarks` é o harness — ela constrói **sobre** a `bootgly/bootgly` e
adiciona os concorrentes, o PostgreSQL e os casos de benchmark. Cada servidor é iniciado
localmente dentro do mesmo container, então cliente e servidores compartilham o loopback e a
comparação permanece justa. Há uma tag por concorrente:

`bootgly` · `swoole` · `workerman` · `roadrunner` · `frankenphp` · `hyperf` · `reactphp` ·
`amphp` · `laravel-octane` · `express` · `bun`

A tag `bootgly` é o harness sem nenhum oponente embutido.

```bash :toolbar="true";
docker run --rm bootgly/bootgly_benchmarks:swoole \
  test benchmark HTTP_Server_CLI \
  --opponents=bootgly,swoole --runner=tcp_client --loads=benchmark:1
```

O PostgreSQL é iniciado e populado pelo entrypoint, então os load sets com banco funcionam
com zero configuração no host:

```bash
docker run --rm bootgly/bootgly_benchmarks:swoole \
  test benchmark HTTP_Server_CLI \
  --opponents=bootgly,swoole --runner=tcp_client --loads=techempower:1,3
```

> `--loads=<set>:<indexes>` é obrigatório. O set `techempower:` seleciona as rotas de carga e
> também informa ao oponente Bootgly qual router servir. Use `techempower:*` para todas as
> rotas, ou liste índices (`techempower:1,3`).

Uma **varredura de workers com gráficos** também roda em um único `docker run` —
`--server-workers` aceita valores de sweep (`1..24`, `1..24:4`, `1,2,4,8`), cada um vira um
round de execução, e `--results=charts` gera o report em Markdown mais gráficos SVG nativos.
Monte um diretório do host para manter os artefatos:

```bash
docker run --rm -v "$PWD/results:/bootgly/storage/tests/benchmarks" \
  bootgly/bootgly_benchmarks:swoole \
  test benchmark HTTP_Server_CLI \
  --opponents=bootgly,swoole --loads=techempower:1,2 \
  --server-workers=1..24:4 --results=charts
```

Outros casos: `TCP_Server_CLI`, `UDP_Server_CLI`, `WS_Server_CLI`, `Template_Engine`, `Cache`
e `Progress_Bar`.

### Construir uma você mesmo

A partir de um clone do
[`bootgly_benchmarks`](https://github.com/bootgly/bootgly_benchmarks), um build ARG por
oponente:

```bash
docker build -f Dockerfile \
  --build-arg BOOTGLY_FRAMEWORK_IMAGE=bootgly/bootgly:<version> \
  --build-arg WITH_SWOOLE=1 \
  -t bootgly_benchmarks:swoole .
```

A imagem base é **obrigatória** — não há default, de propósito: a `bootgly/bootgly` não publica
alias móvel estável, então qualquer default congelaria numa pre-release no dia em que uma stable
saísse e passaria a medir, em silêncio, código não lançado.

## Referência

### Imagens

```text
bootgly/bootgly.kit          o produto — framework + Console + Web + a entrada do kit
                             base: php:8.4-cli-bookworm · construída pelo repo bootgly.kit
bootgly/bootgly              só o framework — o ingrediente
                             base: php:8.4-cli-bookworm · construída pelo repo bootgly
bootgly/bootgly_benchmarks   o harness de benchmark entre frameworks
                             base: bootgly/bootgly · construída pelo repo bootgly_benchmarks
```

### Esquema de tags

A versão **é** a tag; não há sufixo de variante para confundir com ela.

| Release | `bootgly/bootgly.kit` (o produto) | `bootgly/bootgly` (o ingrediente) |
|---------|------------------------------------|-----------------------------------|
| Estável `1.2.3` | `1.2.3`, `1.2`, `1`, `latest` | `1.2.3`, `1.2`, `1` |
| Pre-release `1.0.0-rc.1` | `1.0.0-rc.1`, `rc` | `1.0.0-rc.1`, `rc` |
| Pre-release `1.0.0-beta.4` | `1.0.0-beta.4`, `beta` | `1.0.0-beta.4`, `beta` |

**Só a imagem do kit recebe `latest`.** Um `docker pull bootgly/bootgly` sem tag entregaria o
framework sozinho — sem Console, sem Web, sem o comando `kit` —, que é exatamente a confusão que
esta separação existe para encerrar. A imagem do framework é sempre puxada por tag explícita.

Uma pre-release **nunca** move a `latest`, nem os apelidos de major/minor — caso contrário um
`docker pull bootgly/bootgly.kit` entregaria código não lançado a todo mundo. Os apelidos de
canal (`rc`, `beta`) são tags móveis que você escolhe usar deliberadamente. A `latest`,
portanto, só aparece depois de um release estável; enquanto o Bootgly está em pre-release,
baixe o apelido de canal ou uma versão exata.

As imagens de benchmark são tagueadas por concorrente (`:swoole`, `:bun`, …) e reconstruídas
contra cada imagem do framework recém-publicada.

### Arquiteturas

```text
bootgly/bootgly.kit          linux/amd64, linux/arm64
bootgly/bootgly              linux/amd64, linux/arm64
bootgly/bootgly_benchmarks   linux/amd64
```

As imagens de benchmark ficam em amd64 porque os oponentes distribuem binários só para amd64
— o FrankenPHP é fixado por digest de imagem amd64, e o RoadRunner e o Bun trazem os próprios
binários.

### Portas

A imagem do kit expõe as portas dos servidores de exemplo que ela traz; seu próprio projeto
publica a porta dele.

| Servidor | Projeto | Porta padrão |
|----------|---------|--------------|
| HTTP      | `Demo/HTTP_Server_CLI`  | 8082 |
| HTTPS     | `Demo/HTTPS_Server_CLI` | 443  |
| TCP       | `Demo/TCP_Server_CLI`   | 8080 |
| WebSocket | `Demo/WS_Server_CLI`    | 8083 |
| UDP       | `Demo/UDP_Server_CLI`   | 9999/udp |

A imagem do framework expõe o mesmo conjunto mais a `8084` (o par de benchmark `8083`/`8084`).

### Volumes e caminhos

```text
/bootgly/projects   VOLUME (imagem do kit) — seus projetos + o marcador .initialized
/bootgly/storage    VOLUME (imagem do kit) — logs, PIDs, cache, locks, queues, temp, tests
/bootgly            WORKDIR · symlink em /usr/local/bin/bootgly
/bootgly/Bootgly    o framework, dentro da imagem do kit
/bootgly_benchmarks os casos de benchmark (apenas nas imagens de benchmark)
/usr/local/etc/php/conf.d/zz-bootgly.ini   tuning de opcache + JIT
```

### Variáveis de ambiente

```text
PORT              Sobrescreve a porta de escuta de um servidor
AI_AGENT          Qualquer valor não vazio seleciona a saída de testes legível por máquina
BOOTGLY_DOCKER    Definida como 1 pelas duas imagens publicadas; muda apenas a redação da recusa
                  do `kit` (aqui, releases são tags de imagem). Nada mais lê essa variável —
                  em qual imagem você está é decidido pelo layout em disco, então defini-la
                  na mão não faz um teste nem uma recusa dizer algo falso
DB_HOST DB_PORT   Apenas nas imagens de benchmark — apontam para o PostgreSQL local
DB_NAME DB_USER   do container e podem ser sobrescritas com `docker run -e`
DB_PASS
```

### Argumentos de build

```text
PHP_IMAGE            Imagem base (padrão: php:8.4-cli-bookworm)
BOOTGLY_VERSION      Label de versão — também o ref padrão do kit (v${BOOTGLY_VERSION})
BOOTGLY_KIT_REF      Só na imagem do kit: o branch ou a tag a clonar e construir (um
                     commit puro é recusado — `git clone --branch` exige nome de ref)
BOOTGLY_FRAMEWORK_*  Procedência do código gravada na imagem (sha, flag dirty, hashes)

BOOTGLY_FRAMEWORK_IMAGE   Imagens de benchmark: a imagem do framework usada no FROM
WITH_SWOOLE  WITH_WORKERMAN  WITH_ROADRUNNER  WITH_FRANKENPHP  WITH_HYPERF
WITH_REACTPHP  WITH_AMPHP  WITH_LARAVEL_OCTANE  WITH_EXPRESS  WITH_BUN
```

A imagem do framework também pode gravar a tupla exata do código-fonte, que o build context
não consegue carregar porque exclui o `.git`:

```bash
docker build \
  $(php Bootgly/ACI/Tests/Benchmark/provenance.php . ../bootgly_benchmarks --docker-build-args) \
  -f Dockerfile --target framework -t bootgly:framework .
```

### Labels

As duas imagens carregam os labels OCI padrão — `org.opencontainers.image.title`,
`.description`, `.version`, `.revision` (o commit do framework), `.licenses` (MIT) e
`.source`, `.vendor`, `.url` e `.documentation`. As imagens do kit e do framework trazem o
conjunto completo; as de benchmark não trazem nenhuma.

### Extensões PHP e tuning

Incluídas: `pcntl`, `sockets`, `shmop`, `sysvshm`, `sysvsem`, `opcache` e `mbstring`, mais
`openssl`, `posix` e `readline` da imagem base. O `zz-bootgly.ini` habilita o opcache para a
SAPI CLI e o JIT tracing (buffer de 256 MB), com limite de memória de 256 MB. Sobrescreva
qualquer valor em tempo de execução com `-d`.

### Notas

```text
Usuário    A imagem roda como root de propósito: escutar em :80/:443 — incluindo o
           desafio HTTP-01 do Auto-TLS — exige isso, e o servidor rebaixa os próprios
           workers pelos Configs `user`/`group`. `--user` não é substituição direta:
           projects/ e storage/ nascem com dono root, então uma execução não-root
           precisa dos dois montados do host, com dono daquele uid, e sem porta
           privilegiada.
Parada     O STOPSIGNAL é SIGTERM e o servidor drena o que está em andamento, então
           `docker stop` é um desligamento gracioso.
Coverage   Desabilite o opcache para medições de coverage precisas. O entrypoint É o
           CLI `bootgly`, então alcance o PHP substituindo-o:
           docker run --rm --entrypoint php bootgly/bootgly:<version> \
             -d opcache.enable_cli=0 /bootgly/bootgly test --coverage 102
```
