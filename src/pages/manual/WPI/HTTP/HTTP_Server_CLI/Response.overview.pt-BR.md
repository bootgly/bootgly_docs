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

### Renderizar uma view simples

```php
public function render (string $view, ? array $data = null, ? \Closure $callback = null) : self;
```

**Descrição:**

Renderiza uma visualização e a anexa ao corpo da resposta.

**Parâmetros:**

- `$view` (string): A visualização a ser renderizada.
- `$data` (array|null, opcional): Dados para passar para a visualização.
- `$callback` (Closure|null, opcional): Um callback adicional executado após a renderização da visualização.

**Exemplo:**

```php
return $Response->render('boas-vindas', ['title' => 'Página de Boas-Vindas']);
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

### Enviando arquivos

```php
public function upload (string|File $file, int $offset = 0, ? int $length = null) : self;
```

```php
public function upload (string|File $file, int $offset = 0, ? int $length = null, bool $close = true) : self;
```

**Descrição:**

Envia arquivo para o cliente HTTP.

**Parâmetros:**

- `$file` (string|File): O arquivo ou caminho do arquivo para upload.
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

### HTTP Basic Authentication

```php
public function authenticate (string $realm = 'Área protegida') : self;
```

**Descrição:**

Envia um desafio de autenticação para o cliente, normalmente em resposta a um recurso protegido sendo acessado sem as credenciais adequadas.

**Parâmetros:**

- `$Method` (Authentication): O Método de Autenticação HTTP. Por agora só é aceito "Basic" (veja exemplo).

**Exemplo:**

```php
use Bootgly\WPI\Modules\HTTP\Server\Response\Authentication;

return $Response
   ->authenticate(new Authentication\Basic(realm: "Bootgly Protected Area"));
```

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
public function end (? int $code = null) : void;
public function end (? int $code = null) : self;
```

**Descrição:**

Encerra a resposta HTTP, opcionalmente configurando um código de status de resposta antes de encerrar a resposta.

**Parâmetros:**

- `$code` (int|null, opcional): O código de status para enviar antes de encerrar a resposta.

## Respostas Assíncronas (Defer)

```php
public function defer (Closure $work): Response;
```

Executa `$work` de forma assíncrona via PHP Fiber, permitindo que o event loop processe outras conexões enquanto esta resposta está sendo preparada.

Dentro de `$work()`, chame `$Response->wait()` para ceder o controle ao event loop:

- **Wait com `null`** → a Fiber retoma no próximo tick do event loop (agendamento por tick).
- **Wait com um `resource`** → a Fiber retoma quando `stream_select()` detecta I/O pronto naquele recurso (agendamento por I/O).

A resposta é enviada automaticamente quando `$work()` retorna. Se uma exceção for lançada, um `500 Internal Server Error` é retornado.

### Exemplo tick-based

Útil para trabalho CPU-bound que não deve bloquear outras conexões:

```php
yield $Router->route('/defer/tick', function ($Request, $Response) {
   return $Response->defer(function () use ($Response) {
      $partial = '';
      for ($i = 1; $i <= 5; $i++) {
         $partial .= "chunk {$i}\n";
         $Response->wait(); // Retoma no próximo tick
      }
      $Response->body = $partial;
   });
}, GET);
```

### Exemplo I/O-aware

Útil para aguardar recursos externos (bancos de dados, APIs, sockets):

```php
yield $Router->route('/defer/io', function ($Request, $Response) {
   return $Response->defer(function () use ($Response) {
      [$read, $write] = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, STREAM_IPPROTO_IP);
      stream_set_blocking($read, false);

      // Simula I/O assíncrono: escreve de forma não-bloqueante
      fwrite($write, 'Hello from async I/O!');
      fclose($write);

      // Suspende até o socket de leitura ter dados
      $Response->wait($read);

      $data = stream_get_contents($read);
      fclose($read);

      $Response->body = $data;
   });
}, GET);
```

### wait()

```php
public function wait (null|mixed $value = null): Response;
```

Cede o controle ao event loop de dentro de uma closure `defer()`. O comportamento depende do valor passado:

- **`$Response->wait()`** — tick-based: a Fiber retoma na próxima iteração do event loop.
- **`$Response->wait($stream)`** — I/O-bound: a Fiber retoma quando `stream_select()` detecta prontidão no stream resource passado.

Se chamado fora de um contexto deferred (`$this->deferred === false`), o método retorna imediatamente sem efeito.

**Parâmetros:**

- `$value` (resource|null, padrão `null`): Um stream resource PHP para agendamento I/O-bound, ou `null` para agendamento tick-based.
