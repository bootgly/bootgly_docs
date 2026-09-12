# Versionamento

O Bootgly segue o [Semantic Versioning 2.0.0](https://semver.org/). Esta página é a promessa de
compatibilidade por trás de um número de versão: o que uma atualização pode mudar, o que não
pode, por quanto tempo uma release é suportada e como uma API descontinuada sai do framework.

## O que um número de versão promete

| Incremento | Exemplo | O que pode mudar |
| --- | --- | --- |
| **Patch** | `1.2.3` → `1.2.4` | Reparos de comportamento existente. Nada documentado muda de significado. |
| **Minor** | `1.2.4` → `1.3.0` | Novas capacidades. Tudo que funcionava e estava documentado continua funcionando igual. |
| **Major** | `1.3.0` → `2.0.0` | Remoções, renomeações, semântica alterada — qualquer coisa que possa quebrar uma aplicação. |

Concretamente, as mudanças a seguir são **major** e nunca saem numa release `1.x`:

- Remover ou renomear uma classe, método, propriedade, chave de config, comando ou opção de CLI
  públicos.
- Mudar a semântica estabelecida de uma API pública — outro retorno, outro default, outro efeito
  colateral para a mesma chamada documentada.
- Adicionar um método obrigatório a uma interface que aplicações implementam (um handler, um
  driver, um contrato de middleware).
- Quebrar compatibilidade de wire ou de storage: um registro de cache, uma sessão, um job de fila
  ou um arquivo de PID/estado escrito por uma `1.x` é legível por qualquer `1.x` posterior.

E estas **não** são mudanças que quebram — uma minor ou uma patch pode fazê-las:

- Adicionar métodos, propriedades, chaves de config, comandos ou parâmetros opcionais.
- Apertar a validação de uma entrada que a documentação já declarava inválida.
- Corrigir um comportamento que contradizia a documentação (a documentação é o contrato).
- Mudar qualquer coisa não documentada ou marcada `@internal`.

## Atualizando

Entre minors `1.x`, atualizar é trocar o número da versão, não fazer uma migração:

```bash
composer require bootgly/bootgly:^1.3
bootgly test <suite>      # as suas próprias suítes
```

Leia as notas na [release do GitHub](https://github.com/bootgly/bootgly/releases) — elas são o
changelog — e aja sobre qualquer aviso de descontinuação que elas tragam. Uma plataforma baseada
no kit atualiza o framework pinado com `bootgly kit upgrade`.

## O que é API pública

A API pública é **o que a documentação descreve**: os guias e o manual deste site, o PHPDoc dos
membros públicos, a saída de `--help` da CLI e as chaves de configuração documentadas. Uma classe
ou método ser `public` em PHP não a torna API pública por si só — se não está documentada, ou
está marcada `@internal`, pode mudar em qualquer release.

## Política de descontinuação

- Uma API substituída é **descontinuada na minor que traz a substituta**: a doc diz isso, as
  notas de release listam, e usá-la emite um aviso `E_USER_DEPRECATED` onde existe um gancho em
  runtime.
- **Uma descontinuação nunca autoriza uma remoção na minor seguinte.** O jeito descontinuado
  continua funcionando, inalterado, até a próxima major.
- A próxima major (`2.0.0`) remove o que foi descontinuado durante a `1.x` — nada que não tenha
  sido descontinuado antes é removido.

## Política de suporte

| Versão | Correções de bug | Correções de segurança |
| --- | --- | --- |
| Minor `1.x` mais recente | ✅ | ✅ |
| Minors `1.x` anteriores | ❌ | ❌ — atualize para a minor mais recente |
| Pré-releases `-beta` / `-rc` | até sair a release que precedem | até sair a release que precedem |
| `0.x` | ❌ | ❌ |

As correções saem como **patches da minor mais recente**; não há backports. Como uma atualização
de minor é desenhada para ser só uma troca de versão, manter-se atualizado é o caminho suportado.
A `1.0` **não** é uma linha de suporte de longo prazo (LTS): uma linha LTS pode ser declarada para
uma minor posterior, e seria anunciada nas notas de release e listada aqui; ela não é prometida.

Cada minor `1.x` acompanha as **duas minors mais novas do PHP** (`8.4+` na `1.0`). Abandonar uma
versão do PHP que o framework ainda suporta é uma mudança major; adotar uma nova é uma minor.

## Pré-releases

Tags `-beta.N` e `-rc.N` precedem uma release e não carregam promessa de compatibilidade entre
si. Só são suportadas até sair a release que precedem. No Docker Hub uma pré-release nunca move
`latest` nem os aliases `1`/`1.x` — só a tag exata e o alias de canal `beta`/`rc`.

Os repositórios de plataforma (`bootgly-console`, `bootgly-web`) e o kit inicial (`bootgly.kit`)
são tagueados em sincronia com o framework e seguem as mesmas regras.

## Referência

### String de versão

```text
{MAJOR}.{MINOR}.{PATCH}[-{beta|rc}.{N}]
```

A tag git carrega o prefixo `v` (`v1.2.3`); `BOOTGLY_VERSION` e as tags Docker não. Entre
releases a `main` reporta o próximo alvo com o sufixo `-dev` (`1.3.0-dev`); essa string nunca é
tagueada nem publicada.

### Convenção de commits

```text
<type>(<scope>): <description>
```

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). `feat` sai numa
minor, `fix` numa patch, `!` ou um rodapé `BREAKING CHANGE:` numa major.

### Política de segurança

```text
https://github.com/bootgly/bootgly/blob/main/.github/SECURITY.md
```

Versões suportadas para correções de segurança, os canais privados de report e o histórico de
auditorias. Veja também o [guia de Segurança](/guide/security/overview/).
