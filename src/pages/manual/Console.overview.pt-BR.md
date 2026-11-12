# Plataforma Console

A plataforma Console (`bootgly/bootgly-console`) é a **camada TUI opinativa** do Bootgly sobre a interface CLI: um shell de aplicação para apps de terminal full-screen ([App](/manual/Console/App)) e um módulo para jogos de terminal ([Game](/manual/Console/Game)).

O kit inicial a rastreia, assim como a Web, como submódulo git. Um kit novo configura todas as plataformas sem perguntar (`--platform=` restringe essa primeira execução); depois disso, uma execução só adiciona as plataformas que o `--platform=` nomeia — uma plataforma que você removeu continua removida (veja [Começando](/guide/getting-started)).

## Instalando a plataforma

O instalador canônico já a configura — todas as plataformas vêm inicializadas:

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

## Como ela boota

O lançador do kit boota as plataformas **antes** da plataforma Bootgly, porque o roteamento de comandos (ex.: `project <Nome> start`) acontece dentro do autoboot do Bootgly — projetos Console precisam do autoloader da plataforma já registrado:

```php
// <kit>/bootgly (trecho)
foreach (['Console', 'Web'] as $platform) {
   if (is_file(__DIR__ . "/{$platform}/autoboot.php") === true) {
      @include __DIR__ . "/{$platform}/autoboot.php";
   }
}

$booted = (@include __DIR__ . '/Bootgly/autoboot.php');
```

O `Console/autoboot.php` define as constantes da plataforma e registra o autoloader das classes `Console\` — sem dependência do Bootgly, que ainda não foi carregado:

- `CONSOLE_ROOT_BASE` / `CONSOLE_ROOT_DIR` — a pasta da plataforma, sem e com o separador final;
- `CONSOLE_WORKING_BASE` / `CONSOLE_WORKING_DIR` — a mesma pasta, a menos que um lançador defina as duas antes do include;
- `CONSOLE_VERSION` — a release da plataforma.

O autoloader tenta primeiro o `CONSOLE_WORKING_DIR` e cai para o `CONSOLE_ROOT_DIR` quando os dois diferem.

A raiz da plataforma, a classe `Console`, implementa `Bootgly\API\Platform`, então só pode existir depois que o autoloader do próprio Bootgly existe: o `Bootgly::autoboot()` a cria logo em seguida, antes de rotear qualquer comando, define a constante global `Console` e a boota:

```php
// dentro do Bootgly::autoboot(), para cada plataforma instalada
define('Console', new Console);   // class Console implements Bootgly\API\Platform
Console->autoboot();
```

Quando o `Console/autoboot.php` roda depois do Bootgly — o Composer carrega os `files` de uma dependência antes dos do próprio pacote, então o `vendor/autoload.php` sozinho (análise estática, um script) sobe o Bootgly primeiro —, o próprio arquivo monta a raiz, pelo mesmo passo:

```php
if (defined('Bootgly') === true) {
   Bootgly::mount('Console');
}
```

Essa ordem é tarde demais para comandos: o Bootgly roteia o comando enquanto sobe, antes de o `autoboot.php` da plataforma rodar. Um lançador que roda comandos inclui o `autoboot.php` da plataforma antes do Bootgly, como fazem os lançadores das plataformas e do kit. Um Bootgly anterior à 1.1 não tem `mount()`, então a plataforma o recusa com uma `LogicException`.

Uma plataforma cujo `autoboot.php` não rodou (não instalada) é pulada, uma constante `Console` que já existe é deixada como está (uma release da plataforma anterior à 1.1.0 ainda cria a própria raiz; essa tolerância sai na 2.0.0), e uma classe raiz que não pode ser carregada ou não implementa `Bootgly\API\Platform` interrompe o boot com uma `Exception` que a nomeia.

A plataforma é uma **biblioteca de classes** sobre `Bootgly\CLI`: não há workables de processo — cada app boota por projeto, através da sua assinatura `.Project.php`.

## Projetos Console

Um projeto Console é um projeto Bootgly comum vinculado à interface `CLI`. Registre-o no `projects/Bootgly.projects.php` do consumidor, pelo caminho dele dentro de `projects/`:

```php
return [
   'Demo/Snake' => ['interfaces' => ['CLI']],
];
```

E dê a ele uma assinatura `.Project.php` cuja closure `boot` executa o app:

```php
use Bootgly\API\Projects\Project;

use Demo\Snake\Snake;


return new Project(
   name: 'Snake',
   description: 'Classic Snake game — Console platform Game module demo',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $Snake = new Snake;
      $Snake->run();
   }
);
```

Inicie-o como qualquer projeto:

```bash :toolbar="true";
php bootgly project Demo/Snake start
```

A plataforma traz **projetos exportáveis** em `Console/projects/` — os jogos Snake, Pong e Invaders. Um kit novo os importa sozinho para `projects/Demo/`, como guias vivos: inicie um, leia o código ou copie-o para um novo caminho:

```bash :toolbar="true";
php bootgly projects create MyGame --from=Demo/Snake
```

A cópia renomeia só o arquivo de assinatura: as classes continuam declarando `Demo\Snake\…` e seguem sendo carregadas do exemplo original até você renomear esse namespace para o novo caminho (`namespace MyGame;`).

## Execuções headless

A interatividade é decidida uma vez, no boot, pelo `BOOTGLY_TTY`: verdadeiro quando o **STDIN** é um terminal. Redirecionar a saída (`| head`) não muda isso — a TUI continua tomando o terminal. Defina `BOOTGLY_TTY=0` para forçar uma execução headless: um [App](/manual/Console/App) renderiza um frame e retorna, um [Game](/manual/Console/Game) roda um tick e desenha um frame, e o comando termina — o smoke test de scripts, CI e agentes de IA:

```bash :toolbar="true";
BOOTGLY_TTY=0 php bootgly project Demo/Snake start | head -40
```

O frame mantém as sequências de escape (movimentos de cursor, cores). `BOOTGLY_TTY=1` força o contrário — um terminal emulado atrás de um STDIN que não é terminal, como um runtime WebAssembly alimentado pelo xterm.js; qualquer outro valor volta a checar o STDIN.

## Skill de agente

A plataforma traz uma skill para agentes de IA, a `bootgly-build-console`, dentro do pacote: `Console/templates/projects/.agents/skills/bootgly-build-console/SKILL.md`. O `bootgly kit boot` — que o primeiro `projects create` ou `import` executa — a instala em `<kit>/projects/.agents/skills/`, ao lado das skills `bootgly-*` do próprio framework e com um link em `projects/.claude/skills/` para o Claude Code, e a atualiza sempre que a release da plataforma traz uma versão diferente: ela é gerenciada pela máquina, então não a edite. Ela estende a `bootgly-build` para o trabalho com Console: escolher entre um comando, um App e um Game, os dois shells, o smoke test com `BOOTGLY_TTY=0` e testes que dirigem views sem terminal.

---

## Referência

```php
public function autoboot (): void
```

Boota o singleton da plataforma Console (a constante global `Console`) — o único método do contrato `Bootgly\API\Platform`, chamado pelo `Bootgly::autoboot()`. Protegido: bootar duas vezes lança uma `Exception`. A plataforma em si não registra workables — apps bootam por projeto.
