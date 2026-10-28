# Drivers SQL

`Bootgly\ADI\Databases\SQL\Drivers` registra os wire drivers nativos que executam o SQL
gerado pelo Query Builder e pelo Schema. O Bootgly traz três drivers embutidos —
**PostgreSQL**, **MySQL/MariaDB** e **SQLite** — implementados nativamente, com zero
dependências de terceiros.

## Selecionando um driver

A chave de config `driver` seleciona de uma vez o driver, o dialeto do Query Builder e o
dialeto do Schema (DDL):

```php
use Bootgly\ADI\Databases\SQL;

$PostgreSQL = new SQL(['driver' => 'pgsql']);
$MySQL = new SQL(['driver' => 'mysql']);
$SQLite = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);
```

Em um projeto, vincule o driver pelo escopo de config `database` — `DB_CONNECTION`
seleciona um bloco de conexão que já deve estar declarado:

```bash :toolbar="true";
DB_CONNECTION=mysql DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root php bootgly kit boot
```

O adaptador de config mapeia `pgsql`/`postgres`/`postgresql` para `Connections->PostgreSQL`,
`mysql`/`mariadb` para `Connections->MySQL` e `sqlite`/`sqlite3` para
`Connections->SQLite`. Ele não sintetiza um bloco ausente a partir dos defaults da ADI. Se o bloco
canônico selecionado estiver ausente, ele lança, por exemplo,
`Database config is missing the selected connection scope: Connections->MySQL.`

## Matriz de capacidades

| Capacidade | PostgreSQL | MySQL/MariaDB | SQLite |
|------------|------------|---------------|--------|
| Modelo de execução | assíncrono (non-blocking) | assíncrono (non-blocking) | síncrono |
| Pipelining no wire | sim | não (FIFO request-response) | — |
| TLS | sim (modos `secure`) | sim (modos `secure`) | — |
| Autenticação | cleartext, MD5, SCRAM-SHA-256 (cleartext/MD5, ou SCRAM abaixo de 4096 iterações, exigem TLS ou `disable` num host que não é loopback sob `prefer`) | `mysql_native_password`, `caching_sha2_password` (full auth via TLS ou chave RSA pinada) | — |
| Prepared statements | protocolo estendido + cache LRU | protocolo binário + cache LRU | `SQLite3Stmt` + cache LRU |
| `RETURNING` | sim | não — `Result->inserted` no lugar | não — a extensão `sqlite3` executaria 2 vezes |
| Chaves geradas | linhas do `RETURNING` | `Result->inserted` (pacote OK) | `Result->inserted` (`lastInsertRowID`) |
| Cancelamento | side channel `CancelRequest` | side channel `KILL QUERY` | não suportado |
| DDL transacional | sim | não (commits implícitos) | sim |
| Advisory locks | `pg_advisory_lock` | `GET_LOCK` | — (somente file lock) |

Tudo acima do driver — Pool de conexões, Transações, Query Builder, ORM Repository,
Migrations e Seeders — é agnóstico de driver e funciona de forma idêntica nos três engines.

## Chaves geradas sem RETURNING

Os dialetos MySQL e SQLite não emitem `RETURNING` (no SQLite a extensão `sqlite3` executa
esses statements duas vezes, duplicando a escrita — o driver os falha de imediato). Em vez
disso, o driver reporta o id gerado em `Result->inserted`, e o ORM Repository preenche a
chave da entidade de forma transparente no `hydrate()`:

```php
$Repository = $Database->map(User::class);

$User = new User;
$User->name = 'Ada';

$Operation = $Database->await($Repository->save($User));
$Saved = $Repository->hydrate($Operation)->entity;

$Saved->id; // preenchido a partir de Result->inserted
```

### Chaves maiores que um int do PHP

Uma chave `BIGINT UNSIGNED` do MySQL pode passar de 2^63, valor que nenhum `int` do PHP
comporta. Em vez de perder o valor, o driver reporta esses ids como **strings decimais
exatas** — então declare a chave aceitando uma:

```php
#[Table('orders')]
class Order
{
   #[Key]
   public null|int|string $id = null;
}
```

Por isso `Result->inserted` é `int|string`: `int` para todo id dentro de `PHP_INT_MAX`,
string apenas acima dele. Uma chave declarada `null|int` que recebe um id desses levanta uma
`RuntimeException` nomeando a propriedade, em vez de guardar um valor estreitado — uma chave
saturada não casaria com linha nenhuma, e o `save()` seguinte atualizaria nada em silêncio.

Isso só aparece quando a tabela de fato guarda ids desse tamanho. Um
`BIGINT UNSIGNED AUTO_INCREMENT` comum nunca chega lá sozinho, mas uma importação que
preserva um id legado acima de 2^63 faz o servidor continuar a sequência a partir dele.

A leitura segue a mesma regra, e ela não se limita a chaves. A hidratação estreita o valor
decodificado para o tipo declarado da propriedade, então qualquer coluna cujo valor passe de
`PHP_INT_MAX` — uma chave, um contador, um `DECIMAL` — levanta a mesma `RuntimeException`
nomeando a propriedade, em vez de saturar. Declare a propriedade como `null|int|string` e ela
hidrata exatamente como o driver decodificou.

## Notas sobre o Pool

- Cada conexão do pool vincula uma instância de driver — caches de prepared statements
  são por conexão.
- O tamanho do cache de prepared statements é a chave de config `statements` (padrão
  `256`); o statement menos usado recentemente é removido ao atingir o limite. O limite
  também vale do lado do servidor: um statement que o driver deixa de rastrear é fechado no
  wire, e um único statement é preparado por conexão, por mais operações que o peçam ao
  mesmo tempo.
- Um statement só é fechado quando nenhum comando pendente ainda carrega o id dele. Uma
  operação co-localizada grava o id do servidor nos próprios bytes no momento em que é
  criada, e esses bytes podem esperar vários round-trips na FIFO — remover esse statement
  nesse intervalo mandaria o close na frente de um comando que ainda precisa dele.
- Operações criadas antes de a primeira chegar ao socket compartilham esse único prepare.
  A irmã vincula o statement que a dona está preparando em vez de prepará-lo de novo — o
  que no PostgreSQL falharia de imediato (`42P05`) e no MySQL deixaria no servidor um
  statement que nada conseguiria fechar.
- Um batch maior que o buffer do socket é escrito em partes, e a operação que o escreve
  segura o stream até terminar. Se quem a chamou desistir, a próxima operação naquela
  conexão encontra o dono com o prazo vencido e termina o flush ela mesma: a resposta é
  drenada em silêncio, a operação vencida falha com o próprio timeout e nunca é repetida —
  o trabalho dela rodou com um resultado que ninguém viu — e a conexão continua de pé. Um
  batch abandonado antes de qualquer byte chegar ao wire é simplesmente retirado, e uma
  nova tentativa continua válida. Um batch que o chamador **cancelou** nunca é concluído:
  enviar o restante executaria justamente o que foi retirado, então a sessão é descartada e
  o pool abre uma conexão nova. E quando a sessão morre com um batch escrito pela metade, esse
  batch falha com a mesma causa de todas as outras operações dela, em vez de esperar o próprio
  prazo vencer.
- Um statement cujo chamador parou de esperar — o cliente desconectou, uma espera deferred foi
  recusada ou interrompida — mantém a sessão quando o batch dele está inteiro no wire. O driver o
  *destaca*: um stand-in absorve o resto da resposta, o `check()` deixa de contar a conexão como
  ocupada por causa dele, e a próxima operação entregue a essa conexão entra na fila atrás do
  stand-in e o drena antes da própria. A vaga é segurada pela sessão viva pelo tempo real de
  execução do statement, não até o deadline. Um batch ainda sendo escrito é a exceção — os bytes
  restantes nunca poderão ser atribuídos, então a sessão é derrubada — e também um statement
  retirado numa conexão que uma transação reservou. A retirada também marca a sessão mantida
  (`taint`): a liberação que a devolve a `idle`, quando ninguém mais deve trabalho nela, escreve
  primeiro um reset (`reset()`) — advisory locks e `LISTEN` no PostgreSQL, locks nomeados no MySQL,
  mas não as variáveis `SET` — e uma sessão que não consegue recebê-lo é derrubada. Uma sessão
  marcada não recebe novo chamador co-localizado. Uma operação enfileirada atrás de um stand-in
  espera por ele; se essa operação expirar, o que ela já enviou ainda pode rodar no servidor, então
  o resultado dela é desconhecido. Veja
  **[Operações retiradas](/manual/ADI/Database/overview/#operações-retiradas)**.
- MySQL não tem pipelining no wire: operações co-localizadas entram em uma FIFO onde só a
  cabeça possui o socket. O Pool continua correto — as irmãs bombeiam o stream de leitura
  compartilhado.
- SQLite é síncrono: operações resolvem imediatamente e nunca suspendem. Um banco
  `:memory:` é privado do handle que o abre, então seu pool é confinado a uma conexão — um
  `pool.max` acima de `1` é reduzido para `1`. Bancos em arquivo mantêm seu pool.

## Referência

- **[Driver PostgreSQL](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/)** — wire
  protocol 3.0, autenticação SCRAM, TLS e pipelining.
- **[Driver MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/)** — handshake,
  plugins de autenticação, protocolo binário e `KILL QUERY`.
- **[Driver SQLite](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/)** — bancos em
  arquivo e `:memory:` sem setup.
- **[Dialetos de Query](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** —
  diferenças de geração de SQL entre os engines.
- **[Dialetos de Schema](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — geração
  de DDL, DDL transacional e advisory locks.

### Contrato de driver e Pool para trabalho retirado

Estes são os membros do `Driver` — e o método do `Pool` — usados para reconciliar o wire quando o
Pool finaliza uma operação de fora. O SQLite herda os padrões do `Driver`, e o Redis herda o
`detach()` e o `reset()` — o `abandon()` dele é próprio.

```php
detach (Operation $Operation): void
```

Reconcilia o wire de uma operação cujo chamador parou de esperar (`Pool::withdraw()`), mantendo
sempre uma sessão drenável quando o batch está inteiro no wire: a resposta restante fica com um
stand-in destacado, e nenhum leitor é exigido. Um batch cujos bytes restantes nunca poderão ser
atribuídos — escrito pela metade — ainda derruba a sessão. O padrão delega ao `abandon()`; um
driver cujo `abandon()` chama `detach()` precisa sobrescrevê-lo, ou os dois recursam.

```php
abandon (Operation $Operation): void
```

Reconcilia o wire quando o Pool finaliza uma operação de fora por qualquer outro motivo — um
deadline vencido, um cancel que nunca chegou ao servidor, um teardown de transação, uma retirada
numa conexão reservada por uma transação. Ele continua cortando a sessão quando ninguém sobra para
ler a resposta: PostgreSQL, MySQL e Redis só a mantêm enquanto sobra um leitor vivo para bombear a
resposta (uma entrada terminada não é leitora), e PostgreSQL e MySQL, fora isso, reconciliam
exatamente como o `detach()`. O padrão não faz nada.

```php
reset (): bool
```

Reseta o que uma sessão mantida pode carregar depois que o chamador foi embora — um lock concedido
depois que o chamador parou de esperar, uma subscrição. O Pool o pede ao devolver essa sessão a
`idle`, quando ninguém mais deve trabalho nela (`check()`): o driver o escreve na hora, atrás de
tudo o que a sessão ainda deve, então o servidor o executa logo depois que o trabalho abandonado
termina, mesmo que ninguém leia, e a resposta dele é absorvida como a de um stand-in por quem ler a
seguir. O PostgreSQL escreve `SELECT pg_advisory_unlock_all(); UNLISTEN *`; o MySQL escreve
`DO RELEASE_ALL_LOCKS()`. Variáveis de sessão não são resetadas. Um reset ainda devido, sem nada
escrito atrás dele, cobre um pedido repetido. Retorna `false` quando não pode ser escrito inteiro
agora — um batch segura o stream de escrita, o stream aceita menos que o reset inteiro, a sessão
sumiu — e o Pool então corta a sessão, que nenhum chamador mais compartilha. O padrão retorna
`true`: um driver que não guarda esse estado não tem o que resetar.

```php
check (): bool
```

Se o driver ainda deve trabalho a um chamador, de modo que o Pool não deve entregar a conexão
ainda: uma operação em voo que alguém espera ou — no PostgreSQL e no Redis — um batch que outro
chamador ainda está descarregando. Stand-ins destacados não contam: a próxima operação entregue
à conexão entra na fila atrás deles e os drena.

```php
public bool $detached { get; }
```

Se a sessão ainda deve respostas a stand-ins destacados — um reset de sessão pendente conta. O Pool
só mantém o deadline de um statement retirado enquanto isto vale: depois que os stand-ins são
drenados o servidor já respondeu, e um drop posterior da sessão não lhes deve vaga. É `false` por
padrão, para drivers que nunca destacam.

```php
taint (Connection $Connection): void
```

Método do `Pool`. Marca uma sessão emprestada cujo dono ficou órfão — o `withdraw()` marca aquela em
que um statement retirado que chegou ao servidor estava; uma transação adotada marca a reservada
dela —, para que o estado de sessão dela seja resetado antes de a conexão ser entregue de novo. A
próxima liberação que devolveria a conexão a `idle` — aquela depois da qual ninguém mais deve
trabalho nela (`Driver::check()`) — faz o driver escrever o reset dela (`reset()`) atrás de tudo o
que a sessão ainda deve, uma vez; uma sessão que não pode recebê-lo é cortada e derrubada. Até lá
nenhum novo chamador é co-localizado ali: ele rodaria antes do reset. Pensado para uma conexão que o
Pool emprestou, busy ou reservada: uma já idle só é resetada depois do próximo chamador dela. Uma
conexão que o Pool não conta é ignorada, e uma derrubada perde a marca.
