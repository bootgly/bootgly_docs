# Componente Wizard

O componente `Wizard` é um fluxo guiado multi-etapas declarativo sobre a espinha do [Timeline](/manual/CLI/UI/Components/Timeline/overview): cada step vincula um rótulo a um handler, e `run()` os percorre só para frente com a timeline fixa no topo da tela — steps passados com `✔` verde, o ativo com `◉` ciano, os futuros esmaecidos em cinza `○`. Cada ativação repinta uma tela nova, então o conteúdo do step ativo — qualquer componente que o handler renderize — fica sempre logo abaixo do frame, e o mapa completo do fluxo permanece visível enquanto o usuário responde. É o componente por trás do instalador canônico de projetos (`bootgly project create`).

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UX/Components/Wizard/showcase).

## Instância

Crie uma instância passando o `Input` e o `Output` do terminal (a assinatura dos compostos UX — os handlers alcançam ambos através do Wizard). O `title` opcional encabeça o frame a cada repintura:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Wizard;

$Terminal = CLI->Terminal;

$Wizard = new Wizard($Terminal->Input, $Terminal->Output);
$Wizard->title = '@#Cyan: Meu instalador @;';
```

## Adicionando steps

`add()` vincula um rótulo a um handler. O handler recebe o Wizard e retorna a nota do step — a anotação curta em cinza renderizada ao lado do rótulo concluído — ou `null` para nenhuma nota:

```php
$Wizard->add('Name', function (Wizard $Wizard): string {
   // ... pergunte algo ...
   return $name;   // vira: ✔ Name (App)
});

$Wizard->add('Build', function (Wizard $Wizard): null {
   // ... trabalhe, sem nota ...
   return null;    // vira: ✔ Build
});
```

## Executando

`run()` percorre os steps em ordem: cada ativação limpa a tela, pinta o título e o frame completo — com os steps futuros já visíveis em cinza — e invoca o handler logo abaixo. A conclusão fecha em uma tela nova com o frame final todo concluído; uma falha anexa o frame final, preservando o conteúdo e os Alerts do step que falhou:

```php
$done = $Wizard->run();
```

Retorna `true` quando o fluxo completa e `false` quando um step falha — ou quando chamado de novo (fluxos são one-shot) ou sem steps.

## Componentes entre os steps

Handlers instanciam componentes diretamente com o IO compartilhado — qualquer componente renderiza entre os pontos da timeline:

```php
use Bootgly\CLI\UI\Components\Question;

$Wizard->add('Name', function (Wizard $Wizard): string {
   $Question = new Question($Wizard->Input, $Wizard->Output);
   $Question->prompt = 'Project name';
   $Question->required = true;

   return $Question->ask();
});
```

O mesmo vale para `Menu`, `Fieldset`, `Alert`, `Progress` — ou saída raw. Dados fluem entre steps por capturas de closure (`use (&$name)`).

## Ramificações dinâmicas

`add()` também funciona durante o `run()` — adições mid-run inserem **logo após o step ativo** (na ordem de adição), então um handler encaixa os steps da ramificação que resolveu antes dos próximos. Declare os steps comuns antecipadamente (ficam visíveis em cinza) e ramifique no lugar:

```php
$Wizard->add('Interface', function (Wizard $Wizard) use (&$interface): string {
   // ... escolha CLI ou WPI ...

   // ? Fluxos WPI ganham um step Port — encaixado antes do Confirm seguinte
   if ($interface === 'WPI') {
      $Wizard->add('Port', fn (Wizard $Wizard): string => /* ... */);
   }

   return $interface;
});
$Wizard->add('Confirm', fn (Wizard $Wizard): null => /* ... */);
```

Um step resolvedor também pode anexar uma ramificação inteira — o step Mode do instalador adiciona toda a sequência from-scratch, de importação de plataformas ou de importação git assim que o usuário escolhe uma.

## Falhando um step

Lance qualquer `Throwable` para falhar o step e parar o fluxo: o step é marcado com `✖` vermelho, os steps seguintes ficam pendentes, `run()` retorna `false` e o Throwable é exposto em `$Wizard->Throwable`. A mensagem vira a nota do ✖ — mantenha um slug curto e renderize contexto rico (um `Alert`) antes de lançar:

```php
$Wizard->add('Confirm', function (Wizard $Wizard): null {
   $Question = new Question($Wizard->Input, $Wizard->Output);

   if ($Question->confirm('Create the project?', default: true) === false) {
      throw new Exception('aborted');   // vira: ✖ Confirm (aborted)
   }

   return null;
});
```

## Saída não-interativa

Em pipes e CI, nenhuma tela é limpa e nenhum frame é impresso: o título renderiza uma vez e cada transição anexa uma linha simples — `◉ label` na ativação, `✔ label (nota)` na conclusão, `✖ label (nota)` na falha — exatamente o comportamento append do Timeline. Os componentes dos handlers degradam por conta própria (um `Question` lê uma linha do stdin), então o mesmo código roda interativamente e em scripts.

## Referência

### Propriedades

```php
public Input $Input
```

O Input do terminal compartilhado com os componentes dos handlers.

```php
public Output $Output
```

O Output do terminal compartilhado com os componentes dos handlers.

```php
public string $title
```

Config. Cabeçalho repintado acima do frame em terminais interativos — renderizado uma vez na saída não-interativa. Padrão: `''`.

```php
public private(set) Timeline $Timeline
```

Data (somente leitura). A espinha de estado e renderização — configure os glifos de estado por `$Wizard->Timeline->glyphs`.

```php
public private(set) null|Throwable $Throwable
```

Metadata (somente leitura). O Throwable que falhou o fluxo — `null` enquanto nenhum.

```php
public private(set) bool $finished
```

Metadata (somente leitura). Se o fluxo terminou (completo ou falho).

### add()

```php
public function add (string $label, Closure $handler): Step
```

Adiciona um step: o rótulo entra na timeline e o handler é invocado quando o step ativa. Chamável antes e durante o `run()` — adições mid-run inserem logo após o step ativo, na ordem de adição. Retorna o `Step` do Timeline.

### run()

```php
public function run (): bool
```

Executa o fluxo só para frente, one-shot: ativa cada step, apresenta o frame (uma tela nova por ativação em terminais interativos; uma linha append em pipes), invoca o handler e marca o step concluído com a nota retornada. Um throw no handler falha o step e para o fluxo. Retorna se o fluxo completou.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza o frame atual da timeline — separado por linha em branco ao escrever; retorna o frame de markup raw com `RETURN_OUTPUT`.
