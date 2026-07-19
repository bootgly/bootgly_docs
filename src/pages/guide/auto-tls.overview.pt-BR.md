# Auto-TLS

O HTTP Server do Bootgly pode gerenciar o próprio certificado HTTPS. Passe uma config tipada `AutoTLS` na opção `secure` e o servidor obtém sozinho um certificado do **Let's Encrypt** (ACME v2, RFC 8555) — sem certbot, sem cron, sem pacote de terceiros:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\AutoTLS;

$Server = new HTTP_Server_CLI;
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 8,
   secure: new AutoTLS(
      domains: ['example.com', 'www.example.com'],
      email: 'admin@example.com'
   ),
   user: 'www-data',
   group: 'www-data'
);
```

Essa é toda a configuração. `secure` continua aceitando o array raw de contexto SSL (`local_cert` / `local_pk`) exatamente como antes — `AutoTLS` é a alternativa gerenciada. Todo scaffold de projeto WPI (e os projetos Web inclusos) carrega esse bloco `secure:` comentado no seu `configure()` — defina seu domínio e descomente. O bloco do scaffold vem com `staging: true`: valide o fluxo contra a CA de staging primeiro e depois troque para `false` para o certificado real.

## O que acontece no primeiro boot

1. **O servidor binda imediatamente** com um certificado self-signed temporário — sem esperar a CA, sem janela de downtime.
2. Um processo **certifier** em background registra a conta ACME, faz o pedido e responde o challenge `HTTP-01` nativamente.
3. O certificado emitido é instalado e **trocado a quente (hot swap)** em todos os workers vivos — novos handshakes TLS apresentam o certificado real, sem restart.
4. Um tick de supervisão no master **renova automaticamente** (~30 dias antes de expirar, checado a cada 12h, protegido por lock), fazendo hot swap de novo no sucesso.

Se a CA estiver inacessível, o servidor continua servindo com o certificado atual e tenta de novo com backoff (60s → 5m → 15m → 1h → 6h). Falhas de emissão nunca derrubam o servidor.

**O startup é uma barreira.** O servidor só se anuncia como iniciado depois que *todos* os workers bindaram seu socket, ativaram o certificado e o confirmaram. Um worker que não consegue ativar sua credencial recusa tráfego e sai, e o launcher reporta a falha com exit não-zero — você nunca fica com um servidor meio-iniciado escutando em silêncio com a identidade errada.

## Porta 80

A validação `HTTP-01` sempre chega por HTTP puro na porta 80, então o servidor precisa respondê-la. O Auto-TLS cobre os três cenários de deploy:

- **Só o servidor 443 (padrão)** — o master binda a porta 80 antes de derrubar privilégios e mantém um pequeno processo **helper** nela: tokens ACME são respondidos e todo o resto é redirecionado para HTTPS (`308`), como o Caddy faz.
- **Um servidor Bootgly já na porta 80** — faça opt-in explícito apontando-o para o diretório de tokens compartilhado (a rota nunca é reservada implicitamente, então rotas de usuário existentes ou outro cliente ACME continuam funcionando):

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\ACME_Client\Challenges;

Challenges::configure('/caminho/para/storage/security/tls/challenges/');
```

  Com isso definido, essa instância responde `/.well-known/acme-challenge/` antes de qualquer middleware ou rota — nada que você configure quebra uma validação.
- **Outro servidor (nginx, etc.) na porta 80** — faça proxy de `/.well-known/acme-challenge/` para este host; o Auto-TLS loga um aviso e segue funcionando através do proxy.

### Portas privilegiadas sem root

Prefira conceder ao PHP a capability de bind e rodar o servidor inteiro como um usuário comum — sem root, sem demotion, sem divisão de ownership:

```bash :toolbar="true";
sudo setcap 'cap_net_bind_service=+ep' "$(readlink -f "$(which php)")"
```

Iniciar como root também funciona: passe `user:`/`group:` (obrigatório com Auto-TLS) e o boot privilegiado entrega o credential store inteiro — incluindo os diretórios pais — para essa identidade de runtime antes da demotion. Um startup que não consegue alcançar o store falha nomeando o path e o dono exatos, no terminal que o lançou.

## Renovação e o fallback de reload

A renovação é automática — nada para agendar. O swap vale para **novos** handshakes; conexões estabelecidas mantêm o certificado antigo até reconectarem.

Um swap só conta como aplicado quando **todo worker vivo confirma exatamente o certificado que ativou**. Cada worker copia os bytes validados para um artefato privado, faz um probe nele e reporta de volta; o master mantém a geração pendente até todos convergirem. Se não convergirem, o master tenta de novo e então cai sozinho para um reload gracioso limitado. Você também pode forçar a releitura completa do disco quando quiser:

```bash :toolbar="true";
bootgly project reload   # SIGUSR2 — re-exec gracioso, relê a config secure
```

## Staging e testes locais

O Let's Encrypt limita a taxa de emissão em produção. Use o ambiente de staging enquanto monta tudo:

```php
secure: new AutoTLS(
   domains: ['example.com'],
   email: 'admin@example.com',
   staging: true
)
```

Certificados de staging ficam guardados à parte (`certificates/example.com-staging-{identidade}/`) e nunca satisfazem checagens de produção.

Para testes end-to-end totalmente locais, aponte o Auto-TLS para o [Pebble](https://github.com/letsencrypt/pebble) (a CA de teste do próprio Let's Encrypt):

```bash
docker run --rm --net=host -e PEBBLE_VA_NOSLEEP=1 \
   ghcr.io/letsencrypt/pebble -config test/config/pebble-config.json
```

```php
secure: new AutoTLS(
   domains: ['localhost'],
   email: 'dev@example.com',
   directory: 'https://localhost:14000/dir',   // Pebble
   port: 5002,        // Pebble valida HTTP-01 na 5002 (não privilegiada)
   verify: false      // Pebble usa a própria raiz de teste
)
```

O repositório traz esse cenário exato como suite opt-in: `BOOTGLY_ACME_E2E=1 bootgly test`.

## Armazenamento

Tudo vive em `storage/security/tls/` (sobrescrevível via `path:`), PEM puro protegido por permissões de arquivo — inspecionável com `openssl x509` e portável para outras ferramentas:

```text
storage/security/tls/
├── account/{ca-host}-{service}/    ← chave da conta (0600) + URL registrada —
│                                      uma por SERVIÇO ACME (URL completa do directory)
├── certificates/{domain}-{id128}/  ← um store por identidade de configuração
│   ├── bootstrap.pem               ← self-signed temporário (com o conjunto SAN)
│   ├── current.json                ← manifest atômico (o ponto de commit)
│   └── {issued-ts}/                ← versionado: fullchain.pem, certificate.pem,
│                                      chain.pem, key.pem (0600)
├── challenges/                     ← tokens HTTP-01 (compartilhados entre processos)
└── renew.lock                      ← lock de renovação entre processos
```

O sufixo `{id128}` (128 bits do digest de identidade) e o manifest carregam uma **identidade de configuração** (o conjunto SAN ordenado e deduplicado mais a URL do directory ACME): adicionar um domínio ou trocar de CA nunca reusa silenciosamente um certificado emitido para outra configuração — e o label legível do domínio é truncado, então até um hostname máximo de 253 bytes nunca estoura os limites de nome do filesystem. Installs são validados antes do commit do manifest — correspondência certificado/chave, cada bloco da chain parseado, janela de validade e cobertura SAN; o snapshot de credencial é tudo-ou-nada (um certificado cuja chave sumiu nunca é servido).

Wildcards não são suportados — exigem o challenge `DNS-01` (adiado; só `HTTP-01` por enquanto). Use SANs explícitos: `domains: ['example.com', 'www.example.com', 'api.example.com']`.

## Referência

### AutoTLS

```php
public function __construct (
   array $domains,
   string $email,
   bool $staging = false,
   null|string $directory = null,
   null|string $path = null,
   null|string $challenges = null,
   int $threshold = 30,
   int $bits = 2048,
   bool $agreement = true,
   int $port = 80,
   bool $verify = true,
   array $options = []
)
```

Valida toda a configuração na construção (`InvalidArgumentException` em qualquer valor inválido — configuração errada nunca chega à CA). `domains` é o conjunto SAN; `domains[0]` é o Common Name e nomeia o diretório do certificado. `directory` sobrescreve `staging`. `threshold` é o gatilho de renovação em dias restantes (1–89). `bits` dimensiona as chaves RSA de conta e certificado (≥ 2048). `agreement` é o aceite dos Termos de Serviço da RFC 8555 — configurar o Auto-TLS já o implica (modelo Caddy), então o default é `true` e passar `false` lança exceção. `port` é a porta de validação HTTP-01 em que a CA conecta. `verify` controla a verificação TLS do peer em direção ao directory ACME. `challenges` sobrescreve o diretório de tokens HTTP-01 — instâncias que compartilham uma porta de validação devem apontar para o mesmo spool. `options` são opções extras de contexto SSL mescladas no contexto do socket do servidor (opções explícitas vencem os valores gerenciados) — exceto as chaves seletoras de credencial `local_cert`, `local_pk`, `passphrase` e `SNI_server_certs`, que são gerenciadas pelo Auto-TLS e rejeitadas na construção: nenhuma opção aceita pode servir um certificado fora da geração validada e confirmada.

```php
public function check (): bool
```

Se existe um certificado instalado (não-bootstrap) e ainda não expirado.

```php
public function forge (): void
```

Garante que exista um certificado servível: reusa o atual enquanto não expirado, senão gera o bootstrap self-signed temporário. O servidor chama durante o `configure()`.

```php
public function renew (): bool
```

Emissão protegida por threshold, lock e backoff: registra a conta quando necessário, faz o pedido, instala. Retorna `true` quando um novo certificado foi instalado (o sinal de hot swap), `false` quando nada estava pendente ou outro processo segura o lock de renovação. Falhas registram o backoff e são relançadas como `Exceptioning` (o marker de exceções do ACME).

```php
public private(set) array $context
```

As opções de contexto SSL para o socket do servidor — o certificado instalado quando commitado, senão o bootstrap. Nunca cacheado: o manifest muda sob um servidor vivo.

### HTTP Server

```php
public function configure (string $host, int $port, int $workers, null|array|AutoTLS $secure = null, ...): self
```

`secure` aceita o array raw de contexto SSL (como antes) ou uma instância `AutoTLS` — o servidor então assume o ciclo de vida do certificado (bootstrap, emissão em background, hot swap, renovação). Nas duas formas o socket do servidor nunca pede certificado de **cliente**: `verify_peer` e `verify_peer_name` ficam `false` por padrão no lado servidor (o `true` herdado do PHP faria os navegadores pedirem mTLS). Habilite mTLS deliberadamente via `options: ['verify_peer' => true, 'cafile' => ...]` — opções explícitas sempre vencem.

```php
public function swap (array $secure): bool
```

Hot swap de baixo nível (herdado do `TCP_Server_CLI`): substitui as opções de contexto SSL do listening socket vivo. Handshakes seguintes apresentam as novas credenciais; conexões estabelecidas mantêm as antigas. O Auto-TLS aciona automaticamente — uso direto só é necessário para tooling de certificado customizado.
