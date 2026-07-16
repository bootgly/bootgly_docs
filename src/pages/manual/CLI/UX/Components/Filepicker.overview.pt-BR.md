# Filepicker

Seletor de sistema de arquivos — pergunta "qual arquivo?" ao usuário sem que ele digite um caminho. Um [Tree](/manual/CLI/UI/Components/Tree/overview) pré-configurado para o sistema de arquivos: varreduras lazy de diretório, ícones por entrada, filtro de extensões. `pick()` abre o navegador e retorna o **caminho absoluto** escolhido, garantidamente existente.

## Escolha um arquivo

```php
use Bootgly\CLI\UX\Components\Filepicker;

$Filepicker = new Filepicker($Input, $Output);
$Filepicker->prompt = 'Escolha o certificado TLS';
$Filepicker->root = '/etc/ssl';
$Filepicker->extensions = ['pem', 'crt'];

$path = $Filepicker->pick();

if ($path !== null) {
   echo "Certificado: {$path}\n";
}
```

```text
Escolha o certificado TLS
=> 📁 /etc/ssl
   ├─ 📁 certs
   │  ├─ 📄 ca.pem
   │  └─ 📄 server.pem
   └─ 📁 private
```

`↑`/`↓` mira, `Enter` em um diretório **entra nele** (varrido lazy na primeira abertura), `Enter` em um arquivo o confirma, `Esc` cancela retornando `null`. Apenas arquivos que casam com `extensions` são listados (array vazio lista todos); dotfiles ficam escondidos a menos que `hidden = true`.

## Escolha um diretório

Defina `directories = true` e o seletor muda para o modo diretório: arquivos não são listados, `Enter` **seleciona** o diretório mirado e `→` continua entrando:

```php
$Filepicker = new Filepicker($Input, $Output);
$Filepicker->prompt = 'Onde o projeto deve ser criado?';
$Filepicker->root = getcwd();
$Filepicker->directories = true;

$target = $Filepicker->pick();
```

## Entrada não interativa

Em pipes e CI o `pick()` degrada para uma linha digitada (semântica do Question): o usuário digita o caminho, validado com `realpath` — resposta inexistente ou vazia retorna `null`. Scripts continuam automatizáveis:

```bash
echo "/etc/ssl/certs/server.pem" | php installer.php
```

## Notas

- Diretórios são varridos **lazy** — árvores gigantes não custam nada até um ramo ser aberto.
- Diretórios ilegíveis (permissões) resolvem como ramos vazios em vez de abortar a sessão.
- Os ícones vêm do Config `glyphs` (`directory`/`file`) — troque por outros emojis ou marcadores simples.
- `viewport` (padrão 12) janela listagens longas com marcadores `↑/↓ N more`; `blink` faz o marcador de mira piscar.
- Colar um caminho com Ctrl+V é um follow-up planejado (bracketed paste mode no Input do terminal).

## Referência

### Filepicker

```php
public function __construct (Input $Input, Output $Output)
```

Cria o seletor ligado ao `Input` e ao `Output` do terminal.

```php
public function pick (): null|string
```

Abre o navegador do sistema de arquivos e retorna o caminho absoluto escolhido — `null` em cancelamento (`Esc`, `EOF`), em `root` inalcançável, ou quando um caminho digitado não interativamente não existe. O último resultado também fica exposto na propriedade somente leitura `$picked`.

Config: `string $prompt` (linha de cabeçalho), `string $root` (diretório inicial, padrão `.`), `array $extensions` (minúsculas, sem ponto — `[]` lista todos os arquivos), `bool $hidden` (listar dotfiles, padrão `false`), `bool $directories` (modo diretório, padrão `false`), `null|int $viewport` (máximo de linhas visíveis, padrão `12`), `bool $blink` (marcador de mira piscante, padrão `false`), `array $glyphs` (ícones `directory`/`file`).
