# Paginação ORM

Repositories paginam em dois modos. O **modo página** fatia com `LIMIT`/`OFFSET` e envia um `COUNT(*)` para o total. O **modo cursor** fatia com um predicado keyset derivado de um token opaco, nunca conta, e detecta a próxima página sondando uma linha além do limite.

Os dois modos acrescentam a chave primária como desempate final do `ORDER BY` automaticamente, então as bordas de página são estáveis mesmo quando a ordenação do usuário tem duplicatas.

## Entidade desta página

```php
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('users')]
class User
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';

   #[Column]
   public bool $active = true;

   #[Column(nullable: true)]
   public null|string $city = null;
}
```

A tabela `users` tem 23 linhas, com os ids de 1 a 23. Como um repositório as lê e hidrata está em
**[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**, e as seleções que restringem e
ordenam uma página estão em
**[Seleções ORM](/manual/ADI/Databases/SQL/Repository/Selection/overview/)**.

Os exemplos da camada ADI usam `$Database`, a fachada SQL: na função de boot, num comando ou num
script de um projeto, `new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure())`;
fora de um projeto, `new SQL([...])` com as chaves de conexão — veja
**[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**. Os exemplos HTTP rodam dentro
de uma rota `HTTP_Server_CLI`, pelo `$Response->Database`.

## Paginar uma rota HTTP

Dentro do `HTTP_Server_CLI`, o resource `$Response->Database` lê `?page`, `?limit` e `?cursor` do request, emite os headers REST e retorna um body pronto para a negociação de conteúdo:

```php
return $Response->Negotiation->send(
   $Response->Database->paginate(User::class)
);
```

Um request como `GET /users?page=2&limit=5` produz:

```http
HTTP/1.1 200 OK
X-Total-Count: 23
Link: </users?limit=5&page=3>; rel="next", </users?limit=5&page=1>; rel="prev"
Content-Type: application/json

{"items":[...],"page":2,"pages":5,"limit":5,"total":23}
```

`limit` é limitado entre `1` e `Database::$cap` (padrão `100`); valores inválidos caem no `Database::$limit` (padrão `10`). Parâmetros de query estrangeiros (filtros, termos de busca) são preservados nas URLs do `Link`.

## Filtrar e ordenar

Passe uma `Selection` para restringir e ordenar o conjunto paginado — a paginação a clona, então a mesma selection pode ser reutilizada:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Users = $Response->Database->map(User::class);

$Page = $Response->Database->paginate(
   $Users,
   $Users->select()
      ->filter(new Identifier('active'), Operators::Equal, true)
      ->order(Orders::Asc, new Identifier('name'))
);

return $Response->Negotiation->send($Page);
```

## Caminhar com cursores

Uma chave `cursor` presente seleciona o modo keyset — um valor vazio inicia a caminhada:

```http
GET /users?cursor=&limit=10
```

```http
HTTP/1.1 200 OK
Link: </users?limit=10&cursor=WzEwXQ>; rel="next"
Content-Type: application/json

{"items":[...],"limit":10,"next":"WzEwXQ"}
```

Clientes seguem `next` (ou o header `Link`) até que seja `null`. O modo cursor não emite `X-Total-Count` nem relação `prev` — keysets caminham apenas para frente.

## Tratar cursores inválidos

Tokens de cursor são input do cliente e são validados estritamente. Um token malformado lança `InvalidArgumentException` antes de qualquer query ser despachada:

```php
use InvalidArgumentException;

try {
   $Page = $Response->Database->paginate(User::class);
}
catch (InvalidArgumentException) {
   return $Response->code(400)->Negotiation->send(['error' => 'Invalid pagination cursor.']);
}

return $Response->Negotiation->send($Page);
```

## Paginar na camada ADI

Fora do HTTP, chame `Repository::paginate()` diretamente. Hidratar a operação retornada resolve o resultado na instância de `Pagination` e no mapped result:

```php
use Bootgly\ADI\Databases\SQL\Repository\Pagination;

$Users = $Database->map(User::class, Awaiting: $Database);

$Pagination = new Pagination(limit: 20, page: 2);
$Mapped = $Users->hydrate($Database->await($Users->paginate(null, $Pagination)));

$Pagination->total;   // 23
$Pagination->pages;   // 2
$Mapped->Pagination;  // same instance
```

O modo cursor nessa camada usa o enum `Modes` para a primeira página e o token emitido depois:

```php
use Bootgly\ADI\Databases\SQL\Repository\Pagination\Modes;

$First = new Pagination(limit: 20, Mode: Modes::Cursor);
$Mapped = $Users->hydrate($Database->await($Users->paginate(null, $First)));

$Next = new Pagination(limit: 20, cursor: $First->next);
```

Para percorrer todas as páginas, leia `next` depois de cada uma e pare quando ele for `null` — `more` é então `false`:

```php
$Pagination = new Pagination(limit: 10, Mode: Modes::Cursor);
$read = 0;

while (true) {
   $Mapped = $Users->hydrate($Database->await($Users->paginate(null, $Pagination)));
   $read += $Mapped->count;

   if ($Pagination->next === null) {
      break;
   }

   $Pagination = new Pagination(limit: 10, cursor: $Pagination->next);
}

$read; // 23
```

Não passe um token `null` de volta: `new Pagination(cursor: null)` não tem cursor, então inicia uma paginação em modo página da página 1.

No modo página o `COUNT(*)` precisa estar finalizado quando `hydrate()` roda: com um driver assíncrono (PostgreSQL, MySQL) o repository precisa de uma ponte de await (`Awaiting: $Database`, uma transação, ou o database resource do HTTP), caso contrário `hydrate()` lança `ORM pagination count requires an await bridge.` O SQLite roda cada instrução dentro da chamada e nunca precisa de uma. Numa fachada com pool, o `paginate()` envia o `COUNT(*)` logo atrás da query de itens, em pipeline. Uma transação é uma superfície serial — recusa uma segunda instrução enquanto uma está rodando —, então ali o `paginate()` envia só a query de itens e o `hydrate()` envia o `COUNT(*)` e o aguarda pela transação; no SQLite a query de itens já rodou a essa altura, então o `paginate()` envia as duas. A paginação por página funciona dentro de `Transaction::map()` de qualquer jeito.

## Ordenar uma caminhada por cursor

Uma página por cursor lê as linhas que ordenam estritamente depois da última linha da página anterior, comparando cada coluna de ordenação com `>` — `<` em ordem descendente —, uma comparação que `NULL` nunca passa. Então o modo cursor precisa de colunas de ordenação que nunca guardam `NULL`, e o `paginate()` recusa, antes de enviar qualquer coisa, o que ele consegue saber que pode guardar um:

```php
use InvalidArgumentException;

use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

try {
   $Users->paginate(
      $Users->select()->order(Orders::Asc, new Identifier('city')),
      new Pagination(limit: 10, Mode: Modes::Cursor)
   );
}
catch (InvalidArgumentException $Exception) {
   $Exception->getMessage(); // ORM cursor pagination requires non-nullable order columns: city
}
```

- Uma coluna de ordenação cuja propriedade está marcada `#[Column(nullable: true)]`, como `city`, lança `ORM cursor pagination requires non-nullable order columns: city`.
- Uma ordenação com `Nulls::First` ou `Nulls::Last` lança `ORM cursor pagination does not support NULLS ordering.`

O `paginate()` julga uma coluna só por essa marca. Uma propriedade `null|string` sem `nullable: true` passa, e um `NULL` na coluna dela quebra a caminhada depois que a query rodou: toda página depois da primeira compara a coluna com o último valor servido, uma comparação em que `NULL` nunca passa, então só a primeira página pode trazer as linhas com `NULL`. Ordenadas primeiro — em ordem descendente no PostgreSQL, ascendente no MySQL e no SQLite — elas são servidas ali; ordenadas por último, saem da caminhada sem erro, a menos que a primeira página já chegue a elas. Uma página que termina numa delas faz o `hydrate()` lançar `InvalidArgumentException`: `ORM pagination cursor requires scalar, non-null order values.` — a exceção que um cursor malformado lança, então uma rota a responde como tal. Marque com `nullable: true` toda coluna que pode guardar `NULL`, para a recusa vir antes de qualquer query. O modo página ordena por essas colunas sem restrição.

## Ressalvas

- O modo cursor nunca emite links `prev`; caminhe apenas para frente. `previous` fica `null`: o repository nunca o define.
- O modo cursor busca `limit + 1` linhas: a linha de sonda resolve `more`/`next` e é descartada antes das relações carregarem.
- O token é o JSON em base64url dos valores de ordenação e da chave da última linha — `WzEwXQ` acima é `[10]`, só a chave, e uma caminhada ordenada por `name` traz o nome também, como `WyJCb2IiLDdd` traz `["Bob",7]`: opaco, não secreto. Não ordene uma caminhada por cursor por uma coluna que o cliente não pode ler.
- O `paginate()` substitui o `limit()` e o `skip()` da própria seleção pela fatia da página, roda os escopos nomeados dela e emite `Selecting` e `Selected` como o `fetch()`.
- Uma página depois da última não tem itens, e `more` é `false`.
- Quando `cursor` e `page` estão presentes no request, `cursor` vence.
- Com réplicas de leitura, a query de itens e o `COUNT(*)` podem atingir réplicas diferentes; o total pode atrasar marginalmente em relação aos itens.
- Entidades serializam pela negociação de conteúdo via propriedades públicas; mantenha propriedades de relações lazy fora de entidades expostas em REST.

## Referência

`Selection::seek()`, que monta o keyset de uma página por cursor, e `Selection::count()`, que compila o total da página, estão na Referência de **[Seleções ORM](/manual/ADI/Databases/SQL/Repository/Selection/overview/#referência)**.

### Repository

```php
paginate (null|Selection $Selection = null, null|Pagination $Pagination = null, null|object $Scope = null): Operation
```

`Bootgly\ADI\Databases\SQL\Repository` — lê uma página de uma cópia da seleção, toda linha sem uma, e retorna a operação de itens; sem `$Pagination`, a página 1 de 10 linhas. No modo página ele também envia um `COUNT(*)` — em pipeline numa fachada com pool; numa superfície serial cuja query de itens ainda está rodando, o `hydrate()` o envia no lugar. Lança `InvalidArgumentException` antes de qualquer query para um cursor malformado, para um escopo que o repositório não registrou (`ORM scope is not registered: <name>`) e para um identificador de enum int-backed (`ORM selection enum identifiers must be string-backed.`), e, no modo cursor, para uma coluna de ordenação `nullable` ou uma ordenação com `Nulls`. Passe a operação retornada para `hydrate()` para resolver o resultado.

### Pagination

`Bootgly\ADI\Databases\SQL\Repository\Pagination`, o pedido e o resultado de uma página.

#### Métodos

```php
__construct (int $limit = 10, null|int $page = null, null|string $cursor = null, null|Modes $Mode = null)
```

O modo é inferido: um `cursor` seleciona `Modes::Cursor`, uma `page` seleciona `Modes::Page`, nenhum dos dois assume `Modes::Page` a menos que `$Mode` diga o contrário. Um `limit` ou uma `page` abaixo de 1, uma página junto com um cursor, ou um modo explícito contra o inferido lançam `InvalidArgumentException`.

```php
static encode (array $values): string
```

Codifica valores keyset ordenados (colunas de ordenação primeiro, chave primária por último) em um token base64url opaco. Valores nulos ou não escalares lançam exceção.

```php
decode (int $arity): array
```

Decodifica o cursor desta paginação em valores keyset, validando estrutura, aridade e tipos escalares estritamente. Qualquer violação lança `InvalidArgumentException`.

```php
resolve (null|int $total = null, null|int $pages = null, bool $more = false, null|string $next = null, null|string $previous = null): static
```

Grava o resultado da paginação (`total`, `pages`, `more`, `next`, `previous`). Chamado pelo repository durante o `hydrate()`.

#### Propriedades

```php
public private(set) Modes $Mode
```

O modo, inferido pelo construtor.

```php
public private(set) int $limit
```

As linhas por página.

```php
public private(set) null|int $page
```

A página a ler; `null` lê a página 1 no modo página, e é sempre `null` no modo cursor.

```php
public private(set) null|string $cursor
```

O token da página a ler; `null` para a primeira página de uma caminhada.

```php
public private(set) null|int $total = null
```

Modo página: o número de linhas que a seleção casa, definido pelo `hydrate()`.

```php
public private(set) null|int $pages = null
```

Modo página: o número de páginas, o total dividido por `limit` e arredondado para cima.

```php
public private(set) bool $more = false
```

Se uma página vem depois desta.

```php
public private(set) null|string $next = null
```

Modo cursor: o token da próxima página, `null` na última.

```php
public private(set) null|string $previous = null
```

Nunca definido pelo repository.

### Modes

`Bootgly\ADI\Databases\SQL\Repository\Pagination\Modes`:

| Case | Comportamento |
| ------ | --------------- |
| `Page` | Fatia `LIMIT`/`OFFSET` + total `COUNT(*)`, em pipeline numa fachada com pool e enviado pelo `hydrate()` dentro de uma transação |
| `Cursor` | Predicado keyset + sonda `limit + 1`, sem contagem |

### Resource HTTP

```php
paginate (string|Repository $Entity, null|Selection $Selection = null): array
```

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database` — pagina uma entidade mapeada pelos parâmetros de query do request, emite os headers `X-Total-Count` (modo página) e `Link`, e retorna o array de body negociável. Aceita o nome da classe da entidade ou um repository já mapeado.

```php
bind (Response $Response): static
```

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database` — vincula o contexto de response; chamado automaticamente quando o resource é montado em um response.
