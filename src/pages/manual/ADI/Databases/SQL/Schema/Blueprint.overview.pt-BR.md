# Definindo tabelas

Dentro de `$Schema->create(...)` e `$Schema->alter(...)` você recebe um `$Table` para
descrever suas colunas. Esta página é um livro de receitas: ache o que precisa, copie.

Toda coluna é `$Table->add('nome', Types::Algo)` mais modificadores opcionais.

- **Métodos encadeiam** (`->limit()`, `->constrain()`, …) — retornam a coluna.
- **`nullable` e `default` são propriedades** — você as *atribui*. Uma atribuição encerra o
  statement, então vem **por último** (ou capture a coluna numa variável):

  ```php
  $Table->add('active', Types::Boolean)->default = true;     // ok: atribuição por último
  $Table->add('bio', Types::Text)->nullable = true;          // ok

  $Email = $Table->add('email', Types::String)->limit(190);  // captura, depois atribui
  $Email->nullable = true;
  ```

**Colunas são `NOT NULL` por padrão.** Use `->nullable = true` para permitir `NULL`.

## As colunas que você mais usa

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Defaults;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;

$Schema->create('users', function (Blueprint $Table): void {
   // Chave primária auto-incremental
   $Table->add('id', Types::BigInteger)->generate()->constrain(Keys::Primary);

   // Texto com limite de tamanho, deve ser único
   $Table->add('email', Types::String)->limit(190)->constrain(Keys::Unique);

   // Texto livre, opcional (permite NULL)
   $Table->add('bio', Types::Text)->nullable = true;

   // Booleano com default
   $Table->add('active', Types::Boolean)->default = true;

   // Dinheiro / decimal fixo: 10 dígitos, 2 após a vírgula, default 0
   $Table->add('balance', Types::Decimal)->size(10, 2)->default = 0;

   // Timestamp com default "agora"
   $Table->add('created_at', Types::Timestamp)->default = new Expression('CURRENT_TIMESTAMP');
});
```

`default` aceita um literal (`bool`/`int`/`float`/`string`), um `Stringable` ou uma
`Expression` para SQL cru confiável. Durante a compilação de `create()`/`alter()`, literais
float precisam ser finitos: `NAN`, `INF` e `-INF` lançam
`InvalidArgumentException: Schema default float must be finite.` Outros tipos de valor
inválidos lançam
`InvalidArgumentException: Schema column default must be scalar, Stringable or Expression.`

### Ligando a outra tabela (chave estrangeira)

```php
$Table->add('team_id', Types::BigInteger)->reference('teams', 'id');
// team_id precisa bater com um id na tabela teams
```

Quer comportamento de delete/update? Use a forma de tabela e encadeie as regras:

```php
$Table->reference('team_id', 'teams', 'id')
   ->delete(References::Cascade)    // deletar o team → deletar as linhas dele
   ->update(References::Restrict);  // bloquear mudança de um id referenciado
```

A constraint é auto-nomeada `<tabela>_<coluna>_<tabelaAlvo>_fk` (ex.:
`users_team_id_teams_fk`), truncada ao limite de identificador da engine. Passe `name:`
para sobrescrever.

### Escolhendo o tipo da coluna

| Você quer… | Use |
|------------|-----|
| Número inteiro id / contador | `Types::BigInteger`, `Types::Integer` |
| Texto curto (nomes, emails) | `Types::String` + `->limit(n)` |
| Texto longo | `Types::Text` |
| Verdadeiro / falso | `Types::Boolean` |
| Dinheiro / decimal exato | `Types::Decimal` + `->size(p, s)` |
| Número fracionário | `Types::Float` |
| Data / hora | `Types::Date`, `Types::Time`, `Types::Timestamp` |
| Instante com fuso horário | `Types::Timestamptz` |
| Documento JSON | `Types::Json`, `Types::JsonB` |
| UUID | `Types::Uuid` |

Se você não passar um tipo, recebe `Types::Text`.

`Types::Timestamp` é um valor de relógio de parede sem fuso (`TIMESTAMP` no PostgreSQL e no MySQL); `Types::Timestamptz` é um instante — `TIMESTAMPTZ` no PostgreSQL, o `TIMESTAMP` do MySQL (guardado em UTC, exibido no fuso da sessão) e `TEXT` no SQLite.

## Alterando uma tabela depois

Num `alter`, `add()` adiciona colunas novas; `change()` edita uma **existente**. `change()`
continua recebendo o tipo alvo, mas mudanças apenas de default/nullability não forçam uma
cláusula de tipo. Defina `nullable`/`default` no objeto de mudança retornado; atribua
`Defaults::None` para remover um default existente:

```php
$Schema->alter('users', function (Blueprint $Table): void {
   $Table->add('phone', Types::String)->limit(20)->nullable = true; // nova coluna

   $Email = $Table->change('email', Types::String)->limit(320);
   $Email->nullable = false;                                          // SET NOT NULL

   $Active = $Table->change('active', Types::Boolean);
   $Active->nullable = true;                                          // DROP NOT NULL
   $Active->default  = false;                                         // SET DEFAULT

   $Table->change('created_at', Types::Timestamp)->default = Defaults::None; // DROP DEFAULT

   $Table->remove('legacy');                                          // remove coluna
});

// Um rename vai num alter() só dele — veja abaixo.
$Schema->alter('users', function (Blueprint $Table): void {
   $Table->rename('bio', 'profile');
});
```

**Um rename não divide um `alter()`.** O `ALTER TABLE` do PostgreSQL tem duas formas
disjuntas — uma lista de ações separadas por vírgula, e um rename — então um rename ao lado de
qualquer outra coisa, inclusive de outro rename, é erro de sintaxe, não instrução — então lá o
Bootgly recusa esse blueprint em vez de compilá-lo. O MySQL aceita a combinação e a compila
como escrita. Manter o rename num `alter()` só dele funciona em toda engine.

> Algumas dessas dependem da engine do banco. O PostgreSQL faz todas; MySQL e SQLite têm
> limites — veja **[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)**. Quando
> uma engine não consegue uma ação, ela dá erro em vez de produzir SQL quebrado.

**No MySQL, mudar o tipo carrega a coluna inteira.** O `MODIFY COLUMN` reescreve toda a
definição da coluna, e o que a instrução deixar de fora volta ao padrão em silêncio — o
`NOT NULL`, o `DEFAULT`, o `AUTO_INCREMENT`, o `COMMENT`. Por isso um change que só nomeia um
tipo é recusado em vez de compilado: declare no change tudo o que a coluna precisa manter.

```php
$Change = $Table->change('email', Types::String)->limit(320);
$Change->nullable = false;
$Change->default  = '';
// ALTER TABLE `users` MODIFY COLUMN `email` VARCHAR(320) NOT NULL DEFAULT ''

$Key = $Table->change('id', Types::BigInteger)->generate();  // mantém a identidade
$Key->nullable = false;
// ALTER TABLE `users` MODIFY COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT
```

Sem o `generate()`, retipar uma coluna de identidade a derruba, e o insert seguinte morre com
`1364: Field 'id' doesn't have a default value`. No PostgreSQL a identidade sobrevive à mudança
de tipo sozinha, então declarar lá não custa nada e mantém a migration portável.

Um `COMMENT` ou `COLLATE` que a coluna carregue não faz parte do blueprint, então não pode ser
reescrito por aqui — reaplique com uma instrução crua depois da mudança.

> Uma mudança de tipo precisa declarar que é uma: `limit()`, `size()`, `cast()` e `generate()`
> declaram, enquanto atribuir `nullable` ou `default` sozinhos transformam o change em algo
> só de metadados. O `limit()` molda `String` e o `size()` molda `Decimal`; nos outros tipos o
> argumento é descartado, então neles o `generate()` é a única forma honesta de declarar.

## Dica: nomes tipados com enums

Nomes aceitam string, mas também um backed enum — útil para evitar typos entre migrations:

```php
enum Tables: string  { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Email = 'email'; }

$Schema->create(Tables::Users, function (Blueprint $Table): void {
   $Table->add(Columns::Id, Types::BigInteger)->generate()->constrain(Keys::Primary);
   $Table->add(Columns::Email, Types::String)->limit(190)->constrain(Keys::Unique);
});
```

## Referência

### Métodos do Blueprint

```php
add (BackedEnum|Stringable|string $Column, Types $Type = Types::Text): Column
```
Define uma coluna nova; retorna a `Column` para modificar.

```php
remove (BackedEnum|Stringable|string $Column): self
```
Apenas ALTER — remove uma coluna existente.

```php
change (BackedEnum|Stringable|string $Column, Types $Type): Change
```
Apenas ALTER — altera uma coluna existente; retorna o `Change`. Um `change()` puro emite
mudança de tipo; `limit()`, `size()` e `cast()` mantêm a ação de tipo ativa; atribuir
apenas `nullable`, `default` ou `Defaults::None` altera só esse atributo.

```php
rename (BackedEnum|Stringable|string $From, BackedEnum|Stringable|string $To): self
```
Apenas ALTER — renomeia uma coluna existente.

```php
index (BackedEnum|Stringable|string|array $Columns, null|string $name = null, bool $unique = false): Index
```
Define um índice sobre uma ou mais colunas.

```php
reference (BackedEnum|Stringable|string $Column, BackedEnum|Stringable|string $Table, BackedEnum|Stringable|string $Reference = 'id', null|string $name = null): Reference
```
Adiciona uma chave estrangeira de tabela; retorna o `Reference` para `->delete()`/`->update()`.

### Column — propriedades

```php
public bool $nullable = false;
```
`true` permite `NULL`; padrão `false` significa `NOT NULL`. Atribua (`$Column->nullable = true`).

```php
public null|bool|float|int|string|Stringable|Defaults $default;
```
Propriedade com hook. **Definir:** `$Column->default = …`. **Limpar default pendente numa
coluna nova:** `$Column->default = Defaults::None`. **Remover default existente em
`change()`:** `$Change->default = Defaults::None`. Tipos de valor inválidos lançam
`InvalidArgumentException`. Durante a compilação de `create()`/`alter()`, literais float
não finitos (`NAN`, `INF`, `-INF`) lançam
`InvalidArgumentException: Schema default float must be finite.` `Expression` continua
sendo a saída de escape para SQL cru confiável.

### Column — métodos

```php
limit (int $length): self
```
Tamanho de string onde o dialeto suporta.

```php
size (int $precision, int $scale = 0): self
```
Precisão/escala numérica.

```php
generate (): self
```
Identity / `AUTO_INCREMENT` / `AUTOINCREMENT`.

```php
constrain (Keys $Key): self
```
`Keys::Primary` ou `Keys::Unique`.

```php
check (string|Expression $expression): self
```
Adiciona uma expressão `CHECK`.

```php
reference (BackedEnum|Stringable|string $Table, BackedEnum|Stringable|string $Column = 'id', null|string $name = null): self
```
Chave estrangeira inline nesta coluna.

### Change — membros extras (ALTER)

`Change` compartilha `nullable`/`default` com `Column`, mas `nullable` é tri-state:

```php
public null|bool $nullable = null;
```
`null` = não muda, `true` = permite `NULL` (`DROP NOT NULL`), `false` = exige valor
(`SET NOT NULL`).

```php
cast (string|Expression $expression): self
```
Expressão `USING` do PostgreSQL para a conversão de tipo:

```php
$Table->change('legacy_id', Types::BigInteger)->cast(new Expression('legacy_id::bigint'));
// ALTER COLUMN "legacy_id" TYPE BIGINT USING legacy_id::bigint
```

Engines sem `Capabilities::AlterColumnUsing` (MySQL, SQLite) rejeitam o cast.

### Enums auxiliares

Namespace `Bootgly\ADI\Databases\SQL\Schema\Auxiliaries`:

| Enum | Casos |
|------|-------|
| `Types` | `BigInteger`, `Boolean`, `Date`, `Decimal`, `Float`, `Integer`, `Json`, `JsonB`, `String`, `Text`, `Time`, `Timestamp`, `Timestamptz`, `Uuid` |
| `Keys` | `Primary`, `Unique` |
| `References` | `Cascade`, `NoAction`, `Restrict`, `SetDefault`, `SetNull` |
| `Defaults` | `None` |
| `Directions` | `Up`, `Down` |
| `Capabilities` | `AddConstraint`, `AlterColumnDefault`, `AlterColumnNullability`, `AlterColumnType`, `AlterColumnUsing`, `DropColumn`, `DropConstraint`, `MultiActionAlter`, `RenameColumn` |
