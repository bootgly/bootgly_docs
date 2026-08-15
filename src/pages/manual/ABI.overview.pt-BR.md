# A base do Bootgly

ABI — **Abstract Bootable Interface** — é a primeira camada do framework, a que sustenta
todas as outras. Arquivos, processos, templates, eventos, cache, primitivas de string e de
array: tudo de que as camadas de cima precisam para virar um servidor web ou uma aplicação
de console está aqui.

O que define o ABI é aquilo que ele não pode enxergar. Ele não depende de nada acima dele —
nem do ACI, nem do ADI, nem da API, nem da CLI, nem da WPI. As dependências correm em um
sentido só (`ABI → ACI → ADI → API → CLI → WPI`), então o ABI pode ser lido, testado e
entendido sozinho, e uma mudança no servidor HTTP nunca chega até ele.

## Você já usa, mesmo sem escrever o nome dele

É aqui que o ABI se separa das camadas de cima. Um banco de dados você abre porque decidiu
abrir; o ABI você usa porque renderizar uma view, ler um arquivo ou responder uma requisição
já passa por ele. A maioria das aplicações nunca chega a escrever um `use Bootgly\ABI\...`.

Então leia esta página como um mapa das peças que formam o framework, e não como uma lista
de coisas para sair chamando.

## O que tem dentro

| Área | O que cobre |
|---|---|
| **Code** | Primitivas de linguagem — `__Array` (operações de array encadeadas em uma passagem) e `__String` (strings que respeitam o encoding, caminhos, markdown, temas, tokenização de PHP, escapes ANSI) |
| **Templates** | O template engine: diretivas, seções, laços e escaping |
| **IO** | O sistema de arquivos (`FS`) e os pipes entre processos (`IPC`) |
| **Resources** | Drivers de cache e de storage, cada grupo atrás de uma interface só |
| **Events** | O emitter por onde todas as camadas publicam |
| **Data** | `Language` para i18n, `Registry` e o codec do protocolo `RESP` |
| **Debugging** | Backtraces, a página de erro, o dumper e o shutdown handler |
| **Differ** | O motor de diff de texto, com calculadores e saídas intercambiáveis |
| **Syntax** | Builtins do PHP e tratamento de imports, usados pelo linter |
| **Configs** | Os mixins de enum que montam os objetos de configuração |

## A parte que você chama de verdade

`__Array` é a única peça do ABI feita para ser chamada direto do código de aplicação, porque
ela é comprovadamente mais rápida que a forma nativa que substitui:

```php
use Bootgly\ABI\Code\__Array;

new __Array($users)->filter($Active)->map($Name)->collect();
```

Essa cadeia roda todos os estágios em uma passagem só — sem um array intermediário por
estágio — e para assim que encontra o primeiro resultado, quando é só isso que você quer.
Veja **[__Array](/manual/ABI/Code/__Array/overview/)** para a API completa e as medições por
trás dela.

## Referência

- **[__Array](/manual/ABI/Code/__Array/overview/)** — o Code API de arrays: operações
  encadeadas, terminais que param no primeiro resultado e pipelines reutilizáveis.

As outras áreas ganham documentação conforme as páginas ficam prontas. Até lá, o código é a
referência: cada entidade fica em `Bootgly/ABI/` no repositório do framework, na mesma
divisão da tabela acima.
