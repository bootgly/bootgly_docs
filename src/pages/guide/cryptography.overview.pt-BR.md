# Criptografia

O Bootgly traz dois essenciais de criptografia na camada de aplicação em
`Bootgly\API\Security`, ao lado dos componentes existentes de JWT e Authorization:

- `Encrypter` — criptografia simétrica autenticada (AES-256-GCM via OpenSSL) com
  gerenciamento e rotação de chaves.
- `Password` — hashing de senhas com argon2id e política rehash-on-verify.

Ambos são agnósticos de transporte: criptografam valores e fazem hash de senhas para
qualquer armazenamento — colunas de banco, cookies, payloads de fila — sem tocar em
preocupações de HTTP.

## Gere uma chave

Uma chave do `Encrypter` são exatamente 32 bytes de material aleatório. Gere uma e
mantenha-a fora do repositório — uma variável de ambiente é o lugar canônico:

```bash
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
   // válida, mas o hash armazenado é anterior à política atual:
   // persista o hash atualizado de forma transparente
   $Users->update($id, password: $Verification->hash);
}
```

Este também é o caminho de migração de armazenamento legado: a verificação é agnóstica de
formato, então um hash bcrypt `$2y$…` ainda verifica — e `inspect()` o atualiza para
argon2id no próximo login bem-sucedido do usuário. Sem migração em lote, sem resets
forçados.

## Testes

As specs de criptografia vivem na suite `API/Security`:

```bash
AI_AGENT=1 bootgly test 21        # suite API/Security completa (JWT, Authorization, crypto)
AI_AGENT=1 bootgly test 21 12     # roundtrip do Encrypter
AI_AGENT=1 bootgly test 21 13     # rejeição de adulteração do Encrypter
AI_AGENT=1 bootgly test 21 14     # vínculo de AAD do Encrypter
AI_AGENT=1 bootgly test 21 15     # guards de Key, keyring e rotação
AI_AGENT=1 bootgly test 21 16     # hashing de Password
AI_AGENT=1 bootgly test 21 17     # política de rehash e migração do Password
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
public function __construct (int $memory = 65536, int $time = 4, int $threads = 1)
```

Cria um hasher de senhas com parâmetros de custo do argon2id (`memory` em KiB). Lança
`RuntimeException` quando o build do PHP não tem suporte a Argon2 e
`InvalidArgumentException` quando um parâmetro fica abaixo do piso OWASP (19456 KiB, 2
iterações, 1 thread).

```php
public function hash (#[\SensitiveParameter] string $password): string
```

Faz hash de uma senha com a política atual. A string retornada embute o algoritmo e os
parâmetros de custo.

```php
public function verify (#[\SensitiveParameter] string $password, string $hash): bool
```

Verifica uma senha contra um hash armazenado. Agnóstico de formato — hashes criados por
outros algoritmos (por exemplo, bcrypt legado) ainda verificam. Um hash armazenado vazio
nunca verifica.

```php
public function check (string $hash): bool
```

Confere se um hash armazenado está conforme a política atual — `false` significa que o
hash deve ser regenerado.

```php
public function inspect (#[\SensitiveParameter] string $password, string $hash): Verification
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
