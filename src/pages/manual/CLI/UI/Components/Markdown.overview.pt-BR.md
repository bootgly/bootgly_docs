# Markdown

Renderize **markdown direto no terminal** — como Rich ou Glow, com zero dependências de terceiros. Headings, parágrafos com wrap, ênfases, código inline e cercado, quotes, listas aninhadas (incluindo tasks), tabelas alinhadas, links e réguas — tudo pintado com SGR raw. Em saída não-interativa (pipes, CI) o render degrada para texto plano estruturado com **zero escape codes**.

## Renderize um documento

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Markdown;

$Output = CLI->Terminal->Output;

$Markdown = new Markdown($Output);
$Markdown->source = <<<'MARKDOWN'
# Olá

Renderize **markdown** com *estilos*, `código` e [links](https://bootgly.com).

- Parágrafos com wrap
- [x] Listas de tarefas

| Recurso | Status |
|:--------|-------:|
| Tabelas | pronto |
MARKDOWN;

$Markdown->render();
```

`render()` parseia o source e pinta com wrap na largura do terminal. Experimente a demo `54` para um documento completo.

## Largura e decoração

```php
$Markdown->width = 60;         // colunas — null resolve a largura do terminal
$Markdown->decoration = true;  // força SGR mesmo em pipes
$Markdown->render();
```

`decoration` é tri-state: `null` (default) segue o TTY — terminais interativos ganham estilos, pipes ganham texto plano; `false` força plano; `true` força estilos (útil para testes determinísticos e buffers pré-renderizados).

## Customize a paleta

Cada chave de elemento em `$styles` mapeia para uma lista de códigos SGR (as constantes do `Formattable` funcionam direto):

```php
$Markdown->styles['h1'] = ['1', '35'];    // headings em negrito magenta
$Markdown->styles['code'] = ['96'];       // código inline em ciano brilhante
```

Chaves: `h1`-`h6`, `bold`, `italic`, `strike`, `code`, `fence`, `source`, `link`, `url`, `image`, `quote`, `marker`, `checked`, `unchecked`, `rule`, `header`, `border`.

## Segurança

O source é tratado como **texto não-confiável**: bytes de controle raw (incluindo `ESC`) são removidos, então markdown nunca injeta movimentos de cursor ou estilos perdidos no seu terminal — e o conteúdo nunca passa pelo engine de markup de Template.

## Notas

- Subconjunto suportado: headings ATX, parágrafos (hard breaks com dois espaços no fim), blocos de código cercados, blockquotes (aninhados + lazy), listas tight aninhadas + tasks `- [x]`, tabelas GFM com alinhamentos `:---:`, réguas horizontais, ênfases/código/links/imagens.
- Fora do escopo (v1): setext headings, código indentado, reference links, autolinks, HTML raw (mantido como texto literal) e loose lists.
- Código cercado renderiza verbatim e esmaecido — syntax highlighting é um follow-up planejado.
- O parser é reutilizável sozinho: `Bootgly\ABI\Data\__String\Markdown::parse()` retorna uma AST pura (árvores de `Node`) sem nenhum estilo.

## Reference

```php
public function __construct (Output $Output)
```

Cria o renderer vinculado a um `Output`.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Parseia o `$source` e pinta. `WRITE_OUTPUT` escreve no `Output` e retorna `null`; `RETURN_OUTPUT` retorna a string renderizada.

```php
public string $source = '';
```

O source markdown a renderizar.

```php
public null|int $width = null;
```

Largura do render em colunas — `null` resolve a largura do terminal (piso de 20).

```php
public null|bool $decoration = null;
```

Decoração SGR — `null` segue o TTY, `false` força texto plano estruturado, `true` força estilos.

```php
public array $styles = [...];
```

Listas de códigos SGR por chave de elemento — sobrescreva qualquer entrada para tematizar o render.
