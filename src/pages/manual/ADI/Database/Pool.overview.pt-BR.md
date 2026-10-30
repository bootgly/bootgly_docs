# Pool de conexões

`Bootgly\ADI\Database\Pool` é dono das conexões com um endpoint de banco. Toda fachada cria um para
o endpoint em que está configurada (`$Database->Pool`), e a fachada SQL cria mais um por réplica de
leitura (`$Database->ReplicaPools`). O pool entrega uma conexão a cada operação, faz pipeline de
novas operações em conexões ocupadas quando está cheio, estaciona em `pending` o que ainda não pode
rodar e retoma a vaga sempre que uma operação termina, falha, expira, é cancelada ou é retirada. O
tamanho e o prazo vêm da configuração da conexão: `pool.max` e `timeout` (veja
**[Configuração](/manual/ADI/Database/Config/overview/)**).

Em rotas do `HTTP_Server_CLI`, o resource `$Response->Database` conduz o pool por você (veja
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**). Esta
página mostra o que o pool faz por baixo, e como conduzi-lo a partir de um script.

## Dimensione o pool

```php
use RuntimeException;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
   'pool' => ['max' => 1],
]);

$Database->await($Database->query('SELECT 1'));

$Slow = $Database->query('SELECT pg_sleep(0.2)');
$Fast = $Database->query('SELECT 2 AS value');

$Database->Pool->created;        // 1
count($Database->Pool->busy);    // 1
count($Database->Pool->pending); // 0

$Database->await($Fast);
$Database->await($Slow);
```

`pool.max` (padrão `8`) limita as conexões que um pool abre. O limite é por pool: cada instância
de `SQL` ou `KV` tem o seu — o resource HTTP cria um por worker — e cada réplica de leitura tem um
pool próprio, com o `pool.max` do primário a menos que a réplica defina o dela. As conexões abrem
sob demanda, na primeira operação que precisa de uma: `pool.min` é aceito, mas por enquanto o pool
nunca abre conexões antecipadamente.

O primeiro `await()` abre e autentica a única conexão do pool. Em seguida `$Slow` a ocupa e o pool
fica cheio, então `$Fast` se junta à conexão ocupada em vez de esperar: o PostgreSQL faz pipeline
dela no mesmo socket, o MySQL a enfileira atrás do statement que está na cabeça. `pending` continua
vazio.

### Saturação e co-localização

O pool acompanha suas conexões `idle` e `busy`, as operações estacionadas em `pending` e quantas
conexões ele criou (`created`). Ele se esgota quando não há conexão idle disponível e `created`,
mais as vagas ainda retidas por statements SQL retirados cuja sessão precisou ser derrubada (cada
uma até o próprio deadline — veja [Vagas retidas](#vagas-retidas)), alcança o `max`. A partir daí
uma nova operação se junta a uma conexão busy pronta — em rodízio entre elas — que nenhuma
transação segura e que não deve reset de sessão (veja [Reset de sessão](#reset-de-sessão)); um
`BEGIN`, ou uma operação sem uma conexão dessas para se juntar, aguarda em `pending`. Uma conexão
ainda abrindo ou autenticando não está pronta, então num pool frio uma operação que não encontra
espaço também é estacionada em `pending`. Quando uma conexão é liberada, o pool promove operações
pendentes.

`created` é a contagem do próprio pool, e toda conexão que ele segura — idle, busy ou reservada por
uma transação — é uma que ele conta. Uma conexão que o pool descartou continua descartada mesmo
que um driver reconecte o mesmo objeto por conta própria: ela não é entregue de novo nem serve de
alvo para pipelining, porque o trabalho nela nunca contaria contra o `max`. E uma operação que o
pool estacionou sai da fila no instante em que termina, então nada pode promover e re-despachar
trabalho que o chamador já cancelou.

## Aguarde de forma síncrona

```php
$Operation = $Database->query('SELECT * FROM missing_table');

try {
   $Database->await($Operation);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // relation "missing_table" does not exist
   $Operation->error;        // relation "missing_table" does not exist
   $Operation->code;         // 42P01
}
```

`await()` é o `Pool::wait()` do pool dono da operação, então `$Database->Pool->wait($Operation)` faz
o mesmo. Ele avança a operação e dorme num `stream_select()` sobre o socket que o driver pede, até
a operação terminar. Quando a operação falha, o `wait()` lança uma `RuntimeException` cuja mensagem
é `$Operation->error`, e a operação mantém o seu `error` — e, no SQL, o seu `code`. Outras duas
`RuntimeException`s vêm da própria espera e deixam a operação sem terminar:
`Database operation did not provide readiness.` (uma operação não terminada não lhe deu nada para
esperar) e `Database operation readiness wait failed.` (o `stream_select()` falhou por um motivo
que não é um sinal).

O próximo exemplo reaproveita o pool com `pool.max` `1` de [Dimensione o pool](#dimensione-o-pool):

```php
$Slow = $Database->query('SELECT pg_sleep(0.2)');
$Transaction = $Database->begin();

count($Database->Pool->pending); // 1

$Database->await($Slow);
$Database->await($Transaction->Operation);

$Database->await($Transaction->commit());
```

Um `BEGIN` nunca divide conexão, então enquanto `$Slow` segura a única que existe, o `BEGIN` da
transação aguarda em `pending`. Aguardar `$Slow` primeiro libera a conexão dele, e essa liberação
promove o `BEGIN` estacionado para ela.

A ordem inversa falha. `pending` pertence ao caminho assíncrono, onde algo mais segue avançando as
operações que seguram as conexões. `Pool::wait()` é a API síncrona: enquanto ela bloqueia, nada
avança aquelas operações, e só elas podem liberar uma vaga. Então aguardar uma operação estacionada
— o `BEGIN` acima, antes de `$Slow` — a recusa com
`Database pool has no capacity for the operation.` e a tira de `pending`, em vez de esperar por uma
capacidade que não pode chegar. Deixá-la enfileirada seria pior que recusá-la: o chamador é
informado de que sua escrita falhou e compensa, com um rollback por exemplo, enquanto o `promote()`
ainda colocaria o comando no wire quando a capacidade liberasse — fora da transação, em autocommit.
Num script, aguarde as operações na ordem em que as criou, ou mantenha em voo menos delas que o
`pool.max`.

Um sinal sem restart pode interromper o `stream_select()` usado pelo `wait()` síncrono. EINTR não
altera a operação nem sua readiness, então o pool reconhece o errno da syscall mesmo quando a
mensagem do sistema operacional está traduzida e repete a espera com a mesma operação. Outras
falhas de select continuam propagando, e o timeout configurado da operação ainda pode expirá-la
normalmente; uma espera interrompida não é convertida em resultado de banco.

## Cancele um statement em execução

```php
$Running = $Database->query('SELECT pg_sleep(30)');
$Database->advance($Running);

$Database->cancel($Running);

try {
   $Database->await($Running);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // canceling statement due to user request
}

$Running->cancelled; // true
$Running->revoked;   // true
```

`cancel()` pede ao servidor que pare o statement por um canal lateral — o `CancelRequest` do
PostgreSQL, o `KILL QUERY` do MySQL — e marca `cancelled` assim que esse pedido chega ao wire. Ele
é advisory: a operação ainda resolve, falha ou expira na própria conexão, conforme o servidor
encerra o statement. O PostgreSQL a falha com `canceling statement due to user request` (SQLSTATE
`57014`); um statement MySQL interrompido por `KILL QUERY` também pode simplesmente retornar antes
— `SLEEP()` retorna `1` — e então termina normalmente. Aqui um único `advance()` escreve o
statement porque a conexão já está aberta. Numa conexão ainda abrindo não existe sessão no
servidor para nomear, e o cancel falha a operação localmente:
`PostgreSQL cancellation requires BackendKeyData.` ou
`MySQL cancellation requires the greeting thread id.` O Redis não tem cancelamento: `cancel()`
falha um comando já enviado com `Database driver does not support cancellation.` Uma operação
SQLite que conseguiu a conexão já terminou quando `query()` retorna, então não sobra nada para
cancelar; uma estacionada em `pending` — atrás de uma transação que segura a conexão — é falhada
localmente como qualquer operação estacionada.

Cancelar é uma decisão, não uma mensagem. A desistência é registrada no momento em que você a pede
— `revoked` é marcado antes de o driver ser consultado —, então vale tanto se o driver envia o
pedido, quanto se ele recusa porque o protocolo não tem por onde, quanto se recusa porque não
suporta cancelamento, quanto se falha de vez na tentativa. O fallback automático de uma leitura de
réplica para o pool primário não revive depois uma operação cancelada. Isso é separado de o cancel
ter chegado ou não ao servidor, que é o que decide se a conexão ainda tem resposta a reconciliar.

Se alguma coisa é de fato *enviada* depende de onde a operação está. Um pedido de cancel nomeia um
backend, não um statement, então um pedido enviado para trabalho que não está rodando chegaria no
que aquele backend estiver fazendo. Por isso uma operação que já terminou, e uma ainda composta mas
nunca escrita, são retiradas localmente e nada vai para o wire. As duas diferem no que sobra para
quem chamou: uma operação finda mantém seu estado e seu resultado, enquanto uma que nunca chegou ao
servidor é falhada com `Database operation was cancelled before reaching the server.`, já que o
trabalho dela não aconteceu. Uma operação estacionada ainda não tem driver e é falhada com
`Database operation has no protocol to cancel.` Só uma operação de fato em voo gera um pedido.

Se o socket local tiver sido fechado enquanto esse pedido sai, a operação falha na hora com
`Database connection was lost while cancelling the operation.` em vez de esperar uma resposta que
não pode mais chegar, e a vaga dela volta para o pool. Um peer que some sem o socket local perceber
não é detectável aqui — essa conexão é descoberta pela próxima operação que a usar.

Um cancelamento que nunca chega ao servidor segue o mesmo caminho de um prazo vencido (veja
[Defina um prazo](#defina-um-prazo)): quando o canal lateral não pode ser estabelecido, a operação
é finalizada localmente enquanto o servidor continua respondendo ao comando original, e o pool
reconcilia esse wire (`Driver::abandon()`) antes de retomar a conexão.

## Operações retiradas

```php
$Running = $Database->query('SELECT pg_sleep(0.3)');
$Database->advance($Running);

$Database->withdraw($Running);

$Running->error;              // Database operation was withdrawn: its caller stopped waiting.
$Running->revoked;            // true
count($Database->Pool->idle); // 1

$Database->await($Database->query('SELECT 1'));
```

Quando quem chamou simplesmente para de esperar — uma resposta deferred cuja espera foi recusada ou
interrompida, ou cuja Fiber foi destruída — a contraparte local do `cancel()` é o `withdraw()`, e
nada é enviado ao servidor. `Pool::withdraw()` falha uma operação não terminada com
`Database operation was withdrawn: its caller stopped waiting.`, marca-a como `revoked` para que
nenhum pool de fallback a re-despache, deixa o driver reconciliar o wire (`Driver::detach()`) e
retoma a vaga; uma conexão ainda conectando ou autenticando é descartada. Uma operação que já
terminou mantém seu resultado, é marcada como `revoked` e é apenas esquecida. Ele é síncrono e nunca
suspende, então é seguro no `finally` de uma Fiber sendo destruída. `Database::withdraw()` — nas
fachadas SQL e KV — recebe várias operações e as retira numa ordem segura (primeiro as
estacionadas, depois as que ainda não estão lendo, por fim os leitores em pipeline), tenta todas e
relança a primeira falha.

No exemplo a conexão já está aberta, então um único `advance()` põe o statement no servidor antes
de ele ser retirado: a conexão volta direto para `idle`, e a próxima query espera atrás do resto da
resposta retirada — cerca de `0.3` segundo — antes de ler a própria. Retirada enquanto a conexão
ainda abria, a operação levaria essa conexão junto.

### Sessões mantidas

Uma retirada não interrompe um statement que o servidor já recebeu, e não custa a sessão. Quando o
batch da operação está inteiro no wire (estado `Reading`), o driver mantém a sessão e **destaca** a
operação (`Driver::detach()`): a resposta restante é absorvida por um stand-in que ninguém espera,
a conexão volta para `idle` na hora — a menos que outros chamadores ainda leiam ali —, e a próxima
operação que o pool entregar a ela entra na fila atrás do stand-in e drena essa resposta antes da
própria. Uma conexão idle que ainda deve essas respostas só serve quando nenhuma conexão idle limpa
está disponível, mas antes de uma nova ser aberta: ela já segura a vaga dela, e drená-la é o que a
devolve ao serviço. A vaga é segurada pela sessão viva pelo tempo real de execução do statement,
não até o deadline — então uma rajada de desconexões de clientes não trava o pool pelo `timeout`
das operações (`30` segundos por padrão).

### Vagas retidas

O pool segura uma vaga além da sessão — contada contra o `max` até o deadline da própria operação
retirada — só quando uma sessão com trabalho no servidor precisa ser derrubada. Isso vale para os
drivers SQL (`Driver::LINGERING`): um servidor SQL em geral termina — ou desfaz com rollback — o que
lhe foi pedido antes de perceber que o cliente saiu. Quatro casos terminam com a sessão derrubada:

- um batch que o driver estava no meio de escrever (estado `Querying`): os bytes restantes nunca
  poderão ser atribuídos. Um que nunca escreveu um byte — um batch PostgreSQL em texto puro, um
  comando MySQL enfileirado atrás da cabeça — é apenas retirado localmente: a sessão é mantida e
  nada é retido;
- uma retirada numa conexão reservada por uma transação: ninguém entregaria essa conexão ao próximo
  chamador para drenar um stand-in, então o pool a reconcilia com `Driver::abandon()`, que derruba
  uma sessão sem ninguém para lê-la. O statement que um `rollback()` ou `abort()` de nível superior
  ultrapassa é retirado desse mesmo jeito (veja
  [Transações](/manual/ADI/Databases/SQL/Transaction/overview/)). Um `BEGIN` retirado depois de
  chegar ao servidor derruba a sessão dele mesmo quando o driver conseguiria drená-la: o `BEGIN`
  pode ter aberto uma transação que ninguém vai encerrar;
- uma sessão cortada depois, antes de drenar os stand-ins que manteve — a operação enfileirada atrás
  deles expirou sem ninguém para ler, um erro de I/O, um teardown de transação. O pool passa então a
  contar a vaga até o deadline do próprio statement retirado, como se a sessão tivesse sido
  derrubada na retirada;
- um reset de sessão que não consegue ser escrito inteiro quando a sessão volta para `idle` (veja
  [Reset de sessão](#reset-de-sessão)): a sessão é cortada como uma que não pôde ser mantida —
  nenhum chamador a compartilha mais.

O resource de resposta HTTP nunca cai no segundo caso quando uma Fiber de requisição é destruída
dentro de `transact()` — ele adota a transação (veja [Reset de sessão](#reset-de-sessão)) —, mas uma
espera recusada ou interrompida ali ainda cai.

A contrapartida é que a vaga de uma sessão derrubada fica indisponível até esse deadline passar. Um
statement que continua rodando segura a sessão mantida até terminar: a próxima operação entregue a
essa conexão espera atrás dele, até o próprio deadline. Essa operação falha no deadline, mas o que
ela enviou ainda pode rodar: o PostgreSQL faz pipeline, então um batch enfileirado atrás de um
stand-in costuma já estar no wire quando expira, e o servidor o executa quando chega a ele. O
resultado de uma operação que expirou é desconhecido — verifique se as escritas dela foram
gravadas, ou torne a unidade de trabalho idempotente, antes de repeti-la. (O MySQL só escreve um
comando enfileirado quando ele chega à cabeça, então um que nunca chegou lá não rodou em lugar
algum.) Quando uma sessão é mantida, a própria conexão continua contando e nada extra fica retido.
Um servidor key-value como o Redis descarta na hora o trabalho de um cliente desconectado
(`Driver::LINGERING` é `false`), então um comando KV retirado nunca retém a vaga além da sessão
derrubada.

Essa contabilidade impede que uma rajada de desconexões de clientes inunde o banco com queries
abandonadas: uma sessão mantida é uma sessão, e ela roda os statements um depois do outro. Para uma
sessão derrubada, o teto de `pool.max` statements rodando no servidor só vale enquanto esses
statements terminam dentro do próprio deadline, e só quando a operação tem um deadline. Uma operação
com `timeout` `0` não tem nenhum, então uma retirada que derruba a sessão não retém vaga alguma. Um
statement que continua rodando depois que o deadline passa — retirado ou expirado — deixa de ser
contado, e aí o servidor pode executar mais de `pool.max` statements ao mesmo tempo. Combine o
`timeout` do pool com um timeout de statement no servidor igual ou menor (o `statement_timeout` do
PostgreSQL, por exemplo), para que o servidor interrompa o que o pool deixou de contar.

### Reset de sessão

Manter a sessão tem uma consequência: um statement ainda pode pegar estado de escopo de sessão
depois que o chamador saiu — um lock concedido tarde, uma subscrição — e uma sessão mantida o levaria
ao próximo chamador. Por isso uma retirada cujo statement chegou ao servidor **marca**
(`Pool::taint()`) a sessão que manteve, e a liberação que em seguida devolve essa sessão a `idle`
escreve primeiro um **reset**, uma vez: PostgreSQL `SELECT pg_advisory_unlock_all(); UNLISTEN *`,
MySQL `DO RELEASE_ALL_LOCKS()`. Essa é a liberação depois da qual ninguém deve trabalho na conexão
(`Driver::check()`): a própria da retirada quando nenhum chamador vivo compartilha a sessão — o reset
então sai na hora — ou então a do último dos chamadores que a compartilham, de modo que o reset nunca
falha um deles e nunca encerra o que um deles ainda executa. O driver o escreve atrás de tudo o que a
sessão ainda deve, então o servidor o executa logo depois que o statement abandonado termina, mesmo
que ninguém leia, e a próxima operação na conexão absorve a resposta dele como a de um stand-in.
Retiradas na mesma sessão antes de ela voltar a `idle` compartilham um só reset. Um servidor que
rejeita o statement responde com um erro, que é absorvido e ignorado. Advisory locks de sessão do
PostgreSQL (`pg_advisory_lock`), locks `GET_LOCK` do MySQL e registros `LISTEN` que um statement
retirado pegou portanto não sobrevivem a um cliente desconectado.

Uma sessão que deve um reset nunca é escolhida para co-localização — um chamador em pipeline ali
rodaria antes do reset —, então num pool saturado as novas operações aguardam em `pending` e são
promovidas quando a sessão volta a `idle`, atrás do reset dela. Se o reset não consegue ser escrito
inteiro nessa liberação — um batch ainda segura o stream de escrita, o stream aceita menos que o
reset inteiro, a sessão sumiu — a sessão é cortada: nenhum chamador vivo sobra nela, e valem as
regras de vaga acima.

O reset encerra estado de escopo de sessão de quem quer que o tenha criado. Um chamador ainda em
pipeline na sessão quando ela foi marcada só mantém o que o próprio statement pega até receber a
resposta: se esse statement pega um lock de sessão (`pg_advisory_lock`, `GET_LOCK`) ou um `LISTEN`
fora de uma transação, o reset escrito quando os chamadores que compartilham a sessão terminam o
libera. Pegue esses locks dentro de uma transação (`begin()`, ou `transact()` numa rota HTTP) — a
conexão dela é reservada, então nenhum reset roda ali dentro — nas formas de escopo de transação
(`pg_advisory_xact_lock`) quando o engine tem uma.

O reset não toca as variáveis de sessão: `SET` / `SET SESSION` continua na sessão do pool entregue
às requisições seguintes, então prefira `SET LOCAL` (ou restaure o valor explicitamente). Ele cobre
só trabalho retirado e adotado — o estado que uma requisição deixa quando termina normalmente é dela
para liberar (`pg_advisory_xact_lock` e `SET LOCAL` terminam com a transação).

O resource de resposta HTTP não retira a transação de uma Fiber de requisição destruída dentro de
`transact()`: ele a adota, conduz o que estava em voo até o fim e faz rollback dela na própria
sessão, então a sessão é mantida — e a marca (`Pool::taint()`), para que a liberação que encerra a
reserva seja a que escreve o reset de sessão, antes de a conexão voltar a `idle`. Veja
[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/).

### Teardowns retirados

Um teardown de transação retirado — o `COMMIT` ou `ROLLBACK` de nível superior — sempre conta como
nunca enviado, então a sessão dele é cortada em vez de confiar numa resposta que ninguém vai ler. O
que isso deixa no servidor depende de até onde o teardown chegou. Um `ROLLBACK`, ou um `COMMIT` que
nunca chegou ao servidor, termina num rollback feito pelo servidor quando a sessão é cortada. Um
`COMMIT` que já chegou ao servidor (`Querying` ou `Reading`) pode ter sido commitado: o servidor em
geral processa o statement que já leu antes de perceber a desconexão. Quem chamou só sabe que a
operação falhou como retirada, então o resultado dela é desconhecido — verifique se as escritas
dela foram gravadas, ou torne a unidade de trabalho idempotente, antes de repeti-la.
`Transaction::abort()` compõe esse teardown para um chamador que não pode mais esperar: o
`ROLLBACK` de nível superior em qualquer profundidade de savepoint, descartando o statement pendente
e sem emitir eventos de transação. Uma transação também passa a ler como inativa assim que a sessão
em que o `BEGIN` rodou deixa de existir — a conexão caiu, ou foi reconstruída para outro chamador
—, então o próximo statement dela falha com `SQL transaction is not active.` em vez de rodar dentro
da sessão de outra pessoa.

## Defina um prazo

```php
$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
   'timeout' => 0.5,
]);

$Operation = $Database->query('SELECT pg_sleep(2)');

try {
   $Database->await($Operation);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // Database operation timed out after 0.5 seconds.
}
```

`timeout` (em segundos, padrão `30`) é um prazo para a operação inteira, fixado quando `query()` a
cria: o tempo estacionada em `pending`, a abertura da conexão, o TLS, a autenticação e a resposta
contam todos contra ele, então uma operação aguardada depois que o prazo passou falha na hora. `0`,
ou um valor negativo, significa sem prazo. `query()` dá a cada operação o `timeout` do pool para o
qual ela é roteada; não existe opção por query. Uma leitura que falha numa réplica e é refeita no
primário é repetida com um prazo novo do próprio `timeout` — o da réplica, não o do primário —,
então pode levar até o dobro desse valor (veja [Saúde das réplicas](#saúde-das-réplicas)).

O SQLite é síncrono quando a operação consegue a conexão: o statement roda dentro de `query()`,
então o `timeout` não é prazo para ele — um statement lento roda até o fim, e uma operação
aguardada tarde ainda tem sucesso. Para esse statement o `timeout` é só o busy wait do SQLite, que
`0` ou um valor negativo desligam (veja [Timeout](/manual/ADI/Database/Config/overview/#timeout)).
Uma operação SQLite que não encontra conexão livre — a única conexão de um banco `:memory:`
segurada por uma transação, por exemplo — é estacionada em `pending` como qualquer outra, e o prazo
dela corre enquanto espera ali.

Quando o `timeout` de uma operação vence, o pool a falha com
`Database operation timed out after <timeout> seconds.` e pede ao driver dela para reconciliar o
wire (`Driver::abandon()`) antes de liberar a conexão. O servidor em geral ainda está respondendo ao
comando que recebeu: um driver que tem uma irmã co-localizada para ler o socket drena a resposta
abandonada e mantém a conexão; sem ninguém para lê-la, a conexão é derrubada. Nos dois casos a vaga
volta para o pool, e a operação que expirou nunca é revivida pela própria resposta atrasada.

## Liberação de conexões

Uma conexão volta para o pool só quando nada mais é devido no socket dela. Enquanto o driver ainda
tem uma operação esperando resposta, a conexão continua `busy` — entregá-la daria as linhas de um
chamador para outro. "Devido" significa uma operação que não terminou: uma que falhou ou expirou não
deve nada ao chamador, mesmo que o driver mantenha o slot dela na FIFO mais um pouco para absorver a
mensagem que a encerra. Backends nem sempre respondem em uma única leitura TCP, então uma query
recusada com erro de sintaxe pode deixar uma entrada terminada parada ali; o pool não lê isso como
trabalho em andamento, então a vaga não se perde — e transações, que nunca compartilham conexão,
não são recusadas por falta de uma capacidade que existe.

Uma conexão volta para `idle` assim que o driver não deve trabalho vivo. O pool também guarda, por
conexão, as operações que entregou a ela e que ainda não se resolveram — uma ainda composta, ou
estacionada atrás da escrita de outro chamador, é invisível ao driver —, mas só pesa essa
reivindicação quando uma operação exclusiva adquire conexão. Um `BEGIN` nunca recebe uma conexão
idle que uma operação co-localizada ainda não descarregada reivindica: esse statement rodaria dentro
da transação dele. Ele pega outra conexão idle, abre uma nova enquanto a capacidade permite, ou
aguarda em `pending`. A reivindicação nunca segura uma conexão fora de `idle`, e só conta enquanto a
operação dela não terminou, então uma operação que o chamador largou nunca prende uma conexão. Um
stand-in destacado (veja [Sessões mantidas](#sessões-mantidas)) também não é trabalho vivo: ninguém
o espera, então uma conexão cujo único trabalho pendente é um stand-in volta para `idle`.

Um socket que não consegue mais entregar é descartado em vez de retido, não importa o que o driver
ainda tenha enfileirado nele: ele deve uma resposta que nunca poderá trazer, e tudo o que libera a
vaga acontece depois dessa checagem.

## Transações

Transações fixam uma conexão com `lock` e liberam com `unlock` depois de commit ou rollback. A
reserva é liberada pela operação que carrega o `unlock`, mesmo quando o driver ainda tem uma irmã
co-localizada para terminar — a intenção vive naquela operação, então adiar a liberação a perderia
junto com ela e deixaria a conexão reservada para sempre.

Um caso leva a conexão junto: um commit ou rollback que o pool retira *antes de ele chegar ao
servidor*, seja porque você cancelou, seja porque o prazo dele venceu. Aquele statement não
encerrou nada, e a essa altura ninguém mais consegue — a transação abriu mão da profundidade e da
conexão no momento em que o statement foi composto. Passar essa conexão adiante rodaria o trabalho
do próximo chamador dentro de uma transação aberta que ele não pediu, e mantê-la reservada perderia
a vaga para sempre com a sessão aberta do mesmo jeito. Então a conexão é derrubada: o servidor faz
rollback da transação, que é o que um commit que nunca rodou significa, e a vaga volta para o pool.

Encerrar uma sessão também aposenta o driver que era dono dela. Um statement composto naquela
sessão mas nunca escrito não está na fila do driver nem no buffer de escrita, então o teardown não
consegue enxergá-lo e ele sobrevive à sessão segurando um driver cujo socket já morreu. Avançá-lo
depois disso o faz falhar — `PostgreSQL connection was torn down before the query was sent.`,
`MySQL connection was torn down before the query was sent.` ou, no Redis,
`Redis connection was torn down before the command was sent.` — e o comando que estava no buffer vai
junto, em vez de ser escrito na conexão que o pool reconstruiu no meio tempo. Uma reserva
remanescente daquela sessão fica inerte pelo mesmo motivo.

Uma operação presa a uma conexão que o pool não consegue mais fornecer — restart do servidor,
reciclagem de load balancer, socket derrubado — falha na hora com
`Database operation lost the connection it was pinned to.` em vez de esperar em `pending`. Nenhuma
capacidade satisfaz um pin, então enfileirá-la a manteria ali para sempre enquanto cada passe de
promoção a reconsiderasse.

## Saúde das réplicas

```php
$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
   'replicas' => [
      ['host' => '127.0.0.1', 'port' => 5433],
   ],
]);

$Replica = $Database->ReplicaPools[0];

$Operation = $Database->await($Database->query('SELECT 1 AS one'));

$Operation->fallback; // true
$Replica->failures;   // 1
$Replica->healthy;    // true

$Database->await($Database->query('SELECT 1 AS one'));

$Replica->failures;   // 2
$Replica->healthy;    // false
```

Nada escuta na porta da réplica aqui, então toda leitura roteada para ela é recusada. A primeira
leitura é refeita no primário — `fallback` é `true` — e conta uma falha contra o pool da réplica. A
segunda falha seguida (`Pool::DEFAULT_FAILURES`, `2`) fecha a réplica por `Pool::DEFAULT_RETRY`
(`5.0`) segundos mais um jitter aleatório de até `Pool::DEFAULT_JITTER` (`0.25`) segundo: `healthy`
fica `false`, e as leituras vão para outra réplica saudável ou para o primário. Passada essa
janela, a réplica volta a ser tentada; a contagem de `failures` é mantida, então mais uma falha a
fecha de novo na hora, enquanto uma leitura bem-sucedida nela zera a contagem (`recover()`).

Só contam as falhas que o driver marca como de conexão (`Operation->quarantine`), como uma
abertura de conexão recusada ou falha, uma falha de TLS, uma autenticação que o driver se recusa a
concluir ou uma sessão perdida por erro de transporte. Toda leitura de réplica que falha ainda é
refeita uma vez no primário com um prazo novo do `timeout` da réplica — inclusive um simples erro
de SQL —, mas nem um erro de SQL nem um timeout contam contra a réplica. Assim, uma réplica que
aceita conexões e nunca responde continua recebendo leituras, e cada uma espera o seu `timeout`
antes de o primário respondê-la. Uma leitura cancelada ou retirada nunca é refeita. O roteamento e
a janela de leitura após escrita estão em
**[Réplicas de leitura](/guide/database-read-replicas/overview/)**.

## Erros

Estas falhas vêm do pool e das classes centrais `Operation` e `Driver`. Cada uma é o `error` da
operação, e o `wait()` a relança como uma `RuntimeException`.

| Mensagem | Quando |
| --- | --- |
| `Database pool has no capacity for the operation.` | O `wait()` recebeu uma operação estacionada em `pending` |
| `Database operation timed out after <timeout> seconds.` | O prazo da operação passou |
| `Database operation lost the connection it was pinned to.` | A conexão de uma operação presa a ela sumiu |
| `Database operation was withdrawn: its caller stopped waiting.` | `withdraw()` numa operação não terminada |
| `Database operation was cancelled before reaching the server.` | `cancel()` numa operação composta mas nunca escrita |
| `Database operation has no protocol to cancel.` | `cancel()` numa operação estacionada em `pending` |
| `Database connection was lost while cancelling the operation.` | O cancel saiu por um socket já fechado |
| `Database driver does not support cancellation.` | `cancel()` com um driver sem cancelamento (Redis) |

O `wait()` também lança duas `RuntimeException`s próprias sem falhar a operação:
`Database operation did not provide readiness.` e `Database operation readiness wait failed.`

## Referência

### Pool

`Bootgly\ADI\Database\Pool`.

```php
__construct (Config $Config, Connection $Connection, string $drivers = Drivers::class)
```

Cria um pool para um endpoint. `$Connection` é a primeira conexão que ele abre — reaproveitada
sempre que o pool não segura nenhuma — e `$drivers` é o registry `Drivers` do qual ele cria um
driver para cada conexão nova. As fachadas criam seus pools sozinhas: `$Database->Pool`, e
`$Database->ReplicaPools` no SQL.

```php
assign (Operation $Operation): Operation
```

Entrega uma conexão a uma operação: uma idle, uma nova enquanto o pool tem espaço abaixo do `max`,
ou — com o pool cheio — uma busy pronta que ela possa dividir. Depois vincula o driver e o deixa compor
o comando (estado `Queued`). Sem conexão para dar, a operação é estacionada em `pending`; uma
operação presa a uma conexão que sumiu falha em vez disso. `query()` e `command()` o chamam. Uma
operação que o driver termina na hora — uma operação SQLite que conseguiu uma conexão — é liberada
antes de `assign()` retornar.

```php
advance (Operation $Operation): Operation
```

Move uma operação um passo: expira uma operação que passou do prazo, atribui uma pendente, ou deixa
o driver ler e escrever o que o socket permite, e libera a conexão de uma operação que terminou.
Ele nunca espera a readiness do socket, mas uma abertura de conexão ainda resolve o nome do host de
forma síncrona (veja [Timeout](/manual/ADI/Database/Config/overview/#timeout)), e qualquer
statement SQLite que ele inicia roda até o fim dentro do passo. Uma leitura de réplica que falhou é
refeita no pool de fallback a partir daqui. O `advance()` das fachadas e o resource HTTP o chamam.

```php
wait (Operation $Operation): Operation
```

Avança a operação até ela terminar, dormindo num `stream_select()` sobre o socket e a direção que o
driver pede, no máximo um segundo por vez e nunca além do deadline da readiness. Lança uma
`RuntimeException` com o `error` da operação quando ela falha, recusa uma operação estacionada em
`pending` (`Database pool has no capacity for the operation.`), e lança
`Database operation did not provide readiness.` ou `Database operation readiness wait failed.`
quando não consegue esperar. Uma espera interrompida por um sinal é repetida. Uma operação que
pertence a outro pool é aguardada nele. As fachadas o chamam a partir de `await()`.

```php
cancel (Operation $Operation): Operation
```

Marca `revoked` e só então envia um pedido de cancel pelo driver, apenas quando a operação está de
fato em voo. Uma operação terminada mantém seu resultado, uma estacionada ou composta falha
localmente, e um cancel que nunca chegou ao servidor, ou que saiu por um socket fechado, é
reconciliado e tem a vaga retomada. Veja
[Cancele um statement em execução](#cancele-um-statement-em-execução).

```php
withdraw (Operation $Operation): Operation
```

Retira localmente uma operação não terminada, porque quem a chamou parou de esperar: falha-a com
`Database operation was withdrawn: its caller stopped waiting.`, marca `revoked`, deixa o driver
reconciliar o wire e retoma a vaga. Uma operação terminada mantém seu resultado e é apenas
esquecida. Síncrono e nunca suspende; liberar uma vaga ainda pode promover uma operação
estacionada, que pode abrir uma conexão nova. Veja [Operações retiradas](#operações-retiradas).
Desde a 1.0.5.

```php
release (Operation $Operation): self
```

Resolve a reivindicação de uma operação terminada sobre a conexão dela: libera uma reserva
(`unlock`, ou um `lock` que falhou), mantém a conexão `busy` enquanto o driver ainda deve trabalho
nela, descarta um socket que não consegue mais entregar, escreve um reset de sessão pendente,
devolve a conexão a `idle` e promove operações pendentes. O pool o chama; uma segunda chamada para
a mesma operação não faz nada.

```php
attach (Connection $Connection): self
```

Acrescenta a `idle` uma conexão que você mesmo abriu e a conta em `created`.

```php
lock (Connection $Connection): self
```

Reserva uma conexão que o pool conta para um único dono, como um `BEGIN` faz pela flag `lock`: uma
conexão reservada não recebe operação co-localizada, e continua `busy` entre liberações até o
`unlock()`. Uma conexão que o pool não conta é ignorada.

```php
unlock (Connection $Connection): self
```

Encerra uma reserva; a próxima liberação devolve a conexão ao escalonamento normal.

```php
taint (Connection $Connection): void
```

Marca uma sessão emprestada cujo dono ficou órfão — `withdraw()` marca aquela em que estava um
statement retirado que chegou ao servidor; uma transação adotada marca a sua reservada — para que o
estado da sessão seja resetado antes de a conexão ser emprestada de novo. A próxima liberação que
devolveria a conexão a `idle` faz o driver escrever o reset (`Driver::reset()`) atrás de tudo o que
a sessão ainda deve, uma vez; uma sessão que não consegue recebê-lo é cortada e descartada. Até lá
nenhum chamador novo é co-localizado ali. Feito para uma conexão que o pool emprestou, busy ou
reservada: uma já idle só é resetada depois do próximo chamador. Uma conexão que o pool não conta é
ignorada, e uma descartada perde a marca. Desde a 1.0.11.

```php
penalize (float $seconds = self::DEFAULT_RETRY, int $failures = self::DEFAULT_FAILURES, float $jitter = self::DEFAULT_JITTER): self
```

Conta uma falha de saúde. A partir da `$failures`-ésima seguida, fecha o pool para o roteamento
por `$seconds` mais um jitter aleatório de até `$jitter` segundos. O pool o chama numa réplica cuja
leitura falhou na conexão, antes de refazer a leitura no primário.

```php
recover (): self
```

Zera a contagem de falhas e a janela de retry. O pool o chama quando uma operação que terminou com
sucesso devolve a conexão dela.

```php
public bool $healthy { get; }
```

`true` a menos que haja uma janela de retry aberta: `retry` é `0.0` ou já ficou no passado. A
fachada SQL roteia leituras só para réplicas saudáveis.

```php
public private(set) int $failures
```

Falhas de saúde seguidas contadas por `penalize()` desde o último `recover()`.

```php
public private(set) float $retry
```

Timestamp de `microtime(true)` até o qual o pool fica fechado para o roteamento; `0.0` quando não
há janela aberta.

```php
public array $idle
```

Conexões prontas que nenhuma operação segura, indexadas pelo id do objeto (`array<int,Connection>`).

```php
public array $busy
```

Conexões entregues a operações, ou reservadas por uma transação (`array<int,Connection>`).

```php
public array $pending
```

Operações estacionadas até uma conexão ficar livre (`array<int,Operation>`).

```php
public int $created
```

Quantas conexões o pool conta: idle, busy e reservadas.

`idle`, `busy`, `pending` e `created` são graváveis publicamente, mas são a contabilidade do próprio
pool: leia-os, nunca os escreva.

```php
public int $max
```

O teto de `created`, copiado de `pool.max` quando o pool é criado.

```php
public int $min
```

Copiado de `pool.min`; por enquanto o pool não age sobre ele.

```php
public Config $Config
```

A configuração de conexão do endpoint do pool; o `timeout` dela é o que `query()` dá a cada
operação que roteia para o pool, mantido quando uma leitura de réplica que falhou é refeita no
primário.

```php
public Connection $Connection
```

A primeira conexão; no pool primário, a própria `$Database->Connection` da fachada.

```php
public string $drivers
```

A classe `Drivers` da qual o pool cria drivers (`class-string<Drivers>`).

```php
public const int DEFAULT_FAILURES = 2;
```

Falhas de saúde seguidas que fecham um pool.

```php
public const float DEFAULT_RETRY = 5.0;
```

Segundos que um pool fechado continua fechado, antes do jitter.

```php
public const float DEFAULT_JITTER = 0.25;
```

Limite superior, em segundos, do jitter aleatório somado à janela de retry, para que pools fechados
juntos não reabram juntos.

### Pools

`Bootgly\ADI\Database\Pools` — o registry dos pools de uma fachada por nome de driver
(`$Database->Pools`). A fachada registra o pool primário sob `Config->driver`; os pools de réplica
não são registrados ali.

```php
register (string $driver, Pool $Pool): self
```

Registra um pool sob um nome de driver, substituindo qualquer pool já registrado com ele.

```php
fetch (string $driver = ''): Pool
```

Retorna o pool registrado sob `$driver` — o `driver` da configuração, quando vazio. Um nome
desconhecido lança `InvalidArgumentException` (`Database pool is not registered: <driver>.`).
