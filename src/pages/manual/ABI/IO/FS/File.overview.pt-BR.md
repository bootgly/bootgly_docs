# File

`File` é a primitiva de arquivo do Bootgly. Ela resolve um caminho (opcionalmente restrito a um
jail, o diretório `base`), carrega os metadados do arquivo só quando você os acessa (lazy) e
permite abrir, ler, escrever e apagar o arquivo. Duas operações tornam seguro compartilhar um
arquivo entre processos: `replace()` troca o conteúdo inteiro numa escrita atômica e durável, e
`lock()` / `unlock()` usam locks advisory (cooperativos) para que um processo que escreve espere
o outro terminar.

## Substituir um arquivo de forma atômica

```php
use Bootgly\ABI\IO\FS\File;

$Settings = new File('/var/app/storage/settings.json');

$Settings->replace(json_encode(['theme' => 'dark']), 0644); // true
```

`replace()` nunca escreve no arquivo que está sendo substituído. Ele grava os dados num arquivo
temporário oculto, no mesmo diretório e com nome aleatório (`.<random>.tmp`, criado em modo
exclusivo), faz o fsync desse arquivo, faz o rename dele por cima do arquivo de destino e, por
fim, faz o fsync do diretório. Quem lê o arquivo, neste processo ou em qualquer outro, vê o
arquivo antigo inteiro ou o novo inteiro — nunca um arquivo truncado ou escrito pela metade.

O fsync do diretório acontece depois do rename, quando o conteúdo novo já está no lugar, por isso
ele é best effort: se o diretório não puder ser aberto ou sincronizado, a substituição não é
tratada como falha — `replace()` continua retornando `true`. O que deixa de ser garantido é só que
a nova entrada do diretório sobreviva a uma queda de energia nos instantes seguintes.

`replace()` atua exatamente no caminho que você passou ao construtor. As operações de leitura do
`File` normalizam o caminho (a barra invertida vira separador e o `..` é resolvido) e, quando o
nome não existe, tentam a variante `.php` ou `/index.php`. `replace()` não faz nenhuma das duas
coisas: `new File('/srv/app/snap')` substitui `/srv/app/snap`, mesmo que `/srv/app/snap.php`
exista, e `link/..` é resolvido do jeito que o kernel resolve.

O arquivo novo recebe as permissões que você passar — `0600` (só o dono) por padrão — antes de o
primeiro byte ser gravado, qualquer que seja a umask do processo. O temporário é criado com uma
umask que acrescenta à umask do processo todos os bits que você não pediu: assim ele nunca tem um
bit além dos que você pediu. E, como a umask vale para o processo inteiro, um arquivo criado em
outro ponto do código nesse mesmo instante nunca ganha um bit que a umask do processo removeria.
Quando o modo resultante é diferente do que você pediu — a umask do processo removeu um dos seus
bits, você pediu bits de execução (todo arquivo novo é criado a partir de `0666`) ou uma ACL
default do diretório sobrepõe a umask — o temporário passa por um `chmod()` para o seu modo antes
do primeiro byte. Esse `chmod()` é feito pelo próprio descritor aberto do arquivo
(`/proc/self/fd` no Linux), nunca por um nome que alguém possa ter trocado nesse intervalo (nos
outros sistemas, ele é feito pelo nome, conferido antes e depois da chamada). Se o modo resultante
já é o que você pediu, nenhum `chmod()` é executado. Num sistema de arquivos que ignora `chmod()`
(com modos fixados por opções de montagem), um modo diferente só é aceito quando você pediu
exatamente o modo que uma escrita comum produziria (`0666 & ~umask()`); qualquer outro pedido é
recusado. Só são aceitos bits de permissão (de `0` a `0777`): setuid, setgid e sticky são
recusados.

`replace()` retorna `false`, sem mexer no arquivo de destino, quando:

- o diretório não existe ou não tem permissão de escrita;
- o caminho não é local (um stream wrapper como `php://memory` ou `file://…`, ou um byte NUL);
- o caminho não aponta para um arquivo (uma entrada de diretório): termina em `/`, o último
  segmento é `.` ou `..`, ou esse segmento contém uma barra invertida (que é separador em outro
  sistema e, depois de normalizada, faria o caminho sair do diretório);
- o diretório está fora do jail `base` (veja abaixo);
- não é possível aplicar as permissões ao temporário;
- a escrita ou o fsync do temporário falha — nesse caso o temporário é removido.

Se o destino for um symlink, o próprio symlink é substituído pelo arquivo novo; o arquivo para o
qual ele aponta nunca é escrito. Se o processo for morto no meio do `replace()`, o destino fica
intacto, mas o temporário não tem como ser removido: sobra um arquivo oculto `.<random>.tmp` no
mesmo diretório.

Depois da substituição, o `File` passa a descrever o arquivo novo: `$file` aponta para ele, e
todas as propriedades em cache — `$contents`, `$size`, `$permissions`, `$readable`, `$writable`,
`$executable`, `$owner`, `$group`, `$MIME`, os tempos, `$inode` e `$link` — são atualizadas.

Dentro do framework, o arquivo de ambiente, os templates compilados, o registro de projetos, os
dumps de observabilidade e o `bootgly lint --fix` já usam a substituição durável; o cache em
arquivo (File) e a fila em arquivo (File) usam a substituição sem fsync. Alguns pontos ainda não
migraram: continuam gravando num temporário próprio seguido de rename e passam a usar `replace()`
em versões futuras. São eles: os stores de certificados do cliente ACME e do AutoTLS, o handler
de arquivo da Session, o driver `Local` do Storage, o arquivo de estado do processo
(`ACI/Process/State`) e os artefatos e resultados dos processos filhos do benchmark
(`ACI/Tests/Benchmark`).

## Pular os fsyncs em registros que podem ser recriados

São os dois fsyncs que fazem o `replace()` sobreviver a uma queda de energia ou a um crash do
kernel — e são também o custo dele: cada um espera o disco. Para registros que você consegue gerar
de novo — entradas de cache, artefatos compilados, jobs temporários —, passe `durable: false`:

```php
$Entry = new File('/var/app/storage/cache/ab/abcdef.cache');

$Entry->replace(serialize(['hits' => 42]), 0644, durable: false); // true
```

Todo o resto continua igual: o temporário oculto criado em modo exclusivo, as permissões aplicadas
antes do primeiro byte, o rename, o jail e a limpeza. Quem lê continua vendo o arquivo antigo
inteiro ou o novo inteiro. O que muda é o comportamento num crash da máquina: logo depois dele, o
destino pode ter o conteúdo antigo ou, em alguns sistemas de arquivos, estar vazio. Mantenha o
default (`durable: true`) para tudo o que não pode ser recriado — configuração, credenciais, dados
de usuário.

Um registro que não é recriado automaticamente não conta como recriável, nem mesmo numa fila: a
fila File, ao devolver um job liberado ou recuperado, reescreve o arquivo dele sem fsync e depois
apaga a cópia reservada. Uma queda de energia logo em seguida pode deixar o arquivo do job vazio;
a fila ignora esse arquivo — e o job se perde.

## Serializar as escritas com um lock

`replace()` garante que cada escrita seja completa, mas dois processos que leem, alteram e
substituem o mesmo arquivo ainda podem sobrescrever a alteração um do outro. Mantenha um lock
durante todo o ciclo de ler, alterar e substituir:

```php
use Bootgly\ABI\IO\FS\File;

$Lock = new File('/var/app/storage/counter.lock');

if ($Lock->lock()) {            // espera enquanto outro processo detém o lock
   $Counter = new File('/var/app/storage/counter.txt');
   $count = (int) @file_get_contents('/var/app/storage/counter.txt');

   $Counter->replace((string) ($count + 1), 0644);

   $Lock->unlock();
}
```

Faça o lock num arquivo de lock separado, nunca no arquivo que você substitui: `replace()` coloca
um arquivo novo naquele caminho, então o próximo processo abriria o arquivo novo e faria o lock
nele, enquanto você ainda detém o lock do antigo.

Se o `File` ainda não tem um handle aberto, `lock()` abre o arquivo por conta própria — exatamente
no caminho que você passou, nunca na variante `.php` ou `/index.php` — num modo que nunca trunca
(leitura e escrita, criando o arquivo de lock se ele não existir; somente leitura quando não há
permissão de escrita). A partir daí, o `File` descreve o arquivo em que fez o lock: `$file` aponta
para ele, `read()` e `delete()` atuam sobre ele e todas as propriedades em cache são atualizadas —
mesmo que uma leitura anterior ao lock tivesse resolvido o nome para a variante `.php`. O lock é
liberado por `unlock()`, por `close()` ou quando o processo termina.

### Sem esperar

Passe `wait: false` para desistir na hora quando outro processo já detém o lock:

```php
$Lock = new File('/var/app/run/report.lock');

if ($Lock->lock(wait: false) === false) {
   echo "Another report is running.\n";

   return;
}

// ... gera o relatório ...

$Lock->close(); // libera o lock
```

### Leitores e escritores

Um lock exclusivo (o default) só pode ter um dono por vez. Um lock compartilhado —
`lock(exclusive: false)` — pode ter vários donos ao mesmo tempo, desde que todos peçam lock
compartilhado; enquanto algum deles mantiver o lock, ninguém consegue o exclusivo:

| Lock atual | Lock pedido | Resultado |
|---|---|---|
| exclusivo | exclusivo ou compartilhado | espera (ou `false` com `wait: false`) |
| compartilhado | compartilhado | concedido |
| compartilhado | exclusivo | espera (ou `false` com `wait: false`) |

Os locks são advisory: só valem para o código que também chama `lock()`. Dois objetos `File` no
mesmo processo entram em conflito exatamente como dois processos diferentes. `$locked` indica se o
`File` detém um lock.

Pedir o outro tipo de lock num handle que já tem um converte o lock existente, e essa conversão
não é atômica: o Linux solta o lock atual antes de tentar o novo. Se a conversão falhar —
`lock(exclusive: true, wait: false)` enquanto outro processo também detém o lock compartilhado —,
o handle fica sem lock nenhum, e `$locked` passa a `false` para indicar isso. Peça logo de início o
tipo de lock de que você precisa, ou chame `unlock()` e espere pelo novo.

## Dentro de um jail

Um `File` criado com um diretório `base` nunca atua fora dele. `replace()` verifica o diretório
onde o arquivo novo vai ficar: um caminho que sai do jail, seja por `..` ou por um diretório que é
symlink, é recusado; um symlink dentro do jail é substituído como link, sem ser seguido:

```php
$Upload = new File('/var/app/storage/../config/app.php', base: '/var/app/storage');

$Upload->replace('<?php return [];'); // false — o diretório está fora do jail
```

`lock()` abre o handle respeitando o mesmo jail: um arquivo de lock fora dele não é criado e não
recebe lock.

O jail é verificado no momento da chamada, a partir do caminho do diretório. Como o PHP não tem
`openat()`, o temporário e o rename continuam se referindo a esse diretório pelo caminho: alguém
com permissão de escrita dentro do jail que consiga trocar um dos diretórios por um link entre a
verificação e a escrita ainda pode redirecioná-los. O jail restringe os caminhos que o seu código
passa ao `File`; ele não deixa seguro um diretório compartilhado com alguém não confiável que
também tenha permissão de escrita nele.

## Referência

```php
public function replace (string $data, int $permissions = 0600, bool $durable = true): bool
```

Substitui o conteúdo do arquivo por `$data` numa escrita atômica e durável, exatamente no caminho
passado ao construtor (sem normalização e sem a variante `.php` / `/index.php`): um temporário com
nome aleatório é criado em modo exclusivo no mesmo diretório, recebe `$permissions` antes do
primeiro byte, é escrito por inteiro, passa por fsync e por rename por cima do destino; em seguida
o diretório passa por um fsync best effort (a troca já aconteceu). Com `$durable` em `false`, os
dois fsyncs são pulados — a troca continua atômica para quem lê, mas uma queda de energia ou um
crash do kernel pode deixar o conteúdo antigo ou um arquivo vazio. Um symlink no destino é
substituído, não seguido. Retorna `true` quando o destino contém o conteúdo novo; e `false` em
qualquer falha antes do rename — permissões fora de `0`–`0777`, caminho não local, caminho que não
aponta para um arquivo (`/` no final, último segmento `.`, `..` ou com barra invertida),
diretório inexistente ou somente leitura, diretório fora do jail `base`, permissões que não podem
ser aplicadas, falha na escrita —, removendo o temporário e sem mexer no destino. O `$file`
do File passa a apontar para o arquivo novo nesse caminho; todas as propriedades em cache
(`$contents`, `$size`, `$readable`, `$MIME`, `$modified`, …) são atualizadas. Um handle que já
estava aberto continua apontando para o arquivo antigo (o que foi substituído).

```php
public function lock (bool $exclusive = true, bool $wait = true): bool
```

Faz um lock advisory (`flock()`) no handle aberto do File — exclusivo ou compartilhado. Se não há
handle aberto, abre um exatamente no caminho passado ao construtor, num modo que nunca trunca
(`c+`, ou `r` quando não há permissão de escrita); um stream wrapper ou um byte NUL é recusado, e o
handle aberto aqui é fechado de novo se o lock não for obtido. Com `$wait`, bloqueia até o lock
ficar livre; sem ele, retorna `false` na hora se o lock estiver ocupado. Retorna `true` quando o
lock foi obtido. Um `lock()` que falha deixa `$locked` em false: uma conversão entre compartilhado
e exclusivo que falha solta o lock que o handle tinha (Linux). Quando o handle é aberto aqui, o
arquivo dele passa a ser o arquivo do File: `$file` aponta para ele e todas as propriedades em
cache são atualizadas.

```php
public function unlock (): bool
```

Libera o lock obtido por `lock()` e mantém o handle aberto. Retorna `false` se não houver handle
aberto ou se a liberação falhar.

```php
public protected(set) bool $locked
```

`true` enquanto o File detém um lock obtido por `lock()`; volta a `false` com `unlock()`,
`close()` ou qualquer `lock()` que falhe.

```php
public protected(set) null|bool $readable
```

Indica se este processo pode ler o arquivo apontado pelo File (`$file`); o valor é carregado sob
demanda (lazy) e guardado em cache. Embora declarado como `null|bool`, a leitura sempre retorna
um `bool`: um arquivo inexistente retorna `false`. `replace()` e um `lock()` que abre o próprio
handle atualizam o valor.

```php
public protected(set) null|bool $writable
```

Indica se este processo pode escrever no arquivo apontado pelo File — declaração, cache e
atualização iguais às de `$readable`: a leitura sempre retorna um `bool`.

```php
public protected(set) null|bool $executable
```

Indica se este processo pode executar o arquivo apontado pelo File — declaração, cache e
atualização iguais às de `$readable`: a leitura sempre retorna um `bool`.
