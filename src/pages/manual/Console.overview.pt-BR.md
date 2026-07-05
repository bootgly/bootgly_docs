# Plataforma Console

A plataforma Console (`bootgly/bootgly-console`) é a **camada TUI opinativa** do Bootgly sobre a interface CLI: um shell de aplicação para apps de terminal full-screen ([App](/manual/Console/App)) e um módulo para jogos de terminal ([Games](/manual/Console/Games)).

Ela é distribuída como submódulo git opcional do kit inicial — o wizard de projetos a oferece no multiselect de **Plataformas** (veja [Começando](/guide/getting-started)).

## Instalando a plataforma

O instalador canônico já a oferece — ele pergunta quais plataformas configurar, e escolher **Console** inicializa o submódulo na hora:

```bash
curl -fsSL https://bootgly.com/install | bash
```

Não escolheu na instalação? Adicione depois em um kit existente:

```bash
git submodule update --init Console
```

Ou pelo wizard, de forma não interativa:

```bash
php bootgly project create --platform=console
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

O `Console/autoboot.php` define as constantes da plataforma (`CONSOLE_ROOT_DIR`, `CONSOLE_WORKING_DIR`, `CONSOLE_VERSION`), registra o autoloader `Console\` e boota o singleton da plataforma:

```php
const Console = new Console;
Console->autoboot();
```

A plataforma é uma **biblioteca de classes** sobre `Bootgly\CLI`: não há workables de processo — cada app boota por projeto, através da sua assinatura `.project.php`.

## Projetos Console

Um projeto Console é um projeto Bootgly comum vinculado à interface `CLI`. Registre-o no `projects/Bootgly.projects.php` do consumidor:

```php
return [
   'Snake' => ['interfaces' => ['CLI']],
];
```

E dê a ele uma assinatura `.project.php` cuja closure `boot` executa o app:

```php
use Bootgly\API\Projects\Project;

use projects\Snake\Snake;


return new Project(
   name: 'Snake',
   description: 'Classic Snake game — Console platform Games module demo',
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

```bash
php bootgly project Snake start
```

A plataforma traz **projetos exportáveis** em `Console/projects/` — o picker *Import projects from Platforms* do wizard os enumera (os jogos Snake e Pong saem de lá).

---

## Referência

```php
public function autoboot (): void
```

Boota o singleton da plataforma Console (a constante global `Console`). Protegido: bootar duas vezes lança uma `Exception`. A plataforma em si não registra workables — apps bootam por projeto.
