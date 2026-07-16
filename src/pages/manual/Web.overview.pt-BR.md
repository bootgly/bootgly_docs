# Plataforma Web

A plataforma Web (`bootgly/bootgly-web`) é a **camada web opinativa** do Bootgly sobre a interface WPI: um shell de aplicação para projetos MVC ([App](/manual/Web/App)) e um conjunto de convenções REST ([API](/manual/Web/API)).

O WPI em si permanece deliberadamente de baixo nível — a plataforma é onde as opiniões vivem: controllers, resource routing, erros problem+json, assets estáticos e convenções de views. Tudo o que ela conecta continua sendo WPI puro por baixo.

Ela é distribuída como um git submodule opcional do starter kit — o wizard de projetos a oferece no multiselect de **Platforms** (veja [Primeiros passos](/guide/getting-started)).

## Instalando a plataforma

O instalador canônico já a oferece — ele pergunta quais plataformas configurar, e escolher **Web** inicializa o submodule imediatamente:

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

Não escolheu na instalação? Adicione depois a um kit existente:

```bash :toolbar="true";
git submodule update --init Web
```

Ou pelo wizard, de forma não interativa:

```bash :toolbar="true";
php bootgly project create --platform=web
```

## Como ela inicializa

O kit inicializa as plataformas opcionais **antes** da plataforma Bootgly, então projetos Web encontram o autoloader da plataforma já registrado. O `Web/autoboot.php` define as constantes da plataforma (`WEB_ROOT_DIR`, `WEB_WORKING_DIR`, `WEB_VERSION`), registra o autoloader `Web\` e inicializa o singleton da plataforma:

```php
const Web = new Web;
Web->autoboot();
```

A plataforma é uma **biblioteca de classes** sobre `Bootgly\WPI`: não há workables por processo — cada app inicializa por projeto, através da sua assinatura `.project.php`.

## Projetos Web

Um projeto Web é um projeto Bootgly comum vinculado à interface `WPI`. Registre-o no `projects/Bootgly.projects.php` do consumidor:

```php
return [
   'Site' => ['interfaces' => ['WPI']],
];
```

E dê a ele uma assinatura `.project.php` cuja closure `boot` executa o [shell App](/manual/Web/App):

```php
use function getenv;

use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Web\App;


return new Project(
   name: 'Site',
   description: 'Landing site',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $App = new App(Mode: match (true) {
         isset($options['f']) => Modes::Foreground,
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $App
         ->configure(port: getenv('PORT') ? (int) getenv('PORT') : 8088)
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

Inicie-o como qualquer projeto:

```bash :toolbar="true";
php bootgly project Site start
```

A plataforma inclui **projetos exportáveis** em `Web/projects/` — o picker *Import projects from Platforms* do wizard os examina:

- **Blog** (`:8080`) — o ciclo MVC completo: controllers, models do ORM, views, formulários com Session + CSRF, SQLite (zero setup).
- **Chat** (`:8085`) — salas em tempo real sobre o servidor WebSocket; a página do cliente é servida na mesma porta.
- **Site** (`:8088`) — páginas de landing: views despachadas por controller, layouts e estáticos inline, sem banco.
- **Tasks** (`:8090`) — uma API REST: resources, erros problem+json, mutações protegidas por JWT, paginação.

---

## Reference

```php
public function autoboot (): void
```

Inicializa o singleton da plataforma Web (a constante global `Web`). Protegido: inicializar duas vezes lança uma `Exception`. A plataforma em si não registra workables — apps inicializam por projeto.
