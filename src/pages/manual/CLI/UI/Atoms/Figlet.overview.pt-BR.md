# Componente Figlet

O componente `Figlet` renderiza texto como glifos grandes em block-drawing — banners, splashes de versão, scores, clocks. Os glifos vêm de uma **fonte figlet nomeada**: a fonte builtin `shadow` traz A-Z e 0-9 (absorvida do componente `Header` aposentado, que ele substitui). Caracteres sem glifo renderizam como espaços — a arte nunca quebra com input do usuário.

É um **UI Atom** — uma primitiva sem dependência de outros componentes. O próprio banner do CLI `bootgly` é este Atom. Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Atoms/Figlet/showcase).

## Instância

Para usar o componente, crie uma instância passando a instância do `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Figlet;

$Figlet = new Figlet(CLI->Terminal->Output);
```

## Renderize texto grande

Atribua o texto e renderize. Minúsculas mapeiam para os glifos maiúsculos; dígitos compartilham a mesma fonte:

```php
$Figlet->text = 'Bootgly';
$Figlet->render();
```

```text
███████╗   ██████╗   ██████╗  ████████╗ ███████╗  ██╗       ██╗   ██╗
██╔═══██╗ ██╔═══██╗ ██╔═══██╗ ╚══██╔══╝ ██╔════╝  ██║       ╚██╗ ██╔╝
███████╔╝ ██║   ██║ ██║   ██║    ██║    ██║  ███╗ ██║        ╚████╔╝
██╔═══██╗ ██║   ██║ ██║   ██║    ██║    ██║   ██║ ██║         ╚██╔╝
███████╔╝ ╚██████╔╝ ╚██████╔╝    ██║    ╚██████╔╝ ████████╗    ██║
╚══════╝   ╚═════╝   ╚═════╝     ╚═╝     ╚═════╝  ╚═══════╝    ╚═╝
```

`gap` define as colunas entre glifos; `stacked` renderiza um bloco de glifo por caractere (vertical):

```php
$Figlet->gap = '  ';
$Figlet->stacked = true;   // um bloco por caractere
```

## Fontes

O conjunto de glifos é uma **fonte figlet nomeada**. Registre a sua mapeando caracteres para arte multilinha — ou apontando para um arquivo PHP que retorna esse mapa — e selecione pelo nome:

```php
Figlet::$Fonts['dots'] = [
   'A' => "•A•\n• •",
   'B' => "•B•\n• •"
];

$Figlet->font = 'dots';
$Figlet->render();
```

Glifos podem ter larguras e alturas diferentes — cada glifo é padded à própria largura e à altura da fonte, então as colunas sempre alinham. Selecionar um nome não registrado lança um `ValueError`.

## Reference

### Propriedades

```php
public static array $Fonts = ['shadow' => ...];
```

Config. Fontes figlet nomeadas — um mapa de glifos (`char => arte multilinha`) ou um path de arquivo PHP retornando um. A builtin `shadow` cobre A-Z e 0-9.

```php
public string $font = 'shadow';
```

Config. Fonte figlet nomeada — resolvida do registro `$Fonts`. Nomes desconhecidos lançam `ValueError` no render.

```php
public bool $stacked = false;
```

Config. Empilha um bloco de glifo por caractere em vez de compor lado a lado.

```php
public string $gap = ' ';
```

Config. Colunas entre glifos lado a lado.

```php
public string $text = '';
```

Data. O texto a ampliar — minúsculas mapeiam para os glifos maiúsculos; caracteres sem glifo renderizam como espaços.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza a arte de glifos. `WRITE_OUTPUT` escreve no `Output` e retorna `null`; `RETURN_OUTPUT` retorna a string renderizada.
