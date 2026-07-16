# Componente Highlighter

O componente `Highlighter` pinta código PHP com cores de sintaxe no terminal, usando o tokenizer nativo do framework (`token_get_all`, via o `Tokens\Highlighter` do ABI) — zero dependências de terceiros. Renderiza um gutter opcional de números de linha, marca uma linha e janela o excerpt ao redor dela (o mesmo visual da saída de erro do framework), e degrada para texto plano sem escapes em saída não-interativa.

É um **UI Atom** — uma primitiva sem dependência de outros componentes. Os blocos cercados `php` do Markdown usam o mesmo engine do ABI por baixo. Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Atoms/Highlighter/showcase).

## Instância

Para usar o componente, crie uma instância passando a instância do `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Highlighter;

$Highlighter = new Highlighter(CLI->Terminal->Output);
```

## Colorize um snippet

Sources sem a tag `<?php` colorizam como PHP puro. O gutter de números de linha renderiza por default:

```php
$Highlighter->source = <<<'PHP'
$greeting = 'Hello, Bootgly!';
echo "{$greeting}";
PHP;

$Highlighter->render();
```

Defina `gutter` como `false` para linhas coloridas sem gutter (snippets, embeds):

```php
$Highlighter->gutter = false;
$Highlighter->render();
```

## Marque uma linha

`mark` sinaliza uma linha com um marcador `▶` e janela o excerpt ao redor dela (linhas `before`/`after`, 4 + 4 por default) — a mesma renderização que o framework usa para excerpts de erro:

```php
$Highlighter->mark = 6;      // linha a marcar
$Highlighter->before = 2;    // linhas da janela antes
$Highlighter->after = 2;     // linhas da janela depois

$Highlighter->render();
```

## Temas

A paleta é um **tema de highlight nomeado**. Dois builtins acompanham o framework: `bootgly` (a paleta default, nível editor) e `plain` (incolor). Registre o seu mapeando grupos de token para códigos de cor SGR e selecione pelo nome:

```php
use Bootgly\ABI\Data\__String\Tokens;

Tokens\Highlighter::$Themes['dracula'] = [
   Tokens::TOKEN_STRING   => '38;2;241;250;140',
   Tokens::TOKEN_VARIABLE => '38;2;139;233;253',
   Tokens::TOKEN_COMMENT  => '38;2;98;114;164',
   Tokens::TOKEN_NUMBER   => '38;2;189;147;249',
];

$Highlighter->theme = 'dracula';
$Highlighter->render();
```

Os valores aceitam qualquer código SGR — cores nomeadas (`31`), variantes bright (`91`) ou truecolor (`38;2;R;G;B`). Grupos de token sem entrada renderizam sem estilo. Selecionar um nome não registrado lança um `ValueError`.

## Saída não-interativa

Em pipes e CI o render mantém a estrutura (números, divisor, marcador) com **zero escape codes**. `decoration` é tri-state: `null` (default) segue o TTY, `false` força plano, `true` força cores. Sem a extensão tokenizer o render degrada para o source verbatim.

## Reference

### Propriedades

```php
public null|bool $decoration = null;
```

Config. Decoração SGR — `null` segue o TTY, `false` força plano, `true` força cores.

```php
public bool $gutter = true;
```

Config. Renderiza o gutter (números de linha, divisor, marcador de linha).

```php
public null|int $mark = null;
```

Config. Linha a marcar — janela a saída ao redor dela.

```php
public int $before = 4;
```

Config. Linhas da janela antes da linha marcada.

```php
public int $after = 4;
```

Config. Linhas da janela depois da linha marcada.

```php
public string $theme = 'bootgly';
```

Config. Tema de highlight nomeado — resolvido do registro público `Tokens\Highlighter::$Themes` (grupo de token → códigos SGR; builtins `bootgly` e `plain`). Nomes desconhecidos lançam `ValueError` no render.

```php
public string $source = '';
```

Data. O source PHP — sources sem tag de abertura colorizam como PHP puro.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Pinta o source colorizado. `WRITE_OUTPUT` escreve no `Output` e retorna `null`; `RETURN_OUTPUT` retorna a string renderizada.
