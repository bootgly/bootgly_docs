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
> | `bootgly/bootgly:rc` / `:beta` | `bootgly/bootgly.kit` (a linha estável) — ou `bootgly/bootgly.kit:rc` / `:beta` para continuar acompanhando pre-releases |
> | `bootgly/bootgly:full` | `bootgly/bootgly` (framework + suítes) ou `bootgly/bootgly_benchmarks` |
> | `FROM bootgly/bootgly:<versão>` numa imagem sua | não muda — é exatamente para isso que esta imagem existe |
>
> Tags já publicadas nunca são reescritas: a `bootgly/bootgly:1.0.0-rc.1` mantém os bytes com
> que foi publicada, e os dois workflows de release recusam sobrescrever uma tag de versão
> exata. O que se move são as tags móveis — a `latest`, a `1` e a `1.0` do kit acompanham a
> linha estável, e a `:rc` / `:beta` acompanham a pre-release mais nova do que aquele
> repositório publica hoje —, então fixe uma versão exata se você precisa que uma imagem fique
> onde está. A `:slim`, a `:full` e todas as `*-full` foram **deletadas** em 2026-09-04 e não
> resolvem mais — um pull nelas falha de vez, em vez de entregar em silêncio uma variante cujo
> nome dizia o oposto do conteúdo.
>
> Por que os nomes de variante sumiram: em qualquer outra imagem do Docker Hub, `slim`
> significa uma base de SO menor, não menos software — e a `slim` do Bootgly era o produto,
> enquanto a `full` era o harness de benchmark, ou seja, os nomes diziam o oposto da verdade.

> **A `latest` acompanha a linha estável.** A `bootgly/bootgly.kit` pura é a
> `bootgly/bootgly.kit:latest`, que avança a cada release estável — é ela que todo comando desta
> página usa, e a imagem do framework nunca recebe uma (veja o esquema de tags). Fixar uma
> versão é o que torna um deploy imutável: a `bootgly/bootgly.kit:1.0.0` nunca muda, e a
> `bootgly/bootgly.kit:1` só se move dentro da linha 1.x. Veja [Esquema de tags](#esquema-de-tags).

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

### Voltar ao kit

O wizard fecha quando termina e, com `--rm`, o container é apagado junto. Nada se perde — seus
projetos e seus dados vivem nos dois diretórios montados no host, não no container — mas não
existe container para "voltar a entrar". **Toda volta é um container novo sobre as mesmas
montagens**, e são elas que fazem dele o mesmo kit.

Repetir o comando puro **não** reabre o wizard: a primeira execução deixa um marcador
`projects/.initialized`, que está no volume, então dali em diante um `docker run` simples
imprime a ajuda. Toda inicialização de um kit preparado também reinstala as regras para agentes da
imagem em `projects/AGENTS.md` e `projects/.agents/rules/` quando elas divergem — um `projects/`
montado nunca vê o `kit upgrade`, então é uma imagem nova que as atualiza; os seus próprios arquivos
em outros lugares de `projects/.agents/` nunca são mexidos. Use uma destas formas.

**Rodar um comando.** Qualquer comando explícito vai direto para a CLI do `bootgly`:

```bash :toolbar="true";
docker run -it --rm \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  bootgly/bootgly.kit projects list
```

**Abrir um shell dentro do kit** — o mais próximo de "entrar" nele:

```bash :toolbar="true";
docker run -it --rm \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  --entrypoint bash bootgly/bootgly.kit
```

Você cai em `/bootgly`, com o `bootgly` no `PATH`.

**Criar outro projeto** — o wizard de novo, de propósito: acrescente `projects create`.

**Manter um container de pé** em vez de um novo a cada vez. Tire o `--rm`, dê um nome, e ele
sobrevive até você removê-lo:

```bash :toolbar="true";
docker run -dit --name bootgly \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  -p 8080:8080 \
  --entrypoint bash bootgly/bootgly.kit

docker exec -it bootgly bash     # entra, quantas vezes quiser
docker stop bootgly              # para
docker start -ai bootgly         # sobe e entra de novo
docker rm -f bootgly             # descarta (projects/ e storage/ permanecem)
```

Prefira a forma descartável com `--rm` para comandos avulsos, e o container nomeado quando
quiser uma bancada de trabalho duradoura. De um jeito ou de outro, o estado que importa está
nos dois diretórios.

### Preserve seu trabalho — volumes

`/bootgly/projects` e `/bootgly/storage` são declarados como `VOLUME`. Faça bind-mount dos
dois e seus projetos, logs, PIDs e cache passam a viver no host:

```bash :toolbar="true";
docker run --rm -it \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  bootgly/bootgly.kit projects list
```

Crie os dois diretórios você mesmo antes da primeira execução (`mkdir -p projects storage`). O
Docker cria a origem de um bind-mount ausente como root; um diretório criado por você é seu, e
o que a imagem escreve em `projects/` — o projeto que o wizard gera, os exemplos importados e o
registro de projetos — é entregue a você quando o comando termina, então seu editor e seu
`git` mexem nele sem `sudo`. O `storage/` é do runtime: o que os servidores escrevem nele
continua pertencendo ao root e à conta `bootgly`.

Os workers de um servidor HTTP escrevem a chave e os registros de sessão em
`storage/sessions` como `bootgly`. Numa inicialização como root, o servidor cria esse
diretório quando ele falta e o entrega à conta `bootgly`, só para o dono (`0700`). Um que já
existe e não é um diretório comum de `bootgly` em que só o dono pode escrever — deixado por
uma execução antiga como root, criado por você, um link ou gravável pelo grupo ou por todos —
nunca é cedido: o servidor se
recusa a iniciar e diz qual é e como corrigir:

```
Server not started: storage/sessions is not bootgly's and was left as found: make it bootgly's
yourself. The workers run as bootgly and write there: `chown -R bootgly: /bootgly/storage/sessions`
before starting.
```

Rode esse comando uma vez, dentro do container (`docker run --rm --entrypoint chown … -R
bootgly: /bootgly/storage/sessions`), e inicie de novo. A imagem do kit já traz
`storage/sessions` pertencendo a `bootgly`; um volume de storage criado a partir de uma imagem
mais antiga não tem esse diretório, e o servidor o cria na primeira inicialização como root.
O `storage/cache` continua do root: comandos executados como root leem o que ele guarda. Os
workers mantêm a própria árvore de cache — templates compilados e caches de arquivo padrão — em
`storage/cache-<uid>` (`0700`), que o servidor cria e entrega a `bootgly` numa inicialização como
root, com as mesmas regras (quando não consegue, avisa, e os workers usam um diretório temporário
privado em vez de impedir a subida). Com um `storage/` criado por você no host, nem o root nem
`bootgly` podem confiar na árvore, então os dois guardam seus caches num diretório `bootgly-<uid>/`
privado no diretório temporário do container.

O armazenamento de sessões também recusa um caminho cujos ancestrais outra conta poderia
substituir — um diretório que não é do root nem de `bootgly`, ou gravável pelo grupo ou por
todos. Um `storage/` criado por você no host pertence à sua conta do host, então numa
inicialização como root o servidor sobe, mas avisa que todo acesso à sessão vai falhar. Se o
seu projeto HTTP usa sessões, entregue o diretório montado ao root dentro do container
(`docker run --rm --entrypoint chown … root: /bootgly/storage`) — e retire qualquer permissão
de escrita do grupo ou de todos (`chmod go-w`) — ou deixe o Docker manter o volume (sem bind
mount). O aviso indica o ancestral e o único comando que o resolve.

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

### Um volume que a plataforma monta como root

Plataformas de hospedagem e orquestradores ignoram as declarações `VOLUME` de uma imagem e
montam um volume próprio sobre `/bootgly/storage`: vazio e com dono root. O layout que a
imagem criou no build fica embaixo da montagem, fora de alcance.

A partir da 1.3.0, o entrypoint da imagem do kit prepara esse diretório a cada início como
root, antes de o comando rodar:

```text
/bootgly/storage                                   root      0755   como foi montado — nunca alterado
├── cache/ locks/ pids/ queues/ schedule/ temp/ tests/   root      0755
├── logs/                                                bootgly   0755
└── sessions/                                            bootgly   0700
```

Ou seja, a única coisa a configurar é o caminho da montagem. Para ver isso na sua máquina,
monte um volume que o Docker não semeia a partir da imagem (`nocopy`):

```bash :toolbar="true";
docker run --rm -p 8082:8082 \
  -v storage:/bootgly/storage:nocopy \
  bootgly/bootgly.kit project Demo/HTTP_Server_CLI start -f
```

O que a preparação faz, e o que ela nunca faz:

- **Cria só o que falta.** Um diretório que já existe fica como foi encontrado — dono, modo e
  conteúdo —, então um segundo início não muda nada.
- **Só `logs/` e `sessions/` vão para `bootgly`**, a conta com que os workers rodam, e só
  quando o entrypoint acabou de criá-los. Nada muda de dono recursivamente e nada através de
  um link: o que está dentro desses dois diretórios é dos workers.
- **Espelha a imagem do kit, para a conta do kit.** O mount fica como o `storage/` da própria
  imagem. Um projeto cujo Configs do servidor rebaixa para outro `user:` encontra então um
  `sessions/` que não é dessa conta, e o servidor se recusa a iniciar sobre ele — como já faz
  sobre o `storage/` da própria imagem. Até a 1.2.0 o servidor criava os dois diretórios ele
  mesmo num mount vazio, então essa configuração iniciava ali. Uma camada da imagem nunca
  alcança um mount: entregue os dois diretórios no próprio volume, uma vez (aqui para
  `www-data`):

```bash
docker run --rm -v storage:/bootgly/storage --entrypoint sh bootgly/bootgly.kit -c \
  'cd /bootgly/storage && mkdir -p logs && mkdir -p -m 0700 sessions && chown www-data: logs sessions'
```

- **Uma imagem sem a conta `bootgly` não tem nada preparado** — a imagem do framework: o
  servidor dela cria o que precisa para a conta que o projeto nomeia.
- **A raiz do storage, `pids/` e `cache/` continuam sendo do root** — código que roda como
  root lê o que `cache/` guarda.
- **Um link ou um arquivo onde se espera um diretório interrompe o container**, antes de
  qualquer coisa ser criada, e diz qual:

```
bootgly: storage is not prepared: symbolic link: /bootgly/storage/sessions
```

- **Só prepara uma raiz de storage que é do root e que grupo e outros não podem escrever.**
  Qualquer outra — um diretório seu no host, montado como na seção anterior — fica como está
  e se comporta como descrito lá. Uma origem de bind que o Docker precisou criar é do root, e
  é preparada como um volume.
- **É pulada com `--user`.** Um container que não inicia como root não consegue entregar um
  diretório a outra conta: monte um storage que já seja daquele uid.

### Mover o diretório de storage

Quando o volume não pode ser montado em `/bootgly/storage`, informe o caminho dele na variável
de ambiente `BOOTGLY_STORAGE_DIR`:

```bash :toolbar="true";
docker run --rm -p 8082:8082 \
  -e BOOTGLY_STORAGE_DIR=/data/storage \
  -v storage:/data/storage \
  bootgly/bootgly.kit project Demo/HTTP_Server_CLI start -f
```

O entrypoint prepara esse diretório do mesmo jeito — depois que o framework o aceita —, e
logs, PIDs, sessões, locks e cache passam a viver lá. A variável é do framework, não da imagem: todo comando `bootgly` a lê, num
container ou num host.

O diretório é validado no boot, antes de qualquer outra coisa rodar. Ele precisa ser:

- um **caminho absoluto e canônico** — sem segmento `.` ou `..`, sem separador duplicado, sem
  link simbólico em nenhum ponto (uma `/` final é aceita);
- um **diretório real que já existe** — ele nunca é criado para você, então um caminho
  digitado errado não vira um diretório que morre com o container;
- **do root ou do usuário com que o processo roda**, sem permissão de escrita para o grupo nem
  para outros;
- **sob ancestrais que ninguém mais consegue usar para substituí-lo**: cada um do root ou
  daquele usuário, e sem escrita para grupo ou outros, a menos que tenha o sticky bit.

Um valor que falha numa verificação interrompe o boot com status de saída `1` e uma linha no
stderr que nomeia a verificação e o caminho. Nunca há fallback para o diretório padrão:

```
Bootgly: BOOTGLY_STORAGE_DIR from the environment is refused: group/world-writable (0775): /data/storage
```

Um valor vazio também é recusado: um `${VARIAVEL}` que o Compose não conseguiu resolver
mandaria os dados, em silêncio, para o sistema de arquivos do próprio container.

> **Por que tanto rigor.** Um servidor lançado como root grava ali o estado dos processos, e
> comandos que rodam como root carregam templates compilados de lá — então um diretório que
> outra conta local controla, ou consegue substituir, é código dessa conta rodando como root.
> Pelo mesmo motivo, atenção a de onde um lançamento privilegiado tira o ambiente. O `sudo`
> descarta a variável por padrão: não a inclua em `env_keep` nem conceda `SETENV` a uma conta
> a quem você não daria root. Numa unit do systemd, defina-a com `Environment=` na unit que é
> do root, nunca por um `EnvironmentFile` que outra conta consegue escrever.

**Todo comando precisa do mesmo valor.** Um comando iniciado sem a variável olha para o
diretório padrão: `stop`, `status` ou `reload` não encontram servidor nenhum, e um segundo
`start` guarda o próprio estado à parte. Três lugares a perdem sem avisar:

- **`docker exec`** mantém as variáveis com que o container foi criado (`-e`, `environment:`
  do Compose), não as que um shell exportou depois;
- **`sudo`** a descarta — nomeie-a no próprio comando:
  `sudo env BOOTGLY_STORAGE_DIR=/data/storage bootgly project MyApp stop`;
- **um serviço** inicia sem nenhuma variável do seu shell. O `project <Name> startup` grava a
  variável nos units que gera quando o boot a tomou do ambiente; um unit seu precisa da
  própria linha `Environment=`.

Um launcher que define a constante `BOOTGLY_STORAGE_DIR` ou `BOOTGLY_STORAGE_BASE` antes de o
framework iniciar continua prevalecendo: a variável nem é lida. Todas as recusas estão em
[Recusas do diretório de storage](#recusas-do-diretório-de-storage).

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
docker pull bootgly/bootgly.kit:1.0.0
```

Baixe uma versão exata para cair em um release específico; um `docker pull bootgly/bootgly.kit`
puro (ou `:1`) avança para a estável mais nova.

Os comandos `kit upgrade` e `kit downgrade` recusam dentro da imagem e explicam por quê: a
imagem entrega o *layout* do kit, não um checkout git (o build remove o `.git` de propósito),
então não há nada para eles moverem — e reescrever um sistema de arquivos que o próximo
`docker run` joga fora só pareceria ter funcionado. O `kit list` responde em vez de recusar: a
imagem *é* a release, e as outras releases são tags de imagem. A recusa nomeia o `docker pull`
e imprime a versão que a imagem carrega.

### Construir a imagem do kit você mesmo

```bash
docker build -f Dockerfile --target kit \
  --build-arg BOOTGLY_VERSION=1.0.0 \
  -t bootgly.kit:1.0.0 .
```

Rode a partir de um clone do repositório
[`bootgly.kit`](https://github.com/bootgly/bootgly.kit). O build não pega **nada** do build
context: ele faz git clone do kit na tag do release, com submódulos, então uma única tag fixa
framework + Console + Web e a imagem se reproduz só a partir da tag. Duas consequências: o
build precisa de rede, e ele sempre constrói um ref *pushado* — trabalho não commitado nunca
entra na imagem. Para construir outro ref:

```bash
docker build -f Dockerfile --target kit \
  --build-arg BOOTGLY_VERSION=1.0.0 \
  --build-arg BOOTGLY_KIT_REF=main \
  -t bootgly.kit:main .
```

## Deploy em produção

Em produção o código faz parte da imagem e só o estado de runtime vive num volume. São quatro
peças: uma imagem sua construída sobre o kit, o volume de storage, as migrations como etapa do
deploy e o health probe.

### Construa a sua imagem

Mantenha o diretório `projects/` do seu kit — o registro de projetos `Bootgly.projects.php` e
as pastas dos projetos — ao lado de um `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM bootgly/bootgly.kit:1.3.0

# O código vai dentro da imagem: produção não monta volume sobre /bootgly/projects
COPY projects/ /bootgly/projects/

# O health probe que o orquestrador lê (veja abaixo)
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8080}/health" || exit 1

# O servidor, em foreground
CMD ["project", "MyApp", "start", "-f"]
```

```bash
docker build -t my-app .
```

Fixe uma versão exata do kit: um deploy não pode mudar porque a `latest` andou. Mantenha os
segredos fora da imagem — deixe todo arquivo `.env` e todo repositório fora do build context
com um `.dockerignore` ao lado do `Dockerfile`, e defina as mesmas chaves como variáveis de
ambiente na execução: um config lê o ambiente do processo antes de qualquer arquivo `.env`.

```
**/.env*
**/.git
```

### Monte o volume de storage

Sessões, logs, locks e filas precisam sobreviver a um redeploy, então `storage/` é o único
volume:

```bash
docker run -d --name my-app -p 8080:8080 \
  -v my-app-storage:/bootgly/storage \
  my-app
```

Numa plataforma, monte o volume dela em `/bootgly/storage` — ele chega vazio e com dono root,
e o entrypoint o prepara (veja [Um volume que a plataforma monta como
root](#um-volume-que-a-plataforma-monta-como-root)). Monte o volume de verdade ali, nunca um
link para ele: o framework recusa um diretório de storage que seja link simbólico. Se a
plataforma só monta em outro lugar, aponte `BOOTGLY_STORAGE_DIR` para esse caminho.

### Rode as migrations antes do deploy

Migrations são uma etapa do deploy, não do início do servidor: todas as réplicas disputariam
para aplicá-las. Rode uma vez, com a imagem que está prestes a entrar no ar, e só inicie os
servidores quando o comando sair com `0`:

```bash
docker run --rm \
  -e DB_HOST=db.internal -e DB_NAME=app -e DB_USER=app -e DB_PASS \
  my-app project MyApp migrate up
```

É o comando de *pre-deploy* (ou *release*) de uma plataforma de hospedagem, um init container
no Kubernetes, ou um serviço avulso do qual o servidor depende (`depends_on` com
`condition: service_completed_successfully`) no Compose. O fluxo em si está em
**[Migrations de banco](/guide/database-migrations/overview/)**.

### Ligue o health probe

Ative o endpoint de health nativo nos Configs do servidor do projeto — ele responde antes de
qualquer middleware, então rate limit ou autenticação nunca derrubam um probe:

```php
new Configs(
   host: '0.0.0.0',
   port: getenv('PORT') ? (int) getenv('PORT') : 8080,
   user: 'bootgly',
   group: 'bootgly',
   health: '/health',
)
```

O `HEALTHCHECK` do Dockerfile acima passa então a marcar o container como `healthy` assim que
o servidor responde, e o probe de uma plataforma usa o mesmo caminho:

```bash
curl -s http://127.0.0.1:8080/health
# {"status":"ok"}
```

Veja em **[Observabilidade](/guide/observability/overview/)** o que o endpoint responde e
quando.

### Um cliente PostgreSQL, quando você precisar

A imagem do kit não traz cliente de banco: uma aplicação fala com o banco pelo framework. Se o
seu deploy precisa do `psql` — um bootstrap único de role ou schema, um shell de operação —,
acrescente uma linha à sua imagem:

```dockerfile
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client \
 && rm -rf /var/lib/apt/lists/*
```

## Construir sobre a imagem do framework

A `bootgly/bootgly` é o framework e nada mais — o ingrediente com que você compõe. Use quando
for publicar sua própria imagem e não quiser as plataformas do kit nem o registro de projetos
dele.

O `<version>` abaixo é um placeholder para uma tag real — a `1.0.0` é a primeira publicada
**depois** desta divisão: tudo até a `1.0.0-rc.1` é a imagem antiga, em formato de produto, e
essas tags nunca são reescritas. Este repositório não publica `latest`, então o `FROM` sempre
nomeia uma tag: uma versão exata (`bootgly/bootgly:1.0.0`) ou o major (`bootgly/bootgly:1`),
que acompanha a linha estável 1.x; `:rc` / `:beta` seguem apenas pre-releases. Escolha a
versão em [a lista de tags](https://hub.docker.com/r/bootgly/bootgly/tags).

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

Fixe uma versão exata no `FROM` (`bootgly/bootgly:1.0.0`) quando a imagem precisa se reproduzir
byte a byte; fixe o major (`bootgly/bootgly:1`) para avançar a cada release 1.x sem mexer no
Dockerfile.

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
`latest`, e uma versão gravada no Dockerfile envelheceria e passaria a medir, em silêncio, um
framework mais antigo do que o que você queria comparar. Nomear a tag é o que faz um run dizer
contra qual Bootgly ele correu.

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
`docker pull bootgly/bootgly.kit` puro entregaria código de pre-release a todo mundo. A `latest`,
a `1` e a `1.0` acompanham a linha estável; uma versão exata (`1.0.0`) nunca se move. Os apelidos
de canal (`rc`, `beta`) são tags móveis que você escolhe usar deliberadamente: cada um acompanha
a pre-release mais nova do seu tipo e fica parado quando uma estável sai — depois da `1.0.0`, a
`:rc` continua nomeando a `1.0.0-rc.1` até a próxima release candidate ser publicada.

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
/bootgly/storage    VOLUME (imagem do kit) — logs, PIDs, cache, locks, queues, temp, tests;
                    movido por BOOTGLY_STORAGE_DIR
/bootgly            WORKDIR · symlink em /usr/local/bin/bootgly
/bootgly/Bootgly    o framework, dentro da imagem do kit
/bootgly_benchmarks os casos de benchmark (apenas nas imagens de benchmark)
/usr/local/etc/php/conf.d/zz-bootgly.ini   tuning de opcache + JIT
```

### Variáveis de ambiente

```text
PORT              Sobrescreve a porta de escuta de um servidor
AI_AGENT          Qualquer valor não vazio seleciona a saída de testes legível por máquina
BOOTGLY_STORAGE_DIR  Move o diretório de storage (padrão: <kit>/storage). Lida pelo
                  framework no boot — dentro ou fora de um container — e pelo entrypoint.
                  Um caminho absoluto e canônico para um diretório real que já existe,
                  do root ou do usuário em execução, que ninguém mais consegue escrever
                  ou substituir; um valor inseguro ou vazio interrompe o boot, sem
                  fallback. Uma constante de mesmo nome definida antes do boot prevalece
BOOTGLY_DOCKER    Definida como 1 pelas duas imagens publicadas; muda apenas a redação da recusa
                  do `kit` (aqui, releases são tags de imagem). Nada mais lê essa variável —
                  em qual imagem você está é decidido pelo layout em disco, então defini-la
                  na mão não faz um teste nem uma recusa dizer algo falso
DB_HOST DB_PORT   Apenas nas imagens de benchmark — apontam para o PostgreSQL local
DB_NAME DB_USER   do container e podem ser sobrescritas com `docker run -e`
DB_PASS
```

### Recusas do diretório de storage

O que um boot com `BOOTGLY_STORAGE_DIR` no ambiente imprime depois de `Bootgly:
BOOTGLY_STORAGE_DIR from the environment is refused:`, na ordem em que as verificações rodam.
A primeira que falha encerra o boot.

| Recusa | O valor |
|---|---|
| `empty value` | está definido, e vazio |
| `not an absolute path: <value>` | não começa com `/` |
| `the filesystem root: <value>` | é `/` |
| ``not canonical (an empty, `.` or `..` segment): <value>`` | tem um segmento `.` ou `..`, um separador duplicado ou mais de uma `/` final |
| `its owner cannot be verified (the posix extension is missing): <path>` | não pode ser verificado por este PHP |
| `does not exist or cannot be inspected: <path>` | não aponta para nada, ou aponta para algo sob um diretório que o processo não consegue percorrer |
| `symbolic link: <path>` | aponta para um link |
| `not a directory: <path>` | aponta para um arquivo |
| `not canonical (resolves to <target>): <path>` | passa por um link simbólico |
| `owner <uid> is neither the effective user (<uid>) nor root: <path>` | pertence a outra conta |
| `group/world-writable (<mode>): <path>` | pode ser escrito pelo grupo ou por outros |
| `ancestor cannot be inspected: <ancestor>` | está sob um diretório que o processo não consegue inspecionar |
| `ancestor owner <uid> is neither the effective user (<uid>) nor root: <ancestor>` | está sob um diretório de outra conta — num user namespace, qualquer conta que ele não mapeia, inclusive o root do host |
| `ancestor group/world-writable without the sticky bit (<mode>): <ancestor>` | está sob um diretório que o grupo ou outros podem escrever |

O entrypoint da imagem do kit interrompe um início como root com `bootgly: storage is not prepared:`
seguido de `symbolic link: <path>`, `not a directory: <path>`, `cannot be inspected: <path>`,
`cannot create: <path>` ou `cannot give to bootgly: <path>`.

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
  $(php @/__docker__/provenance.php . ../bootgly_benchmarks --docker-build-args) \
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
           desafio HTTP-01 do Auto-TLS — exige isso, e os servidores rebaixam os
           workers para a conta `bootgly` que a imagem traz: um projeto criado pelo
           wizard a nomeia nos Configs `user`/`group` do servidor, e um projeto sem
           nada configurado a assume por padrão quando lançado como root. O que o
           root escreve num projects/ montado é entregue ao dono do diretório; o
           storage/ continua sendo do runtime, e um início como root prepara um
           que foi montado vazio e com dono root. `--user` não é substituição direta:
           uma execução não-root precisa dos dois montados do host, com dono
           daquele uid, e sem porta privilegiada.
Parada     O STOPSIGNAL é SIGTERM e o servidor drena o que está em andamento, então
           `docker stop` é um desligamento gracioso.
Coverage   Desabilite o opcache para medições de coverage precisas. O entrypoint É o
           CLI `bootgly`, então alcance o PHP substituindo-o:
           docker run --rm --entrypoint php bootgly/bootgly:<version> \
             -d opcache.enable_cli=0 /bootgly/bootgly test --coverage 102
```
