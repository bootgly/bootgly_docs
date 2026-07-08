# Paginação ORM

Repositories paginam em dois modos. O **modo página** fatia com `LIMIT`/`OFFSET` e sempre despacha um `COUNT(*)` em pipeline para o total. O **modo cursor** fatia com um predicado keyset derivado de um token opaco, nunca conta, e detecta a próxima página sondando uma linha além do limite.

Os dois modos acrescentam a chave primária como desempate final do `ORDER BY` automaticamente, então as bordas de página são estáveis mesmo quando a ordenação do usuário tem duplicatas.

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
GET /users?cursor=&limit=50
```

```http
HTTP/1.1 200 OK
Link: </users?limit=50&cursor=WyJCb2IiLDdd>; rel="next"
Content-Type: application/json

{"items":[...],"limit":50,"next":"WyJCb2IiLDdd"}
```

Clientes seguem `next` (ou o header `Link`) até que seja `null`. O modo cursor não emite `X-Total-Count` nem relação `prev` — keysets caminham apenas para frente.

## Tratar cursores inválidos

Tokens de cursor são input do cliente e são validados estritamente. Um token malformado lança `InvalidArgumentException` antes de qualquer query ser despachada:

```php
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
$Mapped->Pagination;  // mesma instância
```

O modo cursor nessa camada usa o enum `Modes` para a primeira página e o token emitido depois:

```php
use Bootgly\ADI\Databases\SQL\Repository\Pagination\Modes;

$First = new Pagination(limit: 20, Mode: Modes::Cursor);
$Mapped = $Users->hydrate($Database->await($Users->paginate(null, $First)));

$Next = new Pagination(limit: 20, cursor: $First->next);
```

No modo página o `COUNT(*)` precisa estar finalizado quando `hydrate()` roda: com um driver assíncrono o repository precisa de uma ponte de await (`Awaiting: $Database`, uma transação, ou o database resource do HTTP), caso contrário `hydrate()` lança exceção. Drivers síncronos (SQLite) nunca precisam. Em superfícies seriais como transações — que rejeitam uma segunda operação enquanto uma está pendente — o despacho do `COUNT(*)` é adiado automaticamente para a hidratação, então a paginação por página também funciona dentro de `Transaction::map()`.

## Ressalvas

- O modo cursor exige colunas não anuláveis e com ordenação simples — `paginate()` rejeita colunas de ordenação anuláveis e ordenação `NULLS FIRST/LAST` antes de qualquer query ser despachada.
- O modo cursor nunca emite links `prev`; caminhe apenas para frente.
- O modo cursor busca `limit + 1` linhas: a linha de sonda resolve `more`/`next` e é descartada antes das relações carregarem.
- Quando `cursor` e `page` estão presentes no request, `cursor` vence.
- Com réplicas de leitura, a query de itens e o `COUNT(*)` podem atingir réplicas diferentes; o total pode atrasar marginalmente em relação aos itens.
- Entidades serializam pela negociação de conteúdo via propriedades públicas; mantenha propriedades de relações lazy fora de entidades expostas em REST.

## Referência

```php
public function paginate (null|Selection $Selection = null, null|Pagination $Pagination = null, null|object $Scope = null): Operation
```

`Bootgly\ADI\Databases\SQL\Repository` — despacha a operação de itens paginada (mais um `COUNT(*)` em pipeline no modo página) e retorna a operação de itens. A selection recebida é clonada, nunca mutada. Passe a operação retornada para `hydrate()` para resolver o resultado.

```php
public function __construct (int $limit = 10, null|int $page = null, null|string $cursor = null, null|Modes $Mode = null)
```

`Bootgly\ADI\Databases\SQL\Repository\Pagination` — o modo é inferido: um `cursor` seleciona `Modes::Cursor`, uma `page` seleciona `Modes::Page`, nenhum dos dois assume `Modes::Page` a menos que `$Mode` diga o contrário. Inputs contraditórios (page + cursor, ou um modo explícito contra o inferido) lançam `InvalidArgumentException`.

```php
public static function encode (array $values): string
```

Codifica valores keyset ordenados (colunas de ordenação primeiro, chave primária por último) em um token base64url opaco. Valores nulos ou não escalares lançam exceção.

```php
public function decode (int $arity): array
```

Decodifica o cursor desta paginação em valores keyset, validando estrutura, aridade e tipos escalares estritamente. Qualquer violação lança `InvalidArgumentException`.

```php
public function resolve (null|int $total = null, null|int $pages = null, bool $more = false, null|string $next = null, null|string $previous = null): static
```

Grava o resultado da paginação (`total`, `pages`, `more`, `next`, `previous`). Chamado pelo repository durante o `hydrate()`.

```php
public function seek (array $orders, array $values): static
```

`Bootgly\ADI\Databases\SQL\Repository\Selection` — restringe a selection a linhas estritamente depois de uma posição keyset. Orders e values são pares posicionais (`['column' => ..., 'order' => Orders::...]` mais um valor cada); o último par é o desempate único. Os nomes de coluna precisam ser colunas SQL resolvidas — o repository resolve propriedades mapeadas antes do seek.

```php
public function count (): Query
```

`Bootgly\ADI\Databases\SQL\Repository\Selection` — compila uma query `SELECT COUNT(*) AS "total"` reexecutando apenas predicados de restrição (filters e matches); ordenação, limit, offset e locks são descartados.

```php
public function paginate (string|Repository $Entity, null|Selection $Selection = null): array
```

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database` — pagina uma entidade mapeada pelos parâmetros de query do request, emite os headers `X-Total-Count` (modo página) e `Link`, e retorna o array de body negociável. Aceita o nome da classe da entidade ou um repository já mapeado.

```php
public function bind (Response $Response): static
```

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database` — vincula o contexto de response; chamado automaticamente quando o resource é montado em um response.

### Modes

`Bootgly\ADI\Databases\SQL\Repository\Pagination\Modes`:

| Case | Comportamento |
| ------ | --------------- |
| `Page` | Fatia `LIMIT`/`OFFSET` + total `COUNT(*)` em pipeline |
| `Cursor` | Predicado keyset + sonda `limit + 1`, sem contagem |
