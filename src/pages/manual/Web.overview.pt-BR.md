# Plataforma Web

A plataforma Web (`bootgly/bootgly-web`) é a **camada web opinativa** do Bootgly sobre a interface WPI: um shell de aplicação para projetos MVC ([App](/manual/Web/App)) e um conjunto de convenções REST ([API](/manual/Web/API)).

O WPI em si permanece deliberadamente de baixo nível — a plataforma é onde as opiniões vivem: controllers, resource routing, erros problem+json, assets estáticos e convenções de views. Tudo o que ela conecta continua sendo WPI puro por baixo.

Ela é distribuída como um git submodule opcional do starter kit — o wizard de projetos a oferece no multiselect de **Platforms** (veja [Primeiros passos](/guide/getting-started)).

## Instalando a plataforma

O instalador canônico já a configura — todas as plataformas vêm inicializadas:

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

## Como ela inicializa

O kit inicializa as plataformas opcionais **antes** da plataforma Bootgly, então projetos Web encontram o autoloader da plataforma já registrado. O `Web/autoboot.php` define as constantes da plataforma (`WEB_ROOT_DIR`, `WEB_WORKING_DIR`, `WEB_VERSION`) e registra o autoloader `Web\` — sem dependência do Bootgly, que ainda não foi carregado. A raiz da plataforma, a classe `Web`, implementa `Bootgly\API\Platform`, então só pode existir depois que o autoloader do próprio Bootgly existe: o `Bootgly::autoboot()` a cria logo em seguida, antes de rotear qualquer comando, define a constante global `Web` e a inicializa:

```php
// dentro do Bootgly::autoboot(), para cada plataforma instalada
define('Web', new Web);   // class Web implements Bootgly\API\Platform
Web->autoboot();
```

Quando o `Web/autoboot.php` roda depois do Bootgly — o Composer carrega os `files` de uma dependência antes dos do próprio pacote, então o `vendor/autoload.php` sozinho (análise estática, um script) sobe o Bootgly primeiro —, o próprio arquivo monta a raiz, pelo mesmo passo:

```php
if (defined('Bootgly') === true) {
   Bootgly::mount('Web');
}
```

Essa ordem é tarde demais para comandos: o Bootgly roteia o comando enquanto sobe, antes de o `autoboot.php` da plataforma rodar. Um lançador que roda comandos inclui o `autoboot.php` da plataforma antes do Bootgly, como fazem os lançadores das plataformas e do kit. Um Bootgly anterior à 1.1 não tem `mount()`, então a plataforma o recusa com uma `LogicException`.

Uma plataforma cujo `autoboot.php` não rodou (não instalada) é pulada, uma constante `Web` que já existe é deixada como está (uma release da plataforma anterior à 1.1.0 ainda cria a própria raiz; essa tolerância sai na 2.0.0), e uma classe raiz que não pode ser carregada ou não implementa `Bootgly\API\Platform` interrompe o boot com uma `Exception` que a nomeia.

A plataforma é uma **biblioteca de classes** sobre `Bootgly\WPI`: não há workables por processo — cada app inicializa por projeto, através da sua assinatura `.Project.php`.

## Projetos Web

Um projeto Web é um projeto Bootgly comum vinculado à interface `WPI`. Registre-o no `projects/Bootgly.projects.php` do consumidor:

```php
return [
   'Site' => ['interfaces' => ['WPI']],
];
```

E dê a ele uma assinatura `.Project.php` cuja closure `boot` executa o [shell App](/manual/Web/App):

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Web\App;
use Web\App\Configs;


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
         ->configure(new Configs(port: getenv('PORT') ? (int) getenv('PORT') : 8088))
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

Inicie-o como qualquer projeto:

```bash :toolbar="true";
php bootgly project Demo/Site start
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

Inicializa o singleton da plataforma Web (a constante global `Web`) — o único método do contrato `Bootgly\API\Platform`, chamado pelo `Bootgly::autoboot()`. Protegido: inicializar duas vezes lança uma `Exception`. A plataforma em si não registra workables — apps inicializam por projeto.
