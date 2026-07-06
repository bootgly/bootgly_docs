# Views

No lado Web, uma **view** é um template do projeto renderizado em uma resposta HTTP. Views são
arquivos do mesmo engine descrito em [Templates](/templates) — arquivos `.template.php` no
diretório `views/` do seu projeto — acessados pelo resource de resposta `View`. Além da
renderização simples, a camada Web adiciona um **layout padrão** e **content negotiation**: um
único payload servido como JSON, XML ou HTML conforme o header `Accept` da requisição.

> [!NOTE]
> Tudo em [Templates](/templates) (`@extends`, `@section`, `@yield`, `@include`, `@component`,
> `@>>`, verbatim, o cache de compilação e os erros na linha do template) vale para
> `views/*.template.php` sem mudanças. Esta página é a integração Web ao redor disso.

## Renderize sua primeira view

`render()` compila e renderiza uma view no corpo da resposta; encadeie `send()` para enviá-la:

```php
$Response->View->render('home')->send();
```

O nome resolve para `views/home.template.php`. Passe dados como segundo argumento — eles viram
variáveis locais no template:

```php
$Response->View->render('users/show', [
   'name' => 'Ada',
   'role' => 'admin'
])->send();
```

`send()` é o atalho para o caso comum — renderizar uma view e enviá-la:

```php
$Response->View->send('users/show', ['name' => 'Ada']);
```

A rota atual está sempre disponível dentro da view como `$Route`.

## Compartilhando dados entre views

`export()` registra variáveis uma vez, e todo `render()` seguinte na mesma resposta as
enxerga — útil para dados de layout/partials (nome do site, o usuário logado, um menu):

```php
$Response->View
   ->export(['site' => 'Bootgly', 'User' => $User])
   ->render('dashboard', ['stats' => $stats])
   ->send();
```

Os dados por render vencem os dados exportados em caso de colisão de chave.

## Layouts

Views compõem pelo `@extends`/`@section`/`@yield` do engine — um layout declara os buracos,
uma view os preenche. O lar convencional dos templates compartilhados:

```text
views/
├── layouts/
│   └── app.template.php
├── partials/
│   └── nav.template.php
└── dashboard.template.php
```

`views/layouts/app.template.php`:

```text
<!doctype html>
<title>@yield title;</title>
<body>
   @include partials/nav;
   @yield content;
</body>
```

### Layout padrão

Defina um **layout padrão** e qualquer view que não declare seu próprio `@extends` é embrulhada
nele automaticamente — todo o output da view vira a section `content` do layout:

```php
$Response->View->layout = 'layouts/app';

// dashboard.template.php não tem @extends — é embrulhada em layouts/app
$Response->View->render('dashboard', ['stats' => $stats])->send();
```

> [!WARNING]
> O resource `View` é **persistente por worker**: `layout` sobrevive entre requests. Trate-o
> como um padrão da aplicação — defina uma vez na inicialização, não condicionalmente dentro
> de uma rota (vazaria para todas as requests seguintes do worker). Para escolhas por rota,
> use o argumento por render `layout:` abaixo.

O padrão é opt-in (vazio por padrão). Regras:

- Uma view com seu próprio `@extends` ignora o padrão — a herança explícita sempre vence.
- Uma view que declara `@section content:` preenche `content` ela mesma; só o output *loose*
  (solto) de uma view cai em `content`.
- Sobrescreva por render com o argumento `layout:` — um nome escolhe outro layout, `false`
  renderiza sem layout:

```php
$Response->View->render('report', $data, layout: 'layouts/print')->send();
$Response->View->render('fragment', $data, layout: false)->send(); // sem layout
```

## Content negotiation

O resource `Negotiation` serve **um único payload** na representação que o cliente pediu. Ele lê
o header `Accept` da requisição (já parseado, ordenado por q, por `Request::negotiate()`) e
escolhe entre as ofertas — `application/json` e `application/xml` sempre, mais `text/html`
quando você passa uma `view`:

```php
$Response->Negotiation->send(
   ['id' => 7, 'name' => 'Ada'], // o payload único
   view: 'users/show'            // usado só se HTML for selecionado
);
```

Mesma rota, três clientes:

```text
Accept: application/json  →  {"id":7,"name":"Ada"}
Accept: application/xml   →  <?xml version="1.0" encoding="UTF-8"?><response><id>7</id><name>Ada</name></response>
Accept: text/html         →  users/show renderizada com ['id' => 7, 'name' => 'Ada']
```

No caso HTML o payload vira os dados da view, então o array faz papel duplo. Omita `view` para
um endpoint só de API (apenas JSON/XML).

Detalhes da seleção:

- A oferta aceitável mais preferida vence; wildcards `*/*`, `*` e `type/*` são respeitados.
  Tipos recusados com `q=0` nunca são servidos (RFC 9110).
- **Sem header `Accept`** → JSON (a representação padrão) — mantém curl e health checks
  funcionando.
- **`Accept` presente mas insatisfatível** (ex.: `image/png`, tudo recusado com `q=0`, ou
  `text/html` sem `view`) → `406 Not Acceptable`.
- Toda resposta negociada — inclusive o `406` — carrega `Vary: Accept`, então caches
  compartilhados armazenam cada representação separadamente.

## Representação XML

O resource `XML` é um encoder array→XML sem dependências (você também pode usá-lo direto via
`$Response->XML->send($data)`). O mapeamento:

- Elemento raiz `<response>`.
- Chaves associativas viram elementos; chaves numéricas/de lista viram `<item>`.
- Escalares são texto (com escape XML); booleanos renderizam `true`/`false`; `null` é um
  elemento vazio.
- Objetos expõem **apenas suas propriedades públicas** (paridade com `json_encode` — estado
  private/protected nunca chega ao output).
- Aninhamento além de 64 níveis trunca para elemento vazio, então ciclos de referência não
  derrubam o encoder.
- Chaves são sanitizadas para nomes XML válidos (caracteres inválidos → `_`, dígito inicial
  recebe prefixo `_`).
- Um payload string não vazio é tratado como XML já codificado e passa intacto.

```php
$Response->XML->send(['tags' => ['php', 'web'], 'active' => true]);
// <?xml version="1.0" encoding="UTF-8"?><response><tags><item>php</item><item>web</item></tags><active>true</active></response>
```

## Segurança: a whitelist de views

Nomes de view são validados no sink antes de qualquer resolução de arquivo — `render()` usa
include, então um traversal seria execução remota de código, não mera exposição. Nomes vazios,
null bytes, caminhos absolutos e qualquer caractere fora de `[A-Za-z0-9_/-]` são rejeitados com
`403`, e então o nome é normalizado e enjaulado (contido por realpath) no diretório `views/`:

```php
$Response->View->render('../../../etc/passwd')->send(); // 403 Forbidden
```

Mantenha nomes de view estáticos ou vindos de uma allowlist fixa — nunca interpole input bruto
do usuário em um nome de view.

## Reference

```php
public function render (string $view, null|array $data = null, null|Closure $callback = null, null|string|false $layout = null): Response
```

Renderiza `views/{$view}.template.php` no corpo da resposta (ainda não enviado) e retorna a
`Response`. `$data` é extraído como variáveis do template; `$callback($content, $Throwable)`
roda após a renderização. `$layout` sobrescreve o padrão: `null` usa o padrão configurado, um
nome escolhe aquele layout, `false`/`''` renderiza sem layout. Nomes inválidos retornam `403`;
falhas de renderização são reportadas e resultam em corpo vazio.

```php
public function send (mixed $view = null, null|array $data = null, null|Closure $callback = null): Response
```

Renderiza e envia em uma chamada. Um `$view` não-string retorna `403`. Para sobrescrever o
layout, use `render(..., layout: ...)->send()`.

```php
public function export (array ...$variables): static
```

Registra variáveis compartilhadas com todo `render()` seguinte desta resposta; retorna `$this`
para encadeamento. Os dados por render vencem em caso de colisão de chave.

```php
public string $layout = '';
```

Layout padrão aplicado a views sem seu próprio `@extends`. Vazio desabilita. O resource
`View` é persistente, então o valor vive pelo worker inteiro — defina na inicialização e use
o argumento de render `layout:` para sobrescrever por rota.

```php
public function send (mixed $payload = null, null|string $view = null): Response
```

`Negotiation` — serve `$payload` como JSON, XML ou HTML conforme o header `Accept` da
requisição. `view` é o template usado quando HTML é selecionado (e habilita HTML como oferta).
Sem `Accept` cai em JSON; um `Accept` insatisfatível retorna `406`.

```php
public static function choose (array $accepted, array $offers): null|string
```

`Negotiation` — o matcher puro: dados os media types do cliente (ordenados por q) e as ofertas
do servidor, retorna a primeira oferta que satisfaz uma preferência (respeitando `*/*`, `*`,
`type/*`), ou `null` quando nenhuma casa.

```php
public function send (mixed $body = null): Response
```

`XML` — define `Content-Type: application/xml` e envia `$body` codificado como XML (uma string
não vazia é tratada como já codificada e passa intacta).
