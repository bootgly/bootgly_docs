# Plataforma Web

A plataforma Web (`bootgly/bootgly-web`) é a **camada web opinativa** do Bootgly sobre a interface WPI: um shell de aplicação para projetos MVC ([App](/manual/Web/App)) e um conjunto de convenções REST ([API](/manual/Web/API)).

O WPI em si permanece deliberadamente de baixo nível — a plataforma é onde as opiniões vivem: controllers, resource routing, erros problem+json, assets estáticos e convenções de views. Tudo o que ela conecta continua sendo WPI puro por baixo.

Ela é distribuída como um git submodule do starter kit, que a acompanha ao lado da plataforma Console: um kit novo configura todas as plataformas sem perguntar nada (veja [Primeiros passos](/guide/getting-started)), e uma execução posterior do wizard de projetos configura só as plataformas que o `--platform=` nomeia — `--platform=web` traz esta de volta a um kit de onde ela foi removida. Para construir um primeiro app e uma API REST passo a passo, siga o guia [Plataforma Web](/guide/web-platform); este manual cobre cada peça em profundidade.

## Instalando a plataforma

O instalador canônico já a configura — todas as plataformas vêm inicializadas:

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

## Como ela inicializa

O kit inicializa os submodules de plataforma **antes** da plataforma Bootgly, então projetos Web encontram o autoloader da plataforma já registrado. O `Web/autoboot.php` define as constantes da plataforma e registra o autoloader `Web\` — sem dependência do Bootgly, que ainda não foi carregado:

- `WEB_ROOT_BASE` e `WEB_ROOT_DIR` — a pasta da plataforma, sem e com o separador no final. O `WEB_ROOT_BASE` é o que marca a plataforma como instalada: o arquivo retorna na hora quando ele já está definido, e o `Bootgly::mount()` pula uma plataforma que nunca o definiu;
- `WEB_WORKING_BASE` e `WEB_WORKING_DIR` — a pasta onde o autoloader `Web\` procura primeiro, antes da pasta da plataforma: a própria pasta da plataforma, a menos que um lançador tenha definido as duas antes de incluir o arquivo;
- `WEB_VERSION` — o release da plataforma (`'1.2.0'`).

A raiz da plataforma, a classe `Web`, implementa `Bootgly\API\Platform`, então só pode existir depois que o autoloader do próprio Bootgly existe: o `Bootgly::autoboot()` a cria logo em seguida, antes de rotear qualquer comando, define a constante global `Web` e a inicializa:

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

Um projeto Web é um projeto Bootgly comum vinculado à interface `WPI`. Registre-o no `projects/Bootgly.projects.php` do consumidor, pelo seu caminho sob `projects/`:

```php
return [
   'Demo/Site' => ['interfaces' => ['WPI']],
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

Inicie-o como qualquer projeto, por esse caminho:

```bash :toolbar="true";
php bootgly project Demo/Site start
```

A plataforma traz estes **projetos de exemplo** em `Web/projects/Demo/`, e um kit novo importa todos eles para `projects/Demo/` automaticamente — guias vivos, para pessoas e agentes de IA:

- **Auth** (`:8087`) — um scaffold de autenticação por sessão/cookie: cadastro, verificação de e-mail, login com remember-me, redefinição de senha, SQLite.
- **Blog** (`:8080`) — o ciclo MVC completo: controllers, models do ORM, views, formulários com Session + CSRF, SQLite (zero setup).
- **Chat** (`:8085`) — salas em tempo real sobre o servidor WebSocket; a página do cliente é servida na mesma porta.
- **Site** (`:8088`) — páginas de landing: views despachadas por controller, layouts e estáticos inline, sem banco.
- **SPA** (`:8092`) — a mesma lista de tarefas como um build React e um build Vue do Vite, cada um servido pelo `Web\App\SPA` no seu próprio prefixo (`/react/`, `/vue/`), sobre uma API JSON com SQLite; o start faz os builds quando o Node.js e o npm estão no `PATH`.
- **Tasks** (`:8090`) — uma API REST: resources, erros problem+json, mutações protegidas por JWT, paginação.

## Skill para agentes

A plataforma traz uma skill para agentes de IA que programam, a `bootgly-build-web`, em `Web/templates/projects/.agents/skills/bootgly-build-web/`. O `SKILL.md` dela conduz um agente por um projeto Web do jeito que este manual faz — inicializar um `Web\App`, registrar rotas, mapear controllers, renderizar views, servir estáticos, proteger formulários com CSRF, testar por HTTP — e o `references/REST.md` acrescenta as convenções de API JSON do `Web\API`. Ela estende a skill `bootgly-build` do próprio framework.

O `bootgly kit boot` a instala em `<kit>/projects/.agents/skills/`, ao lado das skills `bootgly-*` do framework, enquanto a plataforma Web estiver configurada no kit — e a liga em `projects/.claude/skills/` para o Claude Code. Um kit novo roda esse passo sozinho; um kit que configura a plataforma depois, com `--platform=web`, recebe a skill na hora; o `bootgly kit boot --agents` instala só as regras e skills para agentes; e o `kit upgrade` e o `kit downgrade` as alinham ao release para o qual movem o kit. A cópia é gerenciada pela máquina — reescrita sempre que difere do template da plataforma, removida quando a plataforma deixa de trazê-la —, então não a edite (veja [CLI do Kit](/guide/kit/overview/#instale-os-diretórios-de-recursos)).

---

## Reference

```php
public function autoboot (): void
```

Inicializa o singleton da plataforma Web (a constante global `Web`) — o único método do contrato `Bootgly\API\Platform`, chamado pelo `Bootgly::autoboot()`. Protegido: inicializar duas vezes lança uma `Exception`. A plataforma em si não registra workables — apps inicializam por projeto.
