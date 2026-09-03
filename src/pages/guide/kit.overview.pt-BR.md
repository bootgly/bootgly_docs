# CLI do Kit

O kit que você instalou é um veículo de entrega: você nunca commita nele, tudo que é seu na raiz
(`projects/`, `storage/`, `scripts/`, `tests/`, `public/`) é ignorado pelo git, e cada **release**
do kit é uma tag que pina um conjunto coerente de versões da Bootgly Platform — framework, Console,
Web. `bootgly kit` é o comando do próprio kit: `boot` instala os diretórios em que um kit roda, e
`upgrade`, `downgrade` e `list` o movem entre releases — para frente, para trás, e uma olhada nelas.
Sem `git pull`: os mesmos verbos funcionam num kit clonado e num kit gerado pelo template do GitHub,
cujo histórico squashed não tem upstream de onde puxar.

## Instale os diretórios de recursos

```bash :toolbar="true";
bootgly kit boot
```

Um kit roda sobre três diretórios seus: `scripts/` (copiado do template do framework), `storage/`
(criado com o seu layout — `cache/`, `logs/`, `pids/`, `temp/`, … — o framework não traz
template para ele; `sessions/` e `security/` são criados pelos seus donos, trancados) e `projects/` (com um registro vazio — os Demos do próprio framework nunca
aparecem num kit). O `kit boot` instala o que estiver faltando e nunca toca no que existe; o
uma cópia que falha não deixa nada pela metade, e o registro vem por último, então um boot que falha
deixa o kit por preparar para a próxima execução completar. Você raramente o roda à mão: o
primeiro `projects create` ou `projects import` num kit novo faz o boot por você.

## Veja para onde pode mover

```bash :toolbar="true";
bootgly kit list
```

As releases para onde o kit pode mover, da mais nova para a mais antiga, com onde o kit está:

```text
╔═══════════════╤═════════╤═════════╗
║ Release       │ Commit  │ Status  ║
╟───────────────┼─────────┼─────────╢
║ v1.0.0-beta.8 │ f8bf626 │ newer   ║
║ v1.0.0-beta.7 │ c623e11 │ current ║
║ v1.0.0-beta.6 │ c994f0a │ older   ║
╚═══════════════╧═════════╧═════════╝
```

"Mais nova" é precedência do Semantic Versioning, não ordem de texto: `v1.0.0` fica acima da sua
própria `v1.0.0-rc.1`, `beta.10` acima de `beta.9`, e um kit em `v1.1.0-beta.1` nunca é arrastado
de volta para uma `v1.0.0` estável. Um kit alguns commits depois de uma release mostra
`current (+2 commits)`; um kit cujo commit nenhuma tag alcança (gerado pelo template) mostra
`current (by the Bootgly pin)` — a release que o submódulo do framework entrega.

## Upgrade

```bash :toolbar="true";
bootgly kit upgrade
```

Sem argumento, o kit move para a release **mais nova**. O comando busca as tags de release, faz o
checkout do kit na tag e deixa os submódulos (`Bootgly/`, `Console/`, `Web/`) seguirem os pins que
a tag registra — uma plataforma que você nunca inicializou continua assim. Seus `projects/`,
`storage/` e todo outro diretório ignorado são seus: um movimento nunca escreve neles — e o único
caso em que uma release carrega um arquivo nesse caminho é recusado pelo nome antes de qualquer coisa
mover.

Nomeie uma release para ir exatamente até ela, com ou sem o `v`:

```bash :toolbar="true";
bootgly kit upgrade v1.0.0-beta.8
bootgly kit upgrade 1.0.0-beta.8
```

Rodar de novo é um no-op explícito — "The kit is already on the newest release" — e sai com 0. Um
kit alguns commits depois da release mais nova é *devolvido* a ela (o comando diz isso).

## Downgrade

Algo quebrou depois de subir? Volte com um comando:

```bash :toolbar="true";
bootgly kit downgrade
```

Sem argumento, o kit move para a release **logo abaixo** da atual; com um, para aquela release. Os
verbos são honestos quanto à direção: `upgrade` para uma release mais antiga é recusado com a linha
de `downgrade` a rodar no lugar, e vice-versa.

## Quando ele para

O comando recusa, nomeando o que está no caminho, sempre que um movimento poderia perder algo que
não é do kit perder:

- **Alterações não commitadas nos arquivos do próprio kit** — cada path é listado; commite ou
  guarde com stash. Um `projects/App` sujo nunca é um deles: é ignorado pelo kit e não pode
  bloquear.
- **Um arquivo que a release sobrescreveria** — não rastreado ou ignorado, tanto faz (o git
  sobrescreve um arquivo ignorado em silêncio, e tudo que é seu é ignorado): só os paths exatos que
  a release carrega; um arquivo sem relação, mesmo dentro de um diretório que a release traz,
  sobrevive ao movimento.
- **Um submódulo movido, editado ou com o pin em stage à mão** — a release não pode seguir um
  checkout que alguém escolheu de propósito.

Duas situações perguntam antes de seguir, e `--yes` responde por você (scripts, agentes, CI):

- **Instâncias em execução.** Elas mantêm os arquivos que carregaram até serem reiniciadas, então o
  comando as nomeia e pergunta. Pare-as antes (`bootgly project <Name> stop`) ou recarregue depois
  (`bootgly project <Name> reload`).
- **Travessia de major** (`1.x` → `2.x`, ou de volta).
- **Uma release anterior a este comando.** Mover para abaixo da primeira release que trouxe o
  `bootgly kit upgrade` deixa um kit sem verbo `upgrade` para voltar — o comando avisa e imprime o
  caminho de volta: `git checkout <release>` e depois `git submodule update`, no kit.

```bash :toolbar="true";
bootgly kit upgrade --yes
```

## Scripts e agentes

`--json` transforma toda execução — lista, movimento, no-op ou recusa — num único documento JSON e
não pergunta nada: uma confirmação que seria necessária vira recusa até que `--yes` seja passado.

```bash :toolbar="true";
bootgly kit list --json
bootgly kit upgrade --json --yes
```

```json
{
  "command": "kit",
  "verb": "upgrade",
  "kit": "/srv/app",
  "status": "moved",
  "reason": null,
  "remote": "origin",
  "fetched": true,
  "current": { "tag": "v1.0.0-beta.7", "version": "1.0.0-beta.7", "commit": "c623e11…", "distance": 0, "source": "tag" },
  "target":  { "tag": "v1.0.0-beta.8", "version": "1.0.0-beta.8", "commit": "f8bf626…", "distance": 0, "source": "tag" },
  "releases": [ { "tag": "v1.0.0-beta.8", "version": "1.0.0-beta.8", "commit": "f8bf626…", "current": false }, "…" ]
}
```

`status` é `listed`, `moved`, `noop`, `refused` — ou `partial`: o checkout não se completou (o git
reporta sucesso com parte da árvore por escrever — diretório só-leitura, disco cheio) ou os
submódulos não conseguiram seguir (o documento então carrega o `git submodule update` a rodar, ou o
`git checkout` que volta). Uma recusa carrega `reason` (e `detail`), as guardas acrescentam
`blockers` (what, paths, fix), uma instância viva acrescenta `running`, uma release abaixo da
primeira do comando acrescenta `predates: true`, `added: true` diz que o remote `bootgly` foi
criado por esta execução, `verified` diz que as releases foram conferidas contra o que o remote
canônico anuncia (uma tag de um fork ou de um mirror nunca é release), e `mixed: true` num `list`
diz que um submódulo está fora do pin do kit — um movimento que não se completou, reportado como
`partial` de novo a cada nova tentativa até ser reparado.

## Kits gerados pelo template do GitHub

Um kit criado com "Use this template" tem um commit squashed e nenhum remote apontando para
`bootgly/bootgly.kit`. O primeiro `upgrade` adiciona esse remote como `bootgly`, busca as releases,
localiza o kit pela release do framework que o submódulo `Bootgly/` pina e o move como qualquer
outro kit. Daí em diante é um kit numa release.

## Vindo de um kit instalado antes deste comando

Um kit cujo framework é anterior ao `bootgly kit upgrade` ainda não tem esse verbo. Mova-o uma vez à
mão para a primeira release que o traz — todo movimento depois disso é o comando:

```bash :toolbar="true";
git fetch --tags
git checkout refs/tags/v1.0.0-beta.7
git submodule update
```

> [!NOTE]
> O comando roda de dentro dos próprios arquivos que substitui, então o checkout é a última coisa
> que ele faz: nada é carregado do kit depois dele. Não interrompa os dois passos que seguem
> "Upgrading the kit" — se os submódulos não conseguirem seguir, o comando imprime o
> `git submodule update` a rodar, e o `git checkout` que volta.

## Reference

```php
bootgly kit upgrade [<release>] [--json] [--yes]
```

Move o kit para a release mais nova — ou para `<release>`, um nome de tag com ou sem o `v`
(`v1.0.0-beta.8`, `1.0.0-beta.8`). Uma release mais antiga que a atual é recusada com o comando
`downgrade` a rodar no lugar.

```php
bootgly kit downgrade [<release>] [--json] [--yes]
```

Move o kit para a release logo abaixo da atual — ou para `<release>`. Uma release mais nova que a
atual é recusada com o comando `upgrade` a rodar no lugar. Um kit que não está em release nenhuma
(e não tem pin do framework para ser localizado) precisa nomear a release.

```php
bootgly kit boot [--resources]
```

Instala os diretórios de recursos do kit — o template `scripts/` do framework, o layout de
`storage/` e `projects/` com o registro vazio — cada um só onde ainda não existe. `--resources` nomeia o conjunto padrão
(e, hoje, o único). Recusado no checkout do framework, cujos diretórios são os templates. Sem forma
`--json`.

```php
bootgly kit list [--json]
```

Imprime as releases para onde o kit pode mover, da mais nova para a mais antiga, marcando a atual —
nada move. Como os outros verbos, busca as tags de release antes, adicionando o remote `bootgly` a um
kit que não tem nenhum apontando para o repositório canônico.

Opções — `--json` em todo verbo menos `boot`, `--yes` só em `upgrade` e `downgrade`:

| Opção | Significado |
|---|---|
| `--json` | saída para máquina: um documento JSON, nenhuma confirmação pedida (`--yes` ou recusa) |
| `--yes` | responde toda confirmação de um movimento: instâncias em execução, travessia de major, release anterior ao comando |

As releases vêm do repositório do qual todo kit descende, `https://github.com/bootgly/bootgly.kit`,
pelo remote que aponta para ele — adicionado como `bootgly` quando nenhum aponta — e só as tags que
esse repositório anuncia contam: uma tag de um fork ou de um mirror nunca é release. Um remote que não
pode ser alcançado deixa o `list` mostrar as releases já conhecidas localmente, marcadas como não
verificadas; um movimento espera até o repositório estar alcançável de novo.

```php
Bootgly\ABI\Data\SemVer::parse (string $version): null|SemVer
```

O valor por trás da ordenação: uma primitiva Semantic Versioning 2.0.0 (com `v` inicial
opcional), `null` quando a string não é uma versão. `compare (SemVer $Other): int` ordena duas
versões pela precedência do §11 — build metadata nunca conta.

```php
Bootgly\ACI\VCS->__construct (string $path, null|string $binary = null)
```

O módulo git sobre o qual o comando é construído — com o `SemVer`, a única dependência criada para
ele: `$VCS->Git` roda um comando git por processo filho, sem shell (`execute()`, `query()`,
`resolve()`, `describe()`, `inspect()`, `fetch()`, `checkout()`), `$VCS->Tags->list()` lê as tags
em forma de versão da mais nova para a mais antiga com seus commits e `read()` as notas de uma tag
anotada, `$VCS->Remotes` lista, encontra e adiciona remotes, `$VCS->Submodules` inspeciona e
atualiza os submódulos que a árvore declara.

## Próximas referências

- **[CLI de Logs](/guide/logs/overview/)** — siga as instâncias que você recarregar depois de um movimento.
- **[Plataforma Console](/guide/console-platform/overview/)** — projetos de console e seu ciclo de vida.
