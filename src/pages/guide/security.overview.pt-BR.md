# Segurança

Esta página é para pesquisadores de segurança e engenheiros auditando o Bootgly. Ela diz onde
reportar, o que está no escopo, como colocar um alvo no ar e — o mais útil — como transformar
um problema suspeito em uma PoC reproduzível dentro do próprio runner de testes do framework.

Se você só precisa do endereço: **cybersec@bootgly.com**, privado, sem issue pública.

## Reportar uma vulnerabilidade

Envie vulnerabilidades suspeitas para **cybersec@bootgly.com**. Não abra issue pública no
GitHub para nada explorável.

Inclua:

- **Componente** — camada + classe, ex. `WPI/Nodes/HTTP_Server_CLI/Decoders/Decoder_Chunked`
- **Reprodução** — passos, ou melhor, uma PoC (o formato que usamos internamente está abaixo)
- **Impacto que você avalia** — DoS, vazamento de informação, bypass de auth/framing, RCE,
  escalação de privilégio
- **Versão/commit** testado

Você recebe confirmação em até 48 horas e atualizações de progresso enquanto investigamos.

**Divulgação:** coordenada. Pedimos que segure a divulgação pública até o fix sair, ou
**90 dias** a partir do seu report, o que vier primeiro. Assim que o fix é publicado, creditamos
você nas notas de release, a menos que prefira anonimato.

Não há bug bounty hoje. Um programa pode vir depois da 1.0.

## Escopo

**No escopo** — o core do framework (`bootgly/bootgly`) e os repositórios de plataforma
(`bootgly-console`, `bootgly-web`): decoders/encoders de protocolo, roteamento, middlewares,
sessão/auth, drivers de banco e todo componente nativo desses repositórios.

**Fora do escopo** — `bootgly_website`, `bootgly_docs`, `bootgly_benchmarks`, `bootgly_awesome`
e repositórios de ferramentaria, a menos que o bug leve de volta ao core. Testes de negação de
serviço contra infraestrutura compartilhada (site, hosts de benchmark, CI) e ataques de
engenharia social ou físicos estão sempre fora do escopo.

## Colocar um alvo no ar

Um servidor local é o alvo mais rápido. Nada aqui precisa de Docker ou root:

```bash
git clone https://github.com/bootgly/bootgly
cd bootgly
./bootgly project Demo/HTTP_Server_CLI start
```

Isso sobe um servidor HTTP/1.1 + h2c que você pode dirigir com sockets raw. Para a superfície
de TLS e AutoTLS, veja o guia de [Auto-TLS](/auto-tls) — `staging: true` aponta a emissão para
a CA de staging da Let's Encrypt, então você nunca queima rate limit testando.

Duas coisas que vale saber antes de começar a cutucar:

- O Bootgly é **zero-dependency**. Não há pacote de terceiro dentro do trust boundary, então
  todo parser, toda chamada de cripto e todo caminho de socket é código do framework que você
  pode ler.
- O servidor é **multiprocesso e long-lived**. Workers persistem entre requisições, então
  vazamento de estado entre requisições é uma classe real e produtiva — vários achados
  anteriores foram exatamente isso.

## Escreva a PoC como teste nativo

Esta é a parte que mais importa, e é o que torna um report acionável para nós.

O Bootgly tem framework de testes próprio, e todo achado de segurança confirmado vira uma
regressão permanente na suite de segurança do servidor HTTP:

```text
Bootgly/WPI/Nodes/HTTP_Server_CLI/tests/Security/NN.MM-snake_case_description.Test.php
```

Uma PoC de segurança ali segue uma regra: **ela precisa falhar no código vulnerável com um
diagnóstico explícito do achado, e passar assim que o fix entrar.** Essa única propriedade é o
que separa um achado de uma hipótese.

### Use a API primitiva, não a avançada

A suite de testes do Bootgly expõe vários níveis de API de propósito. Para uma PoC, use a
**mais primitiva** — o formato `Test` abaixo, em que você retorna uma request string
raw e sua asserção retorna `true` ou uma mensagem de falha.

Isso não é atalho, é a ferramenta certa. Uma PoC existe para *provar algo, custe o que custar*:
você pode precisar abrir sockets raw, forkar processos, escrever arquivos, dirigir um segundo
protocolo ou reproduzir uma corrida. A API de asserção de nível mais alto é expressiva e
organizada, mas ela te prende ao que o vocabulário dela consegue expressar — e uma prova que
precisa brigar com o próprio harness costuma acabar provando menos do que deveria.

O formato primitivo te dá uma closure simples com liberdade total, e reduz todo o veredito a
dois valores:

- retorne `true` → a garantia se mantém
- retorne uma `string` → a garantia foi quebrada, e a string **é** a sua evidência

Escreva o diagnóstico como o próprio achado (`'CONFIRMED H1: ...'`), incluindo os bytes ou o
estado observado. Quando falhar, o runner imprime exatamente isso — que é o que um revisor
precisa para acreditar em você.

Guarde a API avançada para testes de funcionalidade comuns, onde a estrutura compensa. Aqui,
liberdade de escrita importa mais que forma.

O formato:

```php
<?php

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Tests\Suite\Test;


$probe = ['error' => '', 'observed' => null];

return new Test(
   description: 'o que o servidor precisa garantir',

   // Roda no lado cliente: dirige sockets raw, cria processos, registra evidência.
   request: static function (string $hostPort, int $testIndex) use (&$probe): string {
      // ... abra um socket para $hostPort, envie seu ataque, registre em $probe ...

      return "GET /harness HTTP/1.1\r\n"
         . "X-Bootgly-Test: {$testIndex}\r\n"
         . "Host: localhost\r\nConnection: close\r\n\r\n";
   },

   // O(s) handler(s) que este caso instala.
   response: static function (Request $Request, Response $Response, Router $Router) {
      yield $Router->route('/harness', static function (Request $Request, Response $Response) {
         return $Response(body: 'HARNESS-OK');
      }, GET);
   },

   // Retorna true para passar, ou uma string para falhar com aquela mensagem.
   test: static function (string $response) use (&$probe): bool|string {
      if (! str_contains($response, 'HARNESS-OK')) {
         return 'harness não alcançou seu handler';
      }

      if ($probe['observed'] === 'the-bad-thing') {
         return 'CONFIRMED: <o que o servidor fez e não podia fazer>';
      }

      return true;
   },
);
```

Registre o nome do arquivo no `autoboot.php` daquele diretório e rode só o seu caso:

```bash
AI_AGENT=1 bootgly test <suite> <case>
```

`AI_AGENT=1` imprime JSON legível por máquina, bem mais fácil de ler que a TUI enquanto você
itera. O índice da suite vem da ordem em `tests/autoboot.php`.

### Controles não são opcionais

Uma PoC sem controles não prova nada, e essa é a fraqueza mais comum em um report. Todo caso
deve responder: *se minha perna de ataque tivesse falhado silenciosamente, este teste ainda
pareceria uma confirmação?*

Inclua no mínimo:

- **Um controle positivo** — a versão legítima da mesma operação precisa continuar funcionando.
  Se você propõe um fix, é isso que impede "rejeitar tudo" de passar.
- **Um controle negativo** — uma variante que as guardas existentes já tratam precisa continuar
  sendo recusada, isolando o achado à lacuna real.
- **Um controle de harness** — o handler selecionado precisa ter sido alcançado, para que um
  fixture quebrado não seja confundido com servidor vulnerável.

Um exemplo concreto de um achado passado: um token de chunk-size com overflow contrabandeou uma
requisição, mas o caso também provava que um corpo chunked *legítimo* ainda completava **e**
ainda fazia pipelining do seguinte — senão um fix que simplesmente quebrasse pipelining teria
"passado".

### Faça teste de mutação na sua PoC

Se o seu caso passa no código atual e você acredita que o problema é real, mute a guarda que
você acha que está faltando — apague a linha, inverta a condição — e rode de novo. Se o caso
ainda passar, o caso é vazio, não o código seguro. Foi exatamente assim que descobrimos que um
achado previamente reportado já estava fechado.

## O que já está endurecido

Antes de reportar, vale conferir as auditorias fechadas — três passagens adversariais
holísticas já rodaram contra a superfície exposta à rede, e seus achados estão listados com
severidade no [`SECURITY.md`](https://github.com/bootgly/bootgly/blob/main/.github/SECURITY.md).

De forma geral, estas classes já têm cobertura e regressões dedicadas:

- **Framing de requisição** — conflitos `Content-Length`/`Transfer-Encoding`, overflow de
  chunk-size, bare-LF no head, field-names fora de `tchar`, caps de tamanho do head, validação
  do token de protocolo
- **Estado entre requisições** — caches de decoder, reuso de request por conexão, contexto de
  execução deferida (Fiber), regeneração de sessão e rotação de CSRF
- **HTTP/2** — rapid reset (CVE-2023-44487) incluindo streams flow-stalled, orçamento de backlog
  de saída, validação HPACK, conformidade de pseudo-headers e flow-control
- **Exaustão de recursos** — tetos de conexão, caps de body/multipart, orçamento agregado de
  disco para upload, amplificação por byte-range
- **Boot privilegiado** — handoff do store do AutoTLS, identidade do processo helper e egress
  ACME (política de origem, negação de redirect, classificação de endereço)

Achar um ângulo *novo* em qualquer um desses é bem-vindo — o ponto é que um report dizendo "não
há rate limit" ou "corpos chunked são ilimitados" já está coberto.

## Referência

### Reporte

```text
cybersec@bootgly.com
```

Endereço de divulgação privada. Confirmado em até 48 horas; divulgação coordenada na publicação
do fix ou em 90 dias, o que vier primeiro.

### Rodar a suite de segurança

```bash
AI_AGENT=1 bootgly test <suite> <case>
```

Roda um único caso no runner nativo do framework. `AI_AGENT=1` troca a saída para JSON. Omita
`<case>` para rodar a suite inteira, ou omita ambos para rodar todas as suites registradas.

A suite de segurança do servidor HTTP fica registrada **comentada** em `tests/autoboot.php`,
para que um `bootgly test` simples não execute payloads adversariais por padrão. Habilite
localmente enquanto trabalha e restaure o comentário antes de commitar.

### Ajustes de endurecimento que valem revisar num deployment

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Configs as RequestConfigs;


$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 443,
      workers: 8,
      maxConnections: 10000,
      maxConnectionsPerIP: 100
   ),
   new RequestConfigs(
      maxBodySize: 8 * 1024 * 1024,
      maxFileSize: 4 * 1024 * 1024,
      downloadsMaxBytesOnDisk: 512 * 1024 * 1024
   )
);
```

Tetos de conexão e caps de body/upload são decisões de capacidade por deployment. O framework
entrega padrões seguros, não capacidade infinita — dimensione para o seu perfil de tráfego.

```php
Request::$allowedHosts = ['example.com', 'www.example.com'];
```

Allowlist de Host. Com ela definida, uma requisição cuja autoridade `Host` não esteja listada é
recusada antes do roteamento, o que também bloqueia envenenamento de host-header na geração de
URLs absolutas.

```php
new TrustedProxy(/* ... */)
```

Só habilite confiança em headers de proxy para proxies que você realmente controla. Desabilitado,
`$Request->address` continua sendo o peer observado pelo kernel e não pode ser forjado por um
header do cliente.

### Onde fica a evidência

```text
Bootgly/WPI/Nodes/HTTP_Server_CLI/tests/Security/
```

A PoC de cada achado confirmado, mantida como regressão permanente. Ler esses arquivos é o jeito
mais rápido de aprender tanto a superfície de ataque quanto o estilo de asserção que esperamos
num report.

```text
docs/reports/security/
```

Relatórios completos de auditoria — threat model, análise por achado, a classe de evidência por
trás de cada afirmação e a remediação aplicada. Achados que fecharam um caminho principal mas
deixaram de fora uma superfície relacionada mais estreita dizem isso explicitamente, em vez de
absorver silenciosamente.
