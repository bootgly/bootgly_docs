# Dados no Bootgly

ADI — a **Abstract Data Interface** — é a camada do Bootgly que guarda os seus dados e os confere.
Ela traz os bancos SQL e key-value (Redis), com os Query e Schema Builders, migrations, seeders e o
ORM sobre o SQL; o dataset Table, que mantém linhas em memória e totaliza as colunas delas; e o
motor de Validação com as suas regras built-in. As camadas acima dela — o código da sua API, os
comandos de console e as rotas HTTP — chegam aos dados por essas mesmas classes.

## Comece aqui

- **Abrir um banco e executar uma query** — configure o escopo `database` do projeto e abra-o em um
  script, um comando ou uma rota com o **[DBAL de banco](/guide/database-dbal/overview/)**; depois
  monte, execute e leia uma query com **[Consultas de banco](/guide/database-queries/overview/)**.
- **Manter várias escritas juntas** — faça commit ou rollback de instruções em uma conexão do pool:
  **[Transações de banco](/guide/database-transactions/overview/)**.
- **Mandar leituras para réplicas** — roteie leituras seguras para pools de réplica enquanto
  escritas, transações e queries com `lock()` do builder ficam no primário:
  **[Réplicas de leitura de banco](/guide/database-read-replicas/overview/)**.
- **Trabalhar com entidades em vez de linhas** — mapeie linhas para classes PHP simples por meio de
  repositórios: **[ORM de banco](/guide/database-orm/overview/)**.
- **Criar e alterar tabelas** — versione o schema com
  **[Migrations de banco](/guide/database-migrations/overview/)** e preencha-o com linhas de demo ou
  de lookup com **[Seeders de banco](/guide/database-seeders/overview/)**.
- **Enviar comandos Redis** — abra o Redis e execute os comandos dele por um pool próprio, do mesmo
  tipo de pool não bloqueante que os drivers SQL usam: **[Banco KV](/manual/ADI/Databases/KV/overview/)**.
- **Validar uma requisição** — execute regras sobre uma requisição antes do handler com o
  middleware `Validator`:
  **[Validação de Requisição](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/#validação-de-requisição)**.
  Para conferir qualquer outro array — o input de um comando, o payload de um job —, siga o
  **[guia de Validation](/guide/validation/overview/)**.
- **Totalizar as linhas de uma tabela de terminal** — guarde as linhas de cabeçalho, corpo e rodapé
  que a Table do CLI desenha e some uma coluna para o rodapé:
  **[Dataset de tabela](/manual/ADI/Table/overview/)**.

## Conectar, migrar, semear, consultar

Esse é o ciclo inteiro: **conectar → migrar → semear → consultar**.

### 1. Conectar

Um projeto guarda as configurações do banco no escopo de config `database`
(`configs/database/database.Config.php`, PostgreSQL por padrão; o guia
**[DBAL de banco](/guide/database-dbal/overview/)** mostra como escrevê-lo). Em uma rota
`HTTP_Server_CLI`, use o resource por worker `$Response->Database`
(**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**).
Na função de boot do projeto, em um comando ou em um script que roda dentro do projeto, abra o
banco com:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
```

Essa linha precisa desse escopo: sem um diretório `configs/`, `BOOTGLY_PROJECT->Configs` é
`null` (veja **[A partir da config do projeto](/manual/ADI/Database/Config/overview/#a-partir-da-config-do-projeto)**).
Fora de um projeto, passe a conexão como array:
`new SQL(['driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => 5432, 'database' => 'app', 'username' => 'app', 'password' => 'secret'])`.
Um `new SQL` sem argumentos não lê config nenhuma: ele usa os defaults locais embutidos
(PostgreSQL em `127.0.0.1:5432`, banco `bootgly`, usuário `postgres`, senha vazia), que também
preenchem toda chave que um array omitir, seja qual for o `driver`.

### 2. Moldar com migrations

Descreva cada tabela com o Schema Builder em vez de escrever `CREATE TABLE` na mão. Crie uma
migration, descreva a tabela nela e aplique:

```bash
bootgly project <name> migrate create "Create Users Table"
bootgly project <name> migrate up
```

### 3. Semear dados

Depois que as tabelas existem, preencha linhas de demo ou de lookup com seeders reexecutáveis:

```bash
bootgly project <name> seed create "Demo Users"
bootgly project <name> seed run
```

### 4. Consultar

Leia e escreva linhas com o guia **[Consultas de banco](/guide/database-queries/overview/)** e o
**[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**: `$Database->table(...)` monta uma
instrução, `$Database->query(...)` a transforma em uma operação e `$Database->await(...)` conduz a
operação até o `Result` dela.

## Componentes

[Comece aqui](#comece-aqui) aponta para os fluxos comuns; as páginas abaixo trazem os detalhes de
cada componente.

### Database

O núcleo agnóstico de transporte que as duas fachadas de banco estendem.

- **[Núcleo do DBAL](/manual/ADI/Database/overview/)** — suas camadas, como uma operação roda e
  falha, os estados da `Operation` e os campos do `Result`.
- **[Configuração do banco](/manual/ADI/Database/Config/overview/)** — as chaves de conexão que toda
  fachada lê e os padrões delas, os nomes de driver, o `timeout` das operações, o tamanho do pool e
  o TLS (`secure`).
- **[Pool de conexões](/manual/ADI/Database/Pool/overview/)** — como as operações dividem as
  conexões: dimensionamento, esperas síncronas, prazos, cancelamento, trabalho retirado e reset de
  sessão, e a saúde das réplicas.

### Databases

- **[Bancos de dados](/manual/ADI/Databases/overview/)** — `SQL` ou `KV`: qual fachada escolher,
  como abri-la onde o seu código roda e o registry que cria uma pelo nome.
- **[Banco SQL](/manual/ADI/Databases/SQL/overview/)** — a fachada `SQL`: abrir um banco, as chaves
  de config SQL, executar e aguardar queries, ler o resultado, roteamento read-after-write, eventos
  e erros.
  - **[Drivers](/manual/ADI/Databases/SQL/Drivers/overview/)** — os wire drivers nativos lado a
    lado: seleção, capacidades, diferenças no resultado, códigos de erro, limites e notas de pool.
    - **[PostgreSQL](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/)** — o driver padrão:
      Protocol 3.0 com autenticação SCRAM, TLS, o protocolo estendido, prepared statements,
      pipelining e cancelamento.
    - **[MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/)** — MySQL e MariaDB: autenticação
      `caching_sha2_password`, TLS, prepared statements binários, a fila de comandos e
      `KILL QUERY`.
    - **[SQLite](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/)** — bancos em arquivo e
      `:memory:` sobre o `ext-sqlite3`, sem setup, para testes e protótipos.
    - **[Mapeamento de tipos](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** — como cada
      driver vincula parâmetros PHP e devolve os valores das colunas, e o que normalizar para ter
      código portável.
  - **[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)** — instruções presas a uma
    conexão do pool: commit, rollback e abort, savepoints, recusas e eventos do ciclo de vida.
  - **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — `SELECT`, `INSERT`, `UPDATE`
    e `DELETE` parametrizados a partir de nomes tipados: de onde vem um builder, como ele compila e
    executa, os modos e os erros dele.
    - **[Lendo linhas](/manual/ADI/Databases/SQL/Builder/Reading/overview/)** — select, filtros,
      busca textual, joins, aliases, agrupamento, agregações, limites e locks de linha.
    - **[Escrevendo linhas](/manual/ADI/Databases/SQL/Builder/Writing/overview/)** — insert de uma
      ou de várias linhas, guards de update e delete, saída `RETURNING` e upserts.
    - **[Compondo queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)** —
      identificadores dinâmicos, expressões confiáveis, filtros aninhados, subqueries, tabelas
      derivadas e CTEs.
    - **[Dialetos de query](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** — o que o mesmo
      builder compila em PostgreSQL, MySQL e SQLite: quoting, placeholders e capacidades.
  - **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** — DDL portável de `CREATE`,
    `ALTER`, `DROP`, índices e constraints, compilada para o seu banco, em geral dentro de uma
    migration.
    - **[Definindo tabelas](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** — colunas,
      defaults, chaves, checks, chaves estrangeiras e índices com um `Blueprint`, e como mudá-los
      depois.
    - **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)** — o arquivo de
      migration, `Up` e `Down`, o status, batches, a tabela de histórico, o lock e migrations no
      boot.
    - **[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — o que PostgreSQL, MySQL
      e SQLite conseguem e não conseguem fazer quando um schema compila.
  - **[Seeders](/manual/ADI/Databases/SQL/Seed/overview/)** — scripts de dados reexecutáveis: o
    arquivo de seeder, valores fake, rodá-los pela CLI ou pelo código, e locks.
  - **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** — o que torna uma classe uma
    entidade, como o mapeamento dela é compilado e cacheado, os erros de mapeamento e como as
    propriedades dela são tipadas e construídas.
    - **[ORM Model Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)** — `Table`,
      `Key`, `Column` e `Relation`: chaves geradas e atribuídas, flags de coluna e tipos de relação.
  - **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** — find, fetch, save e
    delete de entidades como operações que você aguarda, e depois a hidratação do resultado.
    - **[ORM Repository Pagination](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)** —
      páginas com total `COUNT(*)` ou cursores keyset, em rotas HTTP e na camada ADI.
    - **[ORM Repository Relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/)** —
      relações has-one, has-many, belongs-to e many-to-many, carregadas como operações que você
      aguarda, durante a hidratação ou de forma lazy no primeiro acesso.
    - **[ORM Repository Selection](/manual/ADI/Databases/SQL/Repository/Selection/overview/)** —
      quais linhas um repositório lê: filtros, `OR`, busca textual, ordem, fatias, locks de linha,
      relações e escopos nomeados.
    - **[ORM Repository Hydration](/manual/ADI/Databases/SQL/Repository/Hydration/overview/)** —
      como operações terminadas viram entidades tipadas, o identity map e as chaves gravadas de
      volta nas entidades salvas.
    - **[ORM Repository Hooks](/manual/ADI/Databases/SQL/Repository/Hooks/overview/)** — os oito
      hooks do ciclo de vida de um repositório, e como listeners conduzem ou recusam o trabalho
      dele.
- **[Banco KV](/manual/ADI/Databases/KV/overview/)** — a fachada `KV`: executar comandos Redis e ler
  as respostas, enviá-los em pipeline, timeouts, cancelamento e retirada, erros e limites.
  - **[Redis](/manual/ADI/Databases/KV/Drivers/Redis/overview/)** — o driver nativo: discagem não
    bloqueante, `AUTH`/`SELECT`, TLS, push frames do RESP3, pipelining e cancelamento.

### Table

- **[Dataset de tabela](/manual/ADI/Table/overview/)** — linhas de cabeçalho, corpo e rodapé
  mantidas em memória, com `sum()`, `subtract()`, `multiply()`, `divide()` e `find()` sobre uma
  coluna do corpo: os dados que a **[Table](/manual/CLI/UI/Components/Table/overview/)** do CLI
  desenha, não uma tabela de banco.

### Validation

- **[Validação](/manual/ADI/Validation/overview/)** — o motor: executar regras sobre um array, ler
  `valid` e `errors`, valores em branco e regras implícitas, as mensagens e a tradução delas, e
  regras customizadas.
- **[Validadores](/manual/ADI/Validators/overview/)** — as 14 regras built-in: o que cada uma aceita
  e rejeita, os argumentos, a mensagem padrão e as ressalvas de cada uma.

## Referência

ADI (Abstract Data Interface) é a camada de dados da arquitetura I2P do Bootgly, na cadeia
unidirecional `ABI → ACI → ADI → API → CLI → WPI`: ela se apoia só em ABI e ACI, e API, CLI e WPI se
apoiam nela. Os seus cinco componentes raiz, em ordem de dependência (alfabética):

- `Bootgly\ADI\Database` — o núcleo abstrato do DBAL: a config de conexão, a conexão, os pools, as
  operações e os resultados delas, e o contrato e o registry de drivers.
- `Bootgly\ADI\Databases` — o registry de paradigmas, que cria uma fachada pelo nome (só `sql` está
  registrado), e as duas fachadas que estendem o núcleo: `Databases\SQL`, para PostgreSQL,
  MySQL/MariaDB e SQLite, e `Databases\KV`, para Redis.
- `Bootgly\ADI\Table` — o dataset em memória, com as seções `Header`, `Body` e `Footer`.
- `Bootgly\ADI\Validation` — o motor de validação; `Validation\Condition` é a base abstrata de toda
  regra.
- `Bootgly\ADI\Validators` — a base que uma aplicação estende para escrever uma regra própria; as 14
  regras built-in ficam em `Bootgly\ADI\Validators\*`.

As duas fachadas conduzem uma operação com `await()`, `advance()`, `cancel()` e `withdraw()`. `KV`
envia comandos Redis com `command()`; `SQL` abre o resto da pilha SQL:

- `$Database->query(...)` — ponto de execução para SQL raw, um builder ou uma `Query` compilada.
- `$Database->table(...)` — Query Builder (DML: `SELECT`/`INSERT`/`UPDATE`/`DELETE`).
- `$Database->begin()` — uma transação presa a uma conexão do pool.
- `$Database->structure()` — Schema Builder (DDL + migrations), uma instância `Schema` em cache
  vinculada ao dialeto do banco (mesma instância em toda chamada).
- `$Database->map(...)` — um repositório ORM para uma classe de entidade.

Em rotas HTTP, o WPI adiciona
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**: depois que
o projeto registra os resources `Database` e `KV`
(**[Registrar resources de projeto](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#registrar-resources-de-projeto)**),
a rota aguarda operações SQL e KV por `$Response->Database` e `$Response->KV` e ainda envia HTTP
pela API normal de `Response`. O WPI também adiciona o middleware
**[Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/#validator)**, que executa uma
`Validation` sobre a requisição antes do handler. No console, o componente
**[Table](/manual/CLI/UI/Components/Table/overview/)** do CLI desenha um dataset `Table`.
