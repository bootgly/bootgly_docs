# HTTP Response

## Visão Geral

A interface `Response` no Framework PHP Bootgly é projetada para fornecer uma API fácil de usar para gerenciar respostas HTTP em suas aplicações web ou APIs. Ela permite que você configure status, cabeçalhos e conteúdo do corpo de respostas, além de facilitar a renderização de visualizações, uploads de arquivos, autenticação de usuários e redirecionamentos.

## Uso

A seguir estão os métodos fornecidos pela interface `Response` com exemplos demonstrando seu uso.

### Construtor

```php
public function __construct (int $code = 200, ?array $headers = null, string $body = '');
```

**Parâmetros:**

- `$code` (int, opcional): O código de status HTTP. Padrão é 200.
- `$headers` (array|null, opcional): Um array associativo de cabeçalhos a serem definidos na resposta.
- `$body` (string, opcional): O conteúdo inicial do corpo da resposta.

**Exemplo:**

```php
$Response = new Response(200, ['Content-Type' => 'application/json'], '{"message": "OK"}');
```

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
public function render (string $view, ?array $data = null, ? \Closure $callback = null) : self;
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
public function upload (string|File $file) : self;
```

```php
public function upload (string|File $file, int $offset = 0, ? int $length = null, bool $close = true) : self;
```

**Descrição:**

Envia arquivo para o cliente HTTP.

**Parâmetros:**

- `$file` (string|File): O arquivo ou caminho do arquivo para upload.
- `$offset` (int): O deslocamento dos dados. (Somente no HTTP Server CLI)
- `$length` (int|null): O comprimento dos dados para upload. (Somente no HTTP Server CLI)
- `$close` (bool): Fechar a conexão após o envio. (Somente no HTTP Server CLI)

**Exemplo 1:**

```php
return $Response->upload('/caminho/para/arquivo.pdf');
```

**Exemplo 2 (somente se usando HTTP Server CLI):**

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

- `$realm` (string, opcional): Uma descrição da área protegida. Padrão é "Área protegida".

**Exemplo:**

```php
return $Response->authenticate();
```

### Redirecionar

```php
public function redirect (string $URI, ?int $code = null) : self;
```

**Descrição:**

Redireciona o cliente para um novo URI.

**Parâmetros:**

- `$URI` (string): O URI para o qual redirecionar.
- `$code` (int|null, opcional): Código de status HTTP para o redirecionamento. Padrão é 307 para redirecionamentos GET ou 303 para POST.

**Exemplo:**

```php
return $Response->redirect('https://exemplo.com/novapagina', 301);
```

### Encerrar

```php
public function end (int|string|null $status = null) : void;
```

**Descrição:**

Encerra a resposta HTTP, opcionalmente configurando um status de resposta antes de encerrar a resposta.

**Parâmetros:**

- `$status` (int|string|null, opcional): O status para enviar antes de encerrar a resposta.
