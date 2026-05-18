# DBAL de banco

`Bootgly\ADI\Database` é o núcleo baixo nível do DBAL. Ele é agnóstico de transporte:
mantém configuração, conexão, pools e operações pendentes, enquanto paradigmas concretos
como `Bootgly\ADI\Databases\SQL` adicionam verbos como `query()`, `table()` e `begin()`.

## Camadas

- `Database` - núcleo compartilhado para config, conexão e pool.
- `Databases` - registry/factory de paradigmas como `sql`.
- `Databases\SQL` - fachada SQL que normaliza SQL cru, builders e `Query` compilada para
  operações SQL.
- `Config` - host, porta, credenciais, timeout, TLS e pool.
- `Connection` - stream não bloqueante e estado de protocolo.
- `Pool` / `Pools` - pools reutilizáveis por driver com filas idle, busy e pending.
- `Operation` / `Result` - trabalho pendente mais linhas, colunas, afetados e views de
  resultado.
- `Driver` / `Drivers` - implementações de protocolo; PostgreSQL é o driver nativo atual.

## Ciclo de uma operação

```php
$Operation = $Database->query('SELECT $1::int AS value', [42]);
$Database->Pool->wait($Operation);

$rows = $Operation->Result?->rows ?? [];
```

`query()` cria uma `Operation` e atribui ao pool. O pool escolhe ou abre uma conexão, conecta
o driver, deixa o driver preparar os bytes de protocolo e avança até a operação resolver com
`Result` ou falhar com `error`.

Em rotas HTTP, prefira
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** e
`$Response->Database` em vez de chamar `Pool->wait()` ou `advance()` manualmente.

## Comportamento do pool

O pool acompanha conexões `idle`, `busy`, `pending` e `created`. Quando todas as conexões
estão ocupadas e `created >= max`, novas operações aguardam em `pending`. Quando uma conexão
é liberada, o pool promove operações pendentes.

Transações fixam uma conexão com `lock` e liberam com `unlock` depois de commit ou rollback.

## Driver PostgreSQL

O driver SQL PostgreSQL implementa Protocol 3.0 com negociação TLS, autenticação
cleartext/MD5/SCRAM, fluxos simple e extended query, cache de prepared statements,
CancelRequest, mensagens de metadata do servidor e conversão de tipos escalares. Precisão de
`numeric` é preservada como string.

## Views de resultado

`Result` expõe dados diretos e views convenientes:

- `rows` - todas as linhas decodificadas.
- `row` - primeira linha ou array vazio.
- `cell` - primeira célula da primeira linha ou `null`.
- `count` - quantidade de linhas.
- `empty` - se nenhuma linha foi retornada.
