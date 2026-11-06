# Plataforma Console

A plataforma Console (`bootgly/bootgly-console`) é a **camada TUI opinativa** do Bootgly sobre a interface CLI: um shell de aplicação para apps de terminal full-screen ([App](/manual/Console/App)) e um módulo para jogos de terminal ([Game](/manual/Console/Game)).

Ela é distribuída como submódulo git opcional do kit inicial — o wizard de projetos a oferece no multiselect de **Plataformas** (veja [Começando](/guide/getting-started)).

## Instalando a plataforma

O instalador canônico já a oferece — ele pergunta quais plataformas configurar, e escolher **Console** inicializa o submódulo na hora:

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

Não escolheu na instalação? Adicione depois em um kit existente:

```bash :toolbar="true";
git submodule update --init Console
```

Ou pelo wizard, de forma não interativa:

```bash :toolbar="true";
php bootgly projects create --platform=console
```

## Como ela boota

O kit boota as plataformas opcionais **antes** da plataforma Bootgly, porque o roteamento de comandos (ex.: `project <Nome> start`) acontece dentro do autoboot do Bootgly — projetos Console precisam do autoloader da plataforma já registrado:

```php
// <kit>/bootgly (trecho)
foreach (['Console', 'Web'] as $platform) {
   if (is_file(__DIR__ . "/{$platform}/autoboot.php") === true) {
      @include __DIR__ . "/{$platform}/autoboot.php";
   }
}

$booted =
   (@include __DIR__ . '/@imports/autoload.php') ||
   (@include __DIR__ . '/Bootgly/autoboot.php');
```

O `Console/autoboot.php` define as constantes da plataforma (`CONSOLE_ROOT_DIR`, `CONSOLE_WORKING_DIR`, `CONSOLE_VERSION`) e registra o autoloader `Console\` — sem dependência do Bootgly, que ainda não foi carregado. A raiz da plataforma, a classe `Console`, implementa `Bootgly\API\Platform`, então só pode existir depois que o autoloader do próprio Bootgly existe: o `Bootgly::autoboot()` a cria logo em seguida, antes de rotear qualquer comando, define a constante global `Console` e a boota:

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

Um projeto Console é um projeto Bootgly comum vinculado à interface `CLI`. Registre-o no `projects/Bootgly.projects.php` do consumidor:

```php
return [
   'Snake' => ['interfaces' => ['CLI']],
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

A plataforma traz **projetos exportáveis** em `Console/projects/` — o picker *Import projects from Platforms* do wizard os enumera (os jogos Snake e Pong saem de lá).

---

## Referência

```php
public function autoboot (): void
```

Boota o singleton da plataforma Console (a constante global `Console`) — o único método do contrato `Bootgly\API\Platform`, chamado pelo `Bootgly::autoboot()`. Protegido: bootar duas vezes lança uma `Exception`. A plataforma em si não registra workables — apps bootam por projeto.
