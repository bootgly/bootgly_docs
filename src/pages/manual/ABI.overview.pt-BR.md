# A base do Bootgly

ABI — **Abstract Bootable Interface** — é a primeira camada do framework e aquela sobre a
qual todo o resto se apoia. Arquivos, processos, templates, eventos, cache, primitivas de
string e de array: tudo o que as camadas de cima precisam antes de conseguirem ser um
servidor web ou uma aplicação de console mora aqui.

A propriedade que a define é o que ela **não** pode conhecer. O ABI não depende de nada
acima dele — nem do ACI, nem do ADI, nem da API, nem da CLI ou da WPI. As dependências
fluem em um sentido só (`ABI → ACI → ADI → API → CLI → WPI`), então o ABI pode ser lido,
testado e raciocinado isoladamente, e uma mudança no servidor HTTP nunca alcança lá embaixo.

## Você usa quase sempre sem nomear

É essa a diferença entre o ABI e as camadas de cima. Você abre um banco de dados porque
decidiu; você usa o ABI porque renderizar uma view, ler um arquivo ou atender uma requisição
já usa. A maioria das aplicações nunca escreve `use Bootgly\ABI\...`.

Então leia esta página como um mapa do que o framework é feito, não como uma lista de coisas
para sair chamando.

## O que tem dentro

| Área | O que cobre |
|---|---|
| **Code** | Primitivas de linguagem — `__Array` (operações encadeadas de array em uma passagem) e `__String` (strings cientes de encoding, caminhos, markdown, temas, tokenização de PHP, escapes ANSI) |
| **Templates** | O template engine: diretivas, seções, laços e escaping |
| **IO** | O sistema de arquivos (`FS`) e pipes entre processos (`IPC`) |
| **Resources** | Drivers de cache e de storage atrás de uma interface cada |
| **Events** | O emitter pelo qual todas as camadas publicam |
| **Data** | `Language` para i18n, `Registry` e o codec do protocolo `RESP` |
| **Debugging** | Backtraces, a página de erro, o dumper e o shutdown handler |
| **Differ** | O motor de diff de texto, com calculadores e saídas plugáveis |
| **Syntax** | Builtins do PHP e tratamento de imports, usados pelo linter |
| **Configs** | Os mixins de enum com que os objetos de configuração são montados |

## A parte que você realmente chama

`__Array` é a única peça do ABI escrita para ser chamada direto do código de aplicação,
porque é comprovadamente mais rápida que o idioma nativo que ela substitui:

```php
use Bootgly\ABI\Code\__Array;

new __Array($users)->filter($Active)->map($Name)->collect();
```

Essa cadeia roda todos os estágios em uma passagem só — sem um array intermediário por
estágio — e para antes do fim quando você só quer o primeiro match. Veja
**[__Array](/manual/ABI/Code/__Array/overview/)** para a API completa e as medições por trás.

## Referência

- **[__Array](/manual/ABI/Code/__Array/overview/)** — o Code API de arrays: operações
  encadeadas, terminais com saída antecipada e pipelines reutilizáveis.

As demais áreas são documentadas conforme suas páginas chegam. Até lá o código é a
referência: cada entidade vive em `Bootgly/ABI/` no repositório do framework, espelhando a
tabela acima.
