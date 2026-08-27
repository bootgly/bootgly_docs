# HTTP Server CLI — Response

## Visão Geral

O objeto `Response` está automaticamente disponível em todo handler de rota do HTTP Server CLI. Ele fornece uma API fácil de usar para gerenciar respostas HTTP — configurando status, cabeçalhos e conteúdo do corpo, além de facilitar renderização de views, uploads de arquivos, autenticação e redirecionamentos.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
```

## Uso

A seguir estão os métodos fornecidos pelo objeto `Response` com exemplos demonstrando seu uso.

### Invocação

```php
public function __invoke (int $code = 200, array $headers = [], string $body = '') : self;
```

**Descrição:**

Este método mágico permite que o objeto Response seja invocado como uma função, redefinindo a resposta com os parâmetros fornecidos.

**Exemplo:**

```php
return $Response(404, ['Content-Type' => 'text/plain'], 'Não encontrado');
```

### Acrescentar dados ao corpo

```php
public function append ($body);
```

**Descrição:**

Anexa dados ao corpo da resposta.

**Parâmetros:**

- `$body` (mixed): Dados para anexar ao corpo da resposta.

**Exemplo:**

```php
return $Response->append('Informação adicional');
```

### Renderizar uma view

```php
$Response->View->render(string $view, null|array $data = null, null|Closure $callback = null): Response;
```

**Descrição:**

Renderiza uma view do projeto pelo response resource built-in `View` e anexa o resultado ao
corpo da resposta.

**Parâmetros:**

- `$view` (string): A visualização a ser renderizada.
- `$data` (array|null, opcional): Dados para passar para a visualização.
- `$callback` (Closure|null, opcional): Um callback adicional executado após a renderização da visualização.

**Exemplo:**

```php
return $Response->View->render('boas-vindas', ['title' => 'Página de Boas-Vindas']);
```

### Enviar conteúdo

```php
public function send ($body = null, ...$options) : self;
```

**Descrição:**

Finaliza a resposta configurando o conteúdo do corpo e enviando a resposta para o cliente.

**Parâmetros:**

- `$body` (mixed|null, opcional): Conteúdo opcional do corpo para enviar.
- `...$options` (mixed): Opções adicionais que podem ser passadas, especificidades dependem da implementação.

**Exemplos:**

```php
return $Response->send('{"status":"sucesso"}');
```

```php
return $Response->JSON->send(['Olá' => 'Mundo!']);
```

### Resources para I/O deferido

Use `defer()` para trabalho de resposta que precisa aguardar I/O externo. Response Resources
carregados com `responseResources` podem conectar esse I/O ao scheduler da resposta, mas a
resposta ainda é finalizada pelo fluxo normal de `send()`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return $Response->defer(function (Response $Response): void {
   $Database = $Response->Database;
   $Result = $Database->fetch('SELECT 1 AS ok');

   $Response->JSON->send([
      'rows' => $Result->rows,
   ]);
});
```

Veja **[Response Resources](./Resources/)** para resources built-in e a ponte com o DBAL.

### Enviando arquivos

```php
public function upload (string $file, int $offset = 0, null|int $length = null, bool $close = true) : self;
```

**Descrição:**

Envia arquivo para o cliente HTTP.

**Parâmetros:**

- `$file` (string): O caminho do arquivo para upload.
- `$offset` (int): O deslocamento dos dados.
- `$length` (int|null): O comprimento dos dados para upload.
- `$close` (bool): Fechar a conexão após o envio.

**Exemplo 1:**

```php
return $Response->upload('/caminho/para/arquivo.pdf');
```

**Exemplo 2:**

```php
return $Response('statics/alphanumeric.txt')->upload(offset: 0, length: 2);
```

**Byte-ranges:**

Um cabeçalho `Range` do cliente sobrepõe `$offset` / `$length`. O conjunto aceito é coalescido — ranges sobrepostos e adjacentes são fundidos — e um conjunto maior que [`Request::$maxRanges`](../Request/#limite-de-byte-ranges) (16 por padrão) é rejeitado com `416 Range Not Satisfiable`. Um valor de `Range` que nem chega a ser um ranges-specifier — sem o separador `=`, ex. `Range: bytes 0-1` — é rejeitado com `400 Bad Request` (a RFC 9110 §14.2 permite ao servidor ignorar ou rejeitar; o Bootgly rejeita).

**Identidade da representação:**

O `upload()` resolve o caminho, abre uma vez e registra a identidade do que abriu — device, inode, mode, tamanho, data de modificação e data de mudança — e então fecha o descritor. Nada fica aberto enquanto a resposta espera por um cliente lento, então o servidor reabre o arquivo a cada pedaço que escreve e confere essa identidade de novo toda vez, tanto em HTTP/1 quanto em HTTP/2.

Se o arquivo não corresponder mais, a resposta é recusada em vez de completada com os bytes errados: em HTTP/1 a conexão é fechada (não há como retirar um `Content-Length` já enviado), e em HTTP/2 o stream é resetado. Um aviso nomeando o caminho e o campo que mudou vai para o log.

Duas consequências ficam por sua conta:

- **Não sirva um arquivo enquanto ele está sendo escrito.** Qualquer mudança — um append, uma reescrita, um redeploy atômico, até um `chmod` ou `chown` que só mexe na data de mudança — aborta uma transferência já em andamento. O `stat` não distingue um append inofensivo de uma substituição, então a checagem não tem como abrir exceção para um deles. Tire um snapshot antes:

  ```php
  $Router->route('/logs/download', function ($Request, $Response) {
     $snapshot = 'storage/snapshots/' . bin2hex(random_bytes(8)) . '.log';
     copy(BOOTGLY_PROJECT->path . 'storage/logs/app.log', BOOTGLY_PROJECT->path . $snapshot);

     return $Response->upload($snapshot);
  });
  ```

- **Sirva de um filesystem com inodes estáveis.** Montagens que regeneram `st_dev` / `st_ino` entre duas aberturas do mesmo caminho — alguns filesystems remotos via FUSE, um copy-up de overlay disparado no meio da transferência — são indistinguíveis de uma substituição e vão abortar. Filesystems locais (ext4, XFS, Btrfs, tmpfs) não têm esse problema.

Links simbólicos são suportados: o link é resolvido uma vez, enquanto o caminho é conferido contra o jail do projeto, e o arquivo para o qual ele apontava naquele momento é o que será servido. Reapontar o link depois não redireciona uma resposta já em curso.

**O jail confina caminhos, não inodes:**

O `upload()` recusa qualquer caminho que resolva para fora de `BOOTGLY_PROJECT->path`. Essa checagem é sobre *nomes*. Um hard link não tem alvo a resolver — ele é simplesmente um segundo nome para um inode — então um hard link criado dentro da árvore servida resolve para um caminho dentro do jail e é servido, aponte o outro nome dele para onde apontar:

```sh
ln /srv/app/.env  /srv/app/public/uploads/notas.txt   # agora é servível
```

O Linux bloqueia a metade interessante disso por padrão: com `fs.protected_hardlinks=1` (padrão nos kernels atuais) só é possível criar hard link para arquivo que você possui ou já consegue ler, então isso não serve para alcançar um arquivo que lhe foi negado. O que sobra é mudança de *exposição* — código rodando como a aplicação transforma um arquivo que ele já lia localmente em um que o mundo pode baixar.

Portanto: **não deixe código menos confiável escrever numa árvore servida.** Um diretório que recebe uploads não deve ser o mesmo que uma rota devolve, e nenhum dos dois deve ficar ao lado dos segredos da aplicação. Se não der para separar, sirva os uploads por um handler que leia e devolva os bytes ele mesmo, em vez de usar o `upload()`.

### HTTP Authentication

```php
public function authenticate (Authentication $Method) : self;
```

**Descrição:**

Envia um desafio de autenticação para o cliente, normalmente em resposta a um recurso protegido sendo acessado sem as credenciais adequadas.

**Parâmetros:**

- `$Method` (Authentication): O Método de Autenticação HTTP.
- Método suportado: Basic.

**Exemplo Basic:**

```php
use Bootgly\WPI\Modules\HTTP\Server\Response\Authentication;

return $Response
   ->authenticate(new Authentication\Basic(realm: "Bootgly Protected Area"));
```

Challenges Bearer são emitidos por `Router\Middlewares\Authentication\Bearer` e `Router\Middlewares\Authentication\JWT`. Veja [Authentication](../Authentication/) para detalhes de guards e challenges.

### Redirecionar

```php
public function redirect (string $URI, int|null $code = null, bool $allowExternal = false) : self;
```

**Descrição:**

Redireciona o cliente para um novo URI.

Por padrão, **URLs externas são bloqueadas** para prevenir vulnerabilidades de redirecionamento aberto (open redirect). Se a `$URI` começa com `http://`, `https://` ou `//`, ela é substituída por `/` a menos que `$allowExternal` seja explicitamente definido como `true`.

**Parâmetros:**

- `$URI` (string): O URI para o qual redirecionar.
- `$code` (int|null, opcional): Código de status HTTP para o redirecionamento. Padrão é 307 para redirecionamentos GET ou 303 para POST.
- `$allowExternal` (bool, padrão `false`): Se permite redirecionamentos para URLs externas. Quando `false`, URLs absolutas com scheme são rejeitadas e substituídas por `/`.

**Exemplos:**

Redirecionamento interno (URI relativa):

```php
return $Response->redirect('/dashboard');
```

Redirecionamento interno com código de status específico:

```php
return $Response->redirect('/nova-localizacao', 301);
```

Redirecionamento externo (é necessário optar com `allowExternal: true`):

```php
return $Response->redirect('https://docs.bootgly.com/', allowExternal: true);
```

Redirecionamento externo com código de status específico:

```php
return $Response->redirect('https://docs.bootgly.com/', 302, allowExternal: true);
```

> ⚠️ **Segurança:** Nunca passe entrada do usuário diretamente para `redirect()` sem validação. Se o destino do redirecionamento pode ser controlado pelo usuário (ex: um parâmetro `?next=`), valide que a URI é relativa ou corresponde a um host permitido antes de chamar `redirect()`.

### Encerrar

```php
public function end (null|int $code = null, null|string $context = null) : self;
```

**Descrição:**

Encerra definitivamente a resposta HTTP. Quando `$code` é informado, ele é definido como o status da resposta exatamente como passado — headers e body já definidos pelo handler são mantidos como estão.

`416 Range Not Satisfiable` é o único código com preset: `end(416, (string) $size)` limpa os headers já definidos, envia um body mínimo de um espaço e — quando `$context` é informado — emite `Content-Range: bytes */{$context}`.

**Parâmetros:**

- `$code` (int|null, opcional): O código de status para enviar antes de encerrar a resposta.
- `$context` (string|null, opcional): Contexto para códigos com preset — para `416`, o tamanho da representação usado para construir o header `Content-Range`. Ignorado para qualquer outro código.

## Respostas Assíncronas (Defer)

```php
public function defer (Closure $work, int|float $timeout = 0): Response;
```

Executa `$work` de forma assíncrona via PHP Fiber, permitindo que o event loop processe outras conexões enquanto esta resposta está sendo preparada.

Dentro de `$work()`, chame `$Response->wait()` para ceder o controle ao event loop:

- **Wait com `null`** → a Fiber retoma no próximo tick do event loop (agendamento por tick).
- **Wait com um `resource`** → a Fiber retoma quando `stream_select()` detecta I/O pronto naquele recurso (agendamento por I/O).

A resposta é enviada automaticamente quando `$work()` retorna. Se o trabalho lançar, os middlewares da rota que implementam `Recovering` são chamados para responder — do mais interno para o mais externo, depois o pipeline global (veja *Fronteiras de Erro e Trabalho Deferred* na página [Middlewares](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares)); quando nenhum responde, um `500 Internal Server Error` é retornado (`503 Service Unavailable` para um `Response\Timeout`). As fronteiras são a cadeia da rota com que este request foi despachado; um deferral iniciado depois de o onion retornar (um listener `Request\Events::Handled`, um middleware global depois do seu `$next()`) só alcança o pipeline global, e trabalho que já fez handoff (um stream SSE aberto, um `defer()` aninhado) não alcança fronteira nenhuma.

**O que o work enxerga.** `defer()` chama a sua closure como `function (Response $Response, Request $Request)`: o `Response` é um clone privado deste deferral e o `Request` é um *snapshot* do request tirado no momento da chamada — o mesmo objeto que `$Response->Request`, que é como você o alcança de qualquer ponto que só tem o `Response` (um `defer()` aninhado, um resource). O snapshot só é entregue a um segundo parâmetro que aceite um `Request` (tipado `Request`, ou sem tipo e obrigatório); uma closure que declara um segundo parâmetro opcional de outro tipo mantém o default desse parâmetro. Método, URI, fields, arquivos enviados, autenticação, identity, claims, attributes e a Session sobrevivem a todo `wait()`. Parâmetros de rota vivem na Route, não no request: `defer()` religa a Route casada a cada segmento do trabalho, então `WPI->Router->Route->Params` continua respondendo por este request. Leia o request só pelos parâmetros da closure — nunca por uma cópia do `$Response` da rota guardada num `use ()` ou em `$this`: esse objeto é a resposta compartilhada do worker e, assim que o seu trabalho estaciona, o `$Request` dele é o request que o worker estiver servindo agora, cookies e Session inclusos. O `$Request` que a sua rota recebeu é o objeto vivo da conexão: o servidor esvazia o corpo e os fields dele assim que o ciclo síncrono termina e o reutiliza no próximo request daquela conexão, então um `use ($Request)` dentro do trabalho deferred lê fields vazios depois do primeiro `wait()` — e a URI, os cookies e a Session dele não são esvaziados: podem já descrever um request posterior. Headers que um middleware define depois de `$next()` não se aplicam a uma resposta deferred — nesse ponto o onion já retornou; defina-os dentro do trabalho.

Uma Session escrita dentro do trabalho deferred é persistida quando o deferral responde — no sucesso, no erro, quando ele faz handoff para SSE (logo antes de o wire sair) e quando faz handoff para um `defer()` aninhado (no próprio handoff, respondendo o filho ou não) — e uma sessão tocada pela primeira vez depois de um `wait()` define o cookie na resposta deferred quando o trabalho retorna normalmente. A resposta de erro do próprio servidor nunca carrega esse cookie: o `Catcher` monta o `500`/`503` num `Response` novo, exatamente como faz para uma rota que lança síncrona, então uma sessão criada por um request que falha é persistida sob um ID que o cliente nunca recebe — um middleware `Recovering` que responde no próprio `Response` deferred o mantém. Um deferral cancelado (o cliente saiu enquanto ele estava estacionado) não ganha ponto de gravação próprio — o servidor não o persiste. Não leia isso como descarte: o destrutor da própria Session é uma rede de segurança, então uma escrita feita antes de o cliente sair ainda pode chegar ao armazenamento depois, quando o coletor de ciclos recuperar a geração abandonada; quando um request abandonado não puder deixar nada para trás, escreva a Session no último segmento do trabalho — depois do último `wait()` e depois de qualquer handoff: uma escrita feita antes de um `defer()` aninhado é persistida naquele handoff, então ela precisa ir para dentro do filho.

`$timeout` limita, em segundos, quanto tempo o trabalho pode ficar estacionado (`0` usa o `deferredTimeout` global do servidor, onde `0` significa sem teto): quando estoura, um `Response\Timeout` é lançado no ponto de espera — capture-o para responder você mesmo, deixe um middleware `Recovering` respondê-lo, ou deixe-o responder `503 Service Unavailable`. Um deferral estacionado nunca é cortado pelo reaper de ociosidade da conexão. Veja *Ciclo de vida da resposta deferred* na página [HTTP Server CLI](/manual/WPI/HTTP/HTTP_Server_CLI).

### Exemplo tick-based

Útil para trabalho CPU-bound que não deve bloquear outras conexões:

```php
yield $Router->route('/defer/tick', function ($Request, Response $Response) {
   return $Response->defer(function (Response $Response): void {
      $partial = '';
      for ($i = 1; $i <= 5; $i++) {
         $partial .= "chunk {$i}\n";
         $Response->wait(); // Retoma no próximo tick
      }
      $Response->send($partial);
   });
}, GET);
```

### Exemplo I/O-aware

Útil para aguardar recursos externos (bancos de dados, APIs, sockets):

```php
yield $Router->route('/defer/io', function ($Request, Response $Response) {
   return $Response->defer(function (Response $Response): void {
      [$read, $write] = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, STREAM_IPPROTO_IP);
      stream_set_blocking($read, false);

      // Simula I/O assíncrono: escreve de forma não-bloqueante
      fwrite($write, 'Hello from async I/O!');
      fclose($write);

      // Suspende até o socket de leitura ter dados
      $Response->wait($read);

      $data = stream_get_contents($read);
      fclose($read);

      $Response->send($data);
   });
}, GET);
```

### wait()

```php
public function wait (mixed $value = null): Response;
```

Cede o controle ao event loop de dentro de uma closure `defer()`. O comportamento depende do valor passado:

- **`$Response->wait()`** — tick-based: a Fiber retoma na próxima iteração do event loop.
- **`$Response->wait($stream)`** — I/O-bound: a Fiber retoma quando `stream_select()` detecta prontidão no stream resource passado.
- **`$Response->wait($Readiness)`** — agendamento I/O-bound explícito por um objeto de readiness do DBAL ou do event loop.

Se chamado fora de um contexto deferred (`$this->deferred === false`), o método retorna imediatamente sem efeito.

**Parâmetros:**

- `$value` (Readiness|resource|null, padrão `null`): Uma solicitação de readiness, stream resource PHP, ou `null` para agendamento tick-based.
