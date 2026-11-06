# File

`File` é a primitiva de arquivo do Bootgly: ela resolve um caminho (opcionalmente dentro de uma
jaula `base`), lê os seus metadados sob demanda e o abre, lê, escreve e apaga. Duas operações
tornam seguro compartilhar um arquivo entre processos: `replace()` troca o conteúdo inteiro de
forma atômica e durável, e `lock()` / `unlock()` tomam locks consultivos para que escritores
esperem uns pelos outros.

## Substituir um arquivo atomicamente

```php
use Bootgly\ABI\IO\FS\File;

$Settings = new File('/var/app/storage/settings.json');

$Settings->replace(json_encode(['theme' => 'dark']), 0644); // true
```

`replace()` nunca escreve dentro do arquivo que substitui. Ele escreve os dados num irmão oculto
de nome aleatório (`.<aleatório>.tmp`, criado de forma exclusiva no mesmo diretório), sincroniza
esse arquivo com o disco, renomeia-o por cima do alvo e sincroniza o diretório. Um leitor, neste
processo ou em qualquer outro, vê o arquivo antigo inteiro ou o novo inteiro — nunca um arquivo
truncado ou escrito pela metade.

A sincronização do diretório vem depois do rename, quando o novo conteúdo já está no lugar, então
ela é de melhor esforço: um diretório que não pode ser aberto ou sincronizado não transforma o
replace numa falha — `replace()` continua retornando `true`; só a sobrevivência da nova entrada a
uma queda de energia nos instantes seguintes não é garantida.

`replace()` age exatamente sobre o caminho que você deu ao construtor. O lado de leitura do `File`
normaliza um caminho (uma barra invertida vira separador, `..` é dobrado) e converte um nome
ausente no seu irmão `.php` ou `/index.php`; `replace()` não faz nenhum dos dois:
`new File('/srv/app/snap')` substitui `/srv/app/snap`, mesmo quando `/srv/app/snap.php` existe, e
`link/..` é resolvido como o kernel o resolve.

O novo arquivo recebe as permissões que você passar — `0600` (só o dono) por padrão — antes do
seu primeiro byte ser escrito, seja qual for a umask do processo. O temporário é criado sob uma
umask que soma à umask do processo todo bit que você não pediu: ele nunca tem um bit além dos
seus e, como a umask é compartilhada pelo processo inteiro, um arquivo criado em outro ponto
nesse instante nunca ganha um bit que a umask do processo remove. Quando o modo criado difere do
que você pediu — a umask do processo removeu um dos seus bits, você pediu bits de execução (um
arquivo novo nasce de `0666`) ou uma ACL padrão no diretório se sobrepõe à umask — o temporário
recebe `chmod()` para o seu modo antes do primeiro byte, pelo seu próprio descritor aberto
(`/proc/self/fd` no Linux), nunca por um nome que alguém possa ter trocado (nos outros sistemas,
pelo nome, conferido antes e depois da chamada). Quando o modo criado já é o seu, nenhum
`chmod()` roda. Num sistema de arquivos que ignora `chmod()` (modos fixados por opções de
montagem), um modo diferente só é aceito quando você pediu o modo que uma escrita comum dá
(`0666 & ~umask()`); qualquer outro pedido é recusado. Só os bits de permissão são aceitos (`0` a
`0777`): setuid, setgid e sticky são recusados.

Ele retorna `false`, e deixa o alvo intocado, quando:

- o diretório não existe ou não é gravável;
- o caminho não é local (um stream wrapper como `php://memory` ou `file://…`, ou um byte NUL);
- o caminho não nomeia uma entrada: termina em `/`, o seu último segmento é `.` ou `..`, ou esse
  segmento contém uma barra invertida (um separador em outro sistema, que um normalizador
  transformaria numa subida para fora do diretório);
- a jaula `base` não contém o diretório (veja abaixo);
- as permissões não podem ser dadas ao temporário;
- escrever ou sincronizar o temporário falha — o temporário é removido.

Um symlink no alvo é substituído pelo novo arquivo; o arquivo para o qual ele aponta nunca é
escrito. Um processo morto no meio de `replace()` deixa o alvo intacto, mas não consegue remover
o seu temporário: um irmão oculto `.<aleatório>.tmp` fica para trás.

Depois de um replace, o `File` descreve o novo arquivo: `$file` o nomeia, e toda propriedade em
cache — `$contents`, `$size`, `$permissions`, `$readable`, `$writable`, `$executable`, `$owner`,
`$group`, `$MIME`, os tempos, `$inode` e `$link` — é renovada.

Dentro do framework, o arquivo de ambiente, os templates compilados, o registro de projetos, os
dumps de observabilidade e o `bootgly lint --fix` substituem de forma durável; o cache File e a
fila File substituem sem sincronizar. Ainda não migrados — eles continuam escrevendo pelo seu
próprio temporário e rename, e passam para `replace()` em versões futuras: os armazenamentos de
certificados do cliente ACME e do AutoTLS, o handler de arquivo da Session, o driver `Local` do
Storage, o arquivo de estado de processo (`ACI/Process/State`) e os artefatos e resultados de
filhos do benchmark (`ACI/Tests/Benchmark`).

## Pular as sincronizações em registros que você pode refazer

As duas sincronizações são o que faz `replace()` sobreviver a uma queda de energia ou a uma falha
do kernel, e são também o seu custo: cada uma espera pelo disco. Para registros que você pode
gerar de novo — entradas de cache, artefatos compilados, jobs transitórios — passe
`durable: false`:

```php
$Entry = new File('/var/app/storage/cache/ab/abcdef.cache');

$Entry->replace(serialize(['hits' => 42]), 0644, durable: false); // true
```

Todo o resto continua igual: o temporário oculto exclusivo, as permissões antes do primeiro byte,
o rename, a jaula e a limpeza. Os leitores continuam vendo o arquivo antigo inteiro ou o novo
inteiro. O que muda é uma queda da máquina: logo depois dela, o alvo pode conter o conteúdo antigo
ou, em alguns sistemas de arquivos, um arquivo vazio. Mantenha o padrão (`durable: true`) para
tudo o que não pode ser refeito — configuração, credenciais, dados de usuário.

Um registro que não se refaz sozinho não é regenerável, nem numa fila: a fila File devolve um job
liberado ou recuperado reescrevendo-o sem sincronizar e depois apagando a sua cópia reservada,
então uma queda de energia logo em seguida pode deixar um arquivo de job vazio, que a fila pula —
esse job se perde.

## Serializar escritores com um lock

`replace()` torna cada escrita inteira, mas dois processos que leem, alteram e substituem o mesmo
arquivo ainda podem perder a alteração um do outro. Segure um lock em volta do ciclo
ler-alterar-substituir:

```php
use Bootgly\ABI\IO\FS\File;

$Lock = new File('/var/app/storage/counter.lock');

if ($Lock->lock()) {            // espera enquanto outro processo o segura
   $Counter = new File('/var/app/storage/counter.txt');
   $count = (int) @file_get_contents('/var/app/storage/counter.txt');

   $Counter->replace((string) ($count + 1), 0644);

   $Lock->unlock();
}
```

Trave um arquivo de lock separado, nunca o arquivo que você substitui: `replace()` coloca um
arquivo novo no caminho, então o próximo processo abriria — e travaria — o arquivo novo enquanto
você ainda segura o lock do antigo.

`lock()` abre o próprio arquivo quando não há handle aberto — exatamente o caminho que você deu,
nunca um irmão `.php` ou `/index.php` — num modo que nunca trunca (leitura/escrita, criando um
arquivo de lock ausente; somente leitura quando o arquivo não é gravável). A partir daí o `File`
descreve o arquivo que travou: `$file` o nomeia, `read()` e `delete()` agem sobre ele e toda
propriedade em cache é renovada — mesmo quando uma leitura antes do lock tinha resolvido o nome
para o seu irmão `.php`. O lock é liberado por `unlock()`, por `close()` e quando o processo
termina.

### Sem esperar

Passe `wait: false` para desistir na hora quando outro processo segura o lock:

```php
$Lock = new File('/var/app/run/report.lock');

if ($Lock->lock(wait: false) === false) {
   echo "Outro relatório está rodando.\n";

   return;
}

// ... monta o relatório ...

$Lock->close(); // libera o lock
```

### Leitores e escritores

Um lock exclusivo (o padrão) admite um único dono. Um lock compartilhado —
`lock(exclusive: false)` — admite qualquer número de donos compartilhados, e nenhum exclusivo
enquanto eles o seguram:

| Seguro | Pedido | Resultado |
|---|---|---|
| exclusivo | exclusivo ou compartilhado | espera (ou `false` com `wait: false`) |
| compartilhado | compartilhado | concedido |
| compartilhado | exclusivo | espera (ou `false` com `wait: false`) |

Locks são consultivos: só vinculam código que também chama `lock()`. Dois objetos `File` no mesmo
processo conflitam exatamente como dois processos. `$locked` diz se o `File` segura um lock.

Pedir o outro tipo num handle que já segura um lock o converte, e uma conversão não é atômica: o
Linux solta o lock seguro antes de tentar o novo. Quando a conversão falha —
`lock(exclusive: true, wait: false)` enquanto outro processo compartilha o lock — o handle fica
sem lock nenhum, e `$locked` passa a `false` para dizê-lo. Tome de uma vez o lock de que você
precisa, ou chame `unlock()` e espere pelo novo.

## Dentro de uma jaula

Um `File` criado com um diretório `base` nunca age fora dele. `replace()` julga o diretório onde
o novo arquivo cai — um caminho que sai da jaula, por `..` ou por um diretório que é symlink, é
recusado; um symlink dentro da jaula é substituído como o próprio link:

```php
$Upload = new File('/var/app/storage/../config/app.php', base: '/var/app/storage');

$Upload->replace('<?php return [];'); // false — o diretório está fora da jaula
```

`lock()` abre o seu handle pela mesma jaula: um arquivo de lock fora dela não é criado nem
travado.

A jaula é julgada quando a chamada roda, sobre o caminho do diretório. O PHP não tem `openat()`,
então o temporário e o rename ainda nomeiam esse diretório pelo caminho: um escritor dentro da
jaula capaz de trocar um dos seus diretórios por um link entre a checagem e a escrita ainda pode
desviá-los. A jaula confina os caminhos que o seu código entrega ao `File`; ela não torna seguro
um diretório compartilhado com um escritor não confiável.

## Referência

```php
public function replace (string $data, int $permissions = 0600, bool $durable = true): bool
```

Substitui o conteúdo do arquivo por `$data` de forma durável e atômica, exatamente no caminho dado
ao construtor (nunca normalizado, nunca convertido para `.php` / `/index.php`): um irmão
temporário de nome aleatório é criado de forma exclusiva, recebe `$permissions` antes do seu
primeiro byte, é escrito por inteiro, sincronizado, renomeado por cima do alvo, e o diretório é
sincronizado como melhor esforço (a troca já aconteceu). Com `$durable` em `false` as duas
sincronizações são puladas — a troca continua atômica para os leitores, mas uma queda de energia
ou uma falha do kernel pode deixar o conteúdo antigo ou um arquivo vazio. Um symlink no alvo é
substituído, não seguido. Retorna `true` quando o alvo contém o novo conteúdo; `false` em
qualquer falha antes do rename — permissões fora de `0`–`0777`, um caminho não local, um caminho
que não nomeia entrada (um `/` final, um último segmento `.`, `..` ou com barra invertida), um
diretório ausente ou somente leitura, um diretório fora da jaula `base`, permissões que não podem
ser aplicadas, uma escrita que falhou — com o temporário removido e o alvo intocado. A entrada
substituída vira o `$file` do File; toda propriedade em cache (`$contents`, `$size`, `$readable`,
`$MIME`, `$modified`, …) é renovada. Um handle aberto continua apontando para o arquivo
substituído.

```php
public function lock (bool $exclusive = true, bool $wait = true): bool
```

Toma um lock consultivo (`flock()`) no handle aberto do File — exclusivo ou compartilhado. Sem
handle aberto, abre um, exatamente no caminho dado ao construtor, que nunca trunca (`c+`, ou `r`
quando o arquivo não é gravável); um stream wrapper ou um byte NUL é recusado, e um handle aberto
aqui é fechado de novo quando o lock não é tomado. Com `$wait` bloqueia até o lock ficar livre;
sem ele, retorna `false` na hora quando o lock está ocupado. Retorna `true` quando o lock está
seguro. Um `lock()` que falha deixa `$locked` em false: uma conversão entre compartilhado e
exclusivo que falha solta o lock que o handle segurava (Linux). Um handle aberto aqui vira a
entrada do File: `$file` o nomeia e toda propriedade em cache é renovada.

```php
public function unlock (): bool
```

Libera o lock tomado por `lock()` e mantém o handle aberto. Retorna `false` quando não há handle
aberto ou a liberação falha.

```php
public protected(set) bool $locked
```

`true` enquanto o File segura um lock tomado por `lock()`; limpo por `unlock()`, `close()` e
qualquer `lock()` que falhe.

```php
public protected(set) null|bool $readable
```

Se a entrada do File pode ser lida por este processo, lido sob demanda e guardado em cache.
Declarado `null|bool`, sempre é lido como `bool`: um arquivo ausente lê `false`. `replace()` e um
`lock()` que abre o próprio handle o renovam.

```php
public protected(set) null|bool $writable
```

Se a entrada do File pode ser escrita por este processo — mesma declaração, cache e renovação de
`$readable`: sempre é lido como `bool`.

```php
public protected(set) null|bool $executable
```

Se a entrada do File pode ser executada por este processo — mesma declaração, cache e renovação
de `$readable`: sempre é lido como `bool`.
