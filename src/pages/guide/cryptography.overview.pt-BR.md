# Criptografia

O Bootgly traz dois essenciais de criptografia na camada de aplicação em
`Bootgly\API\Security`, ao lado dos componentes existentes de JWT e Authorization:

- `Encrypter` — criptografia simétrica autenticada (AES-256-GCM via OpenSSL) com
  gerenciamento e rotação de chaves.
- `Password` — hashing de senhas com argon2id e política rehash-on-verify, mais
  verificadores para os hashes de usuários importados de outra stack.

Ambos são agnósticos de transporte: criptografam valores e fazem hash de senhas para
qualquer armazenamento — colunas de banco, cookies, payloads de fila — sem tocar em
preocupações de HTTP.

## Gere uma chave

Uma chave do `Encrypter` são exatamente 32 bytes de material aleatório. Gere uma e
mantenha-a fora do repositório — uma variável de ambiente é o lugar canônico:

```bash :toolbar="true";
php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
```

```bash
# .env / ambiente do processo
BOOTGLY_KEY="wV3n0v9…base64 de 44 chars…Q0k="
```

Não existe chave global implícita: a aplicação sempre injeta a chave explicitamente, da
mesma forma que o `JWT` recebe seu secret.

## Criptografe e descriptografe valores

Conecte a chave uma vez no boot e criptografe qualquer payload string:

```php
use Bootgly\API\Security\Encrypter;
use Bootgly\API\Security\Encrypter\Key;

$Encrypter = new Encrypter(
   Key::import((string) getenv('BOOTGLY_KEY'))
);

$envelope = $Encrypter->encrypt('4111 1111 1111 1111');
// v1..EUtRhzNuVLmVSiGJE8yikQd7oVb8sxabiFi8NvNJN99umiGxvcGLkcwo4_6PPdE

$plaintext = $Encrypter->decrypt($envelope);
```

`decrypt()` retorna `null` em **qualquer** falha — ciphertext adulterado, chave errada,
key id desconhecido, envelope malformado. Nenhum motivo é revelado, então dados inválidos
não podem ser sondados:

```php
$plaintext = $Encrypter->decrypt($envelope);

if ($plaintext === null) {
   // trate como inválido — reautentique, descarte ou registre
}
```

Cada chamada usa um IV aleatório novo, então criptografar o mesmo valor duas vezes produz
envelopes diferentes. O envelope é uma string ASCII na forma `v1.<kid>.<blob>`: a versão
do formato, o id da chave e um blob base64url carregando IV, ciphertext e tag de
autenticação.

## Vincule contexto com AAD

Additional Authenticated Data amarra um envelope ao seu contexto sem armazenar esse
contexto dentro do ciphertext. Um valor criptografado para um usuário falha na
autenticação quando reaproveitado para outro:

```php
$envelope = $Encrypter->encrypt($document, AAD: "user-{$id}");

// Depois — o mesmo AAD é exigido para descriptografar:
$document = $Encrypter->decrypt($envelope, AAD: "user-{$id}");   // ✅
$stolen = $Encrypter->decrypt($envelope, AAD: 'user-1337');      // null
```

Os segmentos de versão e key id do envelope são sempre autenticados junto com o AAD do
chamador — trocar segmentos entre envelopes falha na autenticação.

## Rotacione chaves

Rotação exige ids de chave. Dê um `kid` a cada chave, monte um `Keyring` e promova uma
nova primária enquanto as chaves anteriores continuam registradas para descriptografia:

```php
use Bootgly\API\Security\Encrypter;
use Bootgly\API\Security\Encrypter\Key;
use Bootgly\API\Security\Encrypter\Keyring;

// Ano um:
$Encrypter = new Encrypter(new Key($material2026, 'k2026'));

// Ano dois — nova primária, chave antiga mantida para descriptografia:
$Encrypter->Keyring->rotate(new Key($material2027, 'k2027'));

$new = $Encrypter->encrypt($payload);   // selado com k2027
$old = $Encrypter->decrypt($legacy);    // envelopes k2026 ainda descriptografam
```

O runbook de rotação:

1. Gere uma chave nova com um id novo e aplique `rotate()` (ou construa o `Keyring` com a
   nova primária primeiro e as chaves antigas depois).
2. Novas escritas são seladas com a nova primária; envelopes antigos continuam
   descriptografando porque o envelope registra qual `kid` o selou.
3. Recriptografe valores armazenados de forma preguiçosa — descriptografe, criptografe,
   persista — conforme forem tocados.
4. Remova a chave aposentada quando nenhum envelope armazenado a referenciar mais. A
   partir daí, os envelopes dela descriptografam para `null`.

Múltiplos processos podem compartilhar o ring injetando as mesmas chaves em todos — o key
id dentro do envelope seleciona a chave certa de forma determinística, nunca por
tentativa de descriptografia.

Compartilhar traz um limite operacional: IVs GCM aleatórios de 96 bits carregam um
orçamento de uso (NIST SP 800-38D) de no máximo **2^32 criptografias por chave raw**,
agregado entre todos os processos, hosts e key ids que compartilham o mesmo material de
32 bytes. Rotacione as chaves bem antes desse limite — para uma chave compartilhada de
alto volume, agende a rotação como manutenção de rotina, não como resposta a incidente.

## Faça hash de senhas

`Password` usa argon2id. Os padrões seguem os próprios padrões de Argon2 do PHP (64 MiB
de memória, 4 iterações, 1 thread) e o construtor recusa parâmetros abaixo do piso OWASP
(19 MiB, 2 iterações, 1 thread):

```php
use Bootgly\API\Security\Password;

$Password = new Password;

// Cadastro:
$hash = $Password->hash($input);
// $argon2id$v=19$m=65536,t=4,p=1$…  — persista esta string
```

O build do PHP precisa incluir suporte a Argon2 (os pacotes das distribuições oficiais
incluem); caso contrário o construtor lança `RuntimeException`. Não existe fallback
silencioso para bcrypt — um algoritmo canônico, hashes previsíveis em qualquer host.

## Login com rehash-on-verify

Políticas de hashing evoluem: custos sobem, algoritmos são substituídos. `inspect()`
verifica a senha **e** aplica a política em uma chamada — quando o hash armazenado está
defasado, o resultado carrega um hash novo e conforme para persistir:

```php
$Verification = $Password->inspect($input, $stored);

if ($Verification->valid === false) {
   // senha errada — rejeite o login
}

if ($Verification->hash !== null) {
   // válida, mas o hash armazenado é anterior à política atual: persista o
   // hash atualizado — só sobre o hash recém-verificado, para que um reset
   // gravado nesse meio-tempo nunca seja sobrescrito com a senha antiga
   // UPDATE users SET password = :new WHERE id = :id AND password = :stored
}
```

`Bootgly\API\Security\Users::verify()` faz tudo isso por você — o decoy, a verificação
e o upgrade compare-and-set; escreva à mão só para um store próprio.

Este também é o caminho de migração de armazenamento legado: `verify()` lê todo formato
que o `password_verify()` do PHP lê, então um hash bcrypt `$2y$…` — ou os hashes `$2a$…`,
`$2b$…` e `$6$…` que outras stacks gravam — ainda verifica, e `inspect()` o atualiza para
argon2id no próximo login bem-sucedido do usuário. Sem migração em lote, sem resets
forçados. Um formato que o PHP não lê precisa de um verificador — a próxima seção.

## Usuários importados de outra stack

Contas que vêm de outra stack costumam trazer um hash que o PHP não lê: uma string
PBKDF2, um digest com salt. Um **verificador** ensina esse formato ao `Password`, e esses
usuários entram com a senha que já têm e deixam o formato legado para trás no primeiro
login bem-sucedido.

**Antes de habilitar um verificador, confira a coluna do hash.** O upgrade grava um hash
argon2id por cima do legado, e um hash argon2id da política padrão tem 97 caracteres —
mais que a maioria dos formatos legados. Uma coluna dimensionada para o formato antigo
rejeita a escrita ou, pior, trunca o valor: o usuário entra uma vez e nunca mais. Deixe a
coluna como `VARCHAR(255)` (ou `TEXT`) primeiro.

Depois, passe o verificador ao `Password`. O que já vem pronto lê PBKDF2:

```php
use Bootgly\API\Security\Password;
use Bootgly\API\Security\Password\Verifiers\PBKDF2;
use Bootgly\API\Security\Users;

$Password = new Password(Verifiers: [
   new PBKDF2(prefix: 'v1:', digest: 'sha256', ceiling: 100_000),
]);
$Users = new Users($Database, $Password);

$Identity = $Users->verify($email, $input);
// primeiro login: verificado pelo verificador, a linha passa a guardar um hash argon2id
// logins seguintes: verificados nativamente, nada é gravado
```

O que acontece em um login:

1. Os formatos nativos vêm primeiro: o `password_verify()` é consultado para todo hash.
   Um hash que o `password_hash()` gera (argon2id, argon2i, bcrypt `$2y$…`) é respondido
   só por ele — um verificador nunca vê um desses, seja qual for a senha, e nunca vê um
   hash vazio.
2. Só um hash que o PHP não aceitou **e** para o qual não nomeia um algoritmo vai para os
   verificadores, na ordem em que você os passou: um formato legado, ou um hash `$2a$…` /
   `$6$…` de outra stack que a senha não abriu. O primeiro verificador que aceita encerra
   a busca.
3. Um hash legado nunca está conforme a política atual, então `inspect()` retorna um hash
   argon2id novo e `Users::verify()` o grava. O segundo login já encontra um hash nativo.

Defina `ceiling` com a maior contagem de iterações presente nas linhas importadas — uma
stack que aumentou o default ao longo dos anos deixou mais de uma. Um hash armazenado que
peça mais nunca verifica (e nada é reportado), então uma linha PBKDF2 adulterada não
consegue prender um worker.

Uma linha para a qual o PHP nomeia um algoritmo nunca chega a um verificador: toda linha
que começa com `$argon2i$` ou `$argon2id$`, e uma linha `$2y$` que por acaso tenha
exatamente 60 bytes. Se as linhas de um formato legado começam assim, dê antes a elas um
prefixo próprio na tabela; o `PBKDF2` recusa um prefixo que possa produzir uma linha dessas.

### O que o verificador pronto lê

`PBKDF2` lê um layout só: `<prefix><iterations>:<salt>:<key>`.

| Parte | Regra |
|---|---|
| `prefix` | O que marca as linhas da outra stack (`v1:`, `pbkdf2:`). Obrigatório, nunca vazio, nunca o começo de um hash nativo |
| `iterations` | Decimal, sem sinal, sem zero à esquerda, de 1 até o teto |
| `salt` | Base64 padrão com padding, não vazio |
| `key` | Base64 padrão com padding; exatamente a saída do digest — 32 bytes para `sha256`, 64 para `sha512` |

Qualquer outra coisa responde `false`: outro separador (`$`), hex ou Base64 sem padding,
uma chave truncada ou maior, uma linha acima de 1024 bytes. Ele não lê as strings
`pbkdf2_sha256$…` do Django nem as `$pbkdf2-sha256$…` do passlib. Para essas — ou para um
digest com salt — escreva um verificador.

### Escreva um verificador

Um verificador é um método só:

```php
use SensitiveParameter;

use Bootgly\API\Security\Password\Verifier;

final class SaltedDigest implements Verifier
{
   public function verify (#[SensitiveParameter] string $password, #[SensitiveParameter] string $hash): bool
   {
      // linhas legadas: sha256$<salt>$<64 caracteres hex>
      $parts = explode('$', $hash);

      if (
         count($parts) !== 3
         || $parts[0] !== 'sha256'
         || strlen($parts[1]) > 64
         || strlen($parts[2]) !== 64
      ) {
         return false;
      }

      return hash_equals($parts[2], hash('sha256', "{$parts[1]}{$password}"));
   }
}

$Password = new Password(Verifiers: [new SaltedDigest]);
```

Ele é uma superfície de segurança, então siga cinco regras:

- **Responda `true` só para o seu formato.** Todo hash que o PHP não lê chega ao
  verificador — inclusive um hash `$2a$…` ou `$6$…` que uma senha errada não abriu.
- **Limite o trabalho.** Imponha teto de iterações e de tamanhos antes de calcular
  qualquer coisa.
- **Compare com `hash_equals()`**, nunca com `===`.
- **Responda `false` para uma linha malformada; não lance exceção.** Um verificador que
  lança faz o login falhar — nunca conta como senha correta. O throwable é reportado por
  `Throwables::notify()` e nenhum outro verificador é consultado para aquele hash. Um
  servidor loga o que é reportado, então uma queda de algo que o verificador chama
  aparece ali; um processo seu (um comando, um job) só vê isso se registrar um reporter.
- **Marque a senha e o hash com `#[SensitiveParameter]`**, como acima, para nenhum dos
  dois aparecer no trace de um throwable reportado.

O upgrade grava o hash da senha como ela foi digitada naquele login. Um verificador que
aceita mais de uma grafia de uma senha, portanto, move a conta para a grafia usada —
aceite exatamente uma.

Até o primeiro login bem-sucedido, uma conta importada verifica no custo do formato
legado, não no custo do argon2id — veja a nota de enumeração no
[guia de autenticação](/guide/authentication/overview/).

## Testes

As specs de criptografia vivem na suite `API/Security`:

```bash
AI_AGENT=1 bootgly test 22        # suite API/Security completa (JWT, Authorization, crypto)
AI_AGENT=1 bootgly test 22 12     # roundtrip do Encrypter
AI_AGENT=1 bootgly test 22 13     # rejeição de adulteração do Encrypter
AI_AGENT=1 bootgly test 22 14     # vínculo de AAD do Encrypter
AI_AGENT=1 bootgly test 22 15     # guards de Key, keyring e rotação
AI_AGENT=1 bootgly test 22 16     # hashing de Password
AI_AGENT=1 bootgly test 22 17     # política de rehash e migração do Password
AI_AGENT=1 bootgly test 22 53     # hashes crypt-family de outras stacks ($2a$, $2b$, $6$)
AI_AGENT=1 bootgly test 22 54     # quando um verificador é consultado, e quando nunca é
AI_AGENT=1 bootgly test 22 55     # hash legado: verifica, um rehash, conforme depois
AI_AGENT=1 bootgly test 22 56     # verificador PBKDF2: formato, teto, tamanho da chave
AI_AGENT=1 bootgly test 22 57     # um verificador que lança
AI_AGENT=1 bootgly test 22 58     # conta importada: login e upgrade gravado
AI_AGENT=1 bootgly test 22 59     # superfície aditiva, parâmetros sensíveis, comparação em tempo constante
```

## Reference

### Encrypter

```php
public function __construct (#[\SensitiveParameter] string|Key|Keyring $key)
```

Cria um encrypter. Aceita material raw de chave com 32 bytes, uma `Key` única ou um
`Keyring` completo. Lança `InvalidArgumentException` quando o material raw é inválido e
`RuntimeException` quando a criptografia simétrica do OpenSSL não está disponível.

```php
public function encrypt (#[\SensitiveParameter] string $plaintext, string $AAD = ''): string
```

Criptografa um payload com a chave primária do keyring em um envelope
`v1.<kid>.<blob>`. O prefixo do envelope e o AAD do chamador são autenticados juntos.
Falhas ambientais lançam: `Random\RandomException` quando a fonte de aleatoriedade
falha, `RuntimeException` quando a criptografia do OpenSSL falha.

```php
public function decrypt (string $ciphertext, string $AAD = ''): null|string
```

Descriptografa um envelope. Retorna o plaintext, ou `null` em qualquer falha — envelope
malformado, key id desconhecido, dados adulterados ou AAD divergente. Nunca lança.
Envelopes são canônicos: encodings textuais alternativos dos mesmos bytes selados
(padding, base64 padrão, trailing bits sobrando) são rejeitados, então a string do
envelope pode ser usada com segurança como chave de cache/revogação.

```php
public private(set) Keyring $Keyring;
```

A coleção de chaves do encrypter — legível publicamente para rotação
(`$Encrypter->Keyring->rotate(…)`).

### Encrypter\Key

```php
public function __construct (#[\SensitiveParameter] string $material, null|string $id = null)
```

Encapsula material raw de chave. O material deve ter exatamente 32 bytes; o id opcional
deve seguir `[A-Za-z0-9_-]` com no máximo 64 caracteres (ele viaja como metadado público
do envelope). Lança `InvalidArgumentException` caso contrário, e `RuntimeException`
quando o OpenSSL não está disponível. O material é estado privado — é redigido no
`var_dump`, ausente do JSON e a chave recusa tanto `serialize()` quanto `unserialize()`.
Reflection no mesmo processo (`var_export`, `ReflectionProperty`) não pode ser bloqueada
em PHP e está fora dessa fronteira.

```php
public static function generate (null|string $id = null): self
```

Cria uma chave com 32 bytes de material CSPRNG novo. **A chave gerada é efêmera por
design**: não existe API de exportação suportada para o material, então qualquer coisa
criptografada com ela fica indescriptografável quando o processo termina. Para dados
persistidos, provisione o material antes (`base64_encode(random_bytes(32))`) e construa
via `import()`. Lança `Random\RandomException` (fonte de aleatoriedade),
`InvalidArgumentException` (id inválido) ou `RuntimeException` (OpenSSL indisponível).

```php
public static function import (#[\SensitiveParameter] string $encoded, null|string $id = null): self
```

Constrói uma chave a partir de material codificado em base64 (decodificação estrita).
Lança `InvalidArgumentException` em base64 inválido, tamanho decodificado errado ou id
inválido, e `RuntimeException` quando o OpenSSL não está disponível. Uma `Key` não oferece API
suportada para ler o material de volta — quando uma chave precisa ser persistida,
codifique os bytes raw antes (`base64_encode($material)`) e só então construa a chave.

```php
public function seal (#[\SensitiveParameter] string $plaintext, string $AAD): string
```

Primitivo AEAD de baixo nível: sela um payload e retorna os bytes raw
`IV ∥ ciphertext ∥ tag`. Um IV aleatório novo de 12 bytes é gerado internamente a cada
chamada — o chamador não pode escolher nem reutilizar um intencionalmente (o orçamento
de 2^32 por chave acima continua valendo). O `Encrypter` constrói seus envelopes sobre
este método. Falhas ambientais lançam `Random\RandomException` ou `RuntimeException`.

```php
public function open (string $sealed, string $AAD): null|string
```

Primitivo AEAD de baixo nível: abre bytes raw `IV ∥ ciphertext ∥ tag`, sempre
autenticando a tag completa de 16 bytes (tags truncadas são estruturalmente
impossíveis). Retorna `null` em qualquer falha.

### Encrypter\Keyring

```php
public function __construct (Key $Key, Key ...$Keys)
```

Cria um keyring. A primeira chave vira a primária (usada para criptografar); toda chave —
inclusive a primária — é registrada para descriptografia. Lança
`InvalidArgumentException` em id duplicado ou em uma segunda chave sem id.

```php
public function add (Key $Key): self
```

Registra uma chave somente-descriptografia. Lança `InvalidArgumentException` em id
duplicado ou em uma segunda chave sem id.

```php
public function rotate (Key $Key): self
```

Registra a chave e a promove a primária. A primária anterior continua registrada, então
seus envelopes continuam descriptografando. Rotação exige id explícito — chave sem id
lança, e conflitos de id lançam antes da troca da primária.

```php
public function resolve (null|string $id): null|Key
```

Resolve a chave de descriptografia para um key id de envelope: um id passa pelo índice,
`null` mapeia para o único slot sem id, ids desconhecidos retornam `null`.

```php
public private(set) Key $Primary;
```

A chave usada para criptografar novos payloads.

### Password

```php
public function __construct (int $memory = 65536, int $time = 4, int $threads = 1, array $Verifiers = [])
```

Cria um hasher de senhas com parâmetros de custo do argon2id (`memory` em KiB).
`$Verifiers` é a lista de objetos `Password\Verifier` consultados, em ordem, para um hash
armazenado que o PHP não aceitou e não reconhece. Lança `RuntimeException` quando o build
do PHP não tem suporte a Argon2, `InvalidArgumentException` quando um parâmetro fica
abaixo do piso OWASP (19456 KiB, 2 iterações, 1 thread) e `TypeError` quando um elemento
de `$Verifiers` não implementa `Password\Verifier`.

```php
public function hash (#[\SensitiveParameter] string $password): string
```

Faz hash de uma senha com a política atual. A string retornada embute o algoritmo e os
parâmetros de custo.

```php
public function verify (#[\SensitiveParameter] string $password, #[\SensitiveParameter] string $hash): bool
```

Verifica uma senha contra um hash armazenado. Todo formato que o `password_verify()` lê é
tentado nativamente primeiro — hashes criados por outros algoritmos (bcrypt legado, argon2i, os
hashes crypt-family de outras stacks) ainda verificam. Um hash que ele não aceitou e que
não nomeia um algoritmo nativo é entregue aos verificadores configurados, em ordem; um
verificador que lança faz a resposta ser `false` e é reportado por `Throwables::notify()`.
Um hash armazenado vazio nunca verifica.

```php
public function check (string $hash): bool
```

Confere se um hash armazenado está conforme a política atual — `false` significa que o
hash deve ser regenerado.

```php
public function inspect (#[\SensitiveParameter] string $password, #[\SensitiveParameter] string $hash): Verification
```

Verifica uma senha e aplica a política rehash-on-verify em uma chamada. Retorna um
resultado `Password\Verification`.

### Password\Verification

```php
public private(set) bool $valid;
```

Se a senha bateu com o hash armazenado.

```php
public private(set) null|string $hash;
```

Hash novo e conforme a política para persistir. Preenchido apenas quando a senha é válida
e o hash armazenado não está mais conforme a política atual.

### Password\Verifier

```php
public function verify (#[SensitiveParameter] string $password, #[SensitiveParameter] string $hash): bool
```

O contrato de um verificador de formato legado. Chamado apenas para um hash armazenado
não vazio que o `password_verify()` não aceitou e que não nomeia um algoritmo nativo.
Retorna `true` só quando o hash está no formato do próprio verificador e a senha bate.

### Password\Verifiers\PBKDF2

```php
public function __construct (string $prefix, string $digest = 'sha256', int $ceiling = 1_000_000)
```

Cria um verificador para hashes PBKDF2 armazenados como `<prefix><iterations>:<salt>:<key>`.
Lança `InvalidArgumentException` quando o prefixo é vazio ou poderia ser lido pelo PHP
como um hash nativo (`$2y$…`, ou um que carregue o identificador `argon2i$` /
`argon2id$`), o digest não é um algoritmo HMAC do build do PHP
(`hash_hmac_algos()`) ou o teto é menor que 1.

```php
public function verify (#[SensitiveParameter] string $password, #[SensitiveParameter] string $hash): bool
```

Verifica uma senha contra um hash PBKDF2 armazenado, comparando em tempo constante.
Retorna `false` — nunca lança — para um hash de outro formato, um malformado, um acima do
teto de iterações ou um cuja chave não tem exatamente o tamanho do digest.

```php
public private(set) string $prefix;
```

O prefixo de formato que marca um hash armazenado como sendo deste verificador.

```php
public private(set) string $digest;
```

O digest HMAC da derivação.

```php
public private(set) int $ceiling;
```

O teto de iterações — um hash armazenado que peça mais nunca verifica.
