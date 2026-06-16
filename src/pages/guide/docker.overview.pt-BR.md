# Docker

Rode, teste, faça benchmark e publique o Bootgly sem instalar PHP localmente. Uma única
imagem multi-stage oferece dois alvos:

- **`slim`** — PHP 8.4 com as extensões necessárias, opcache e JIT, mais o código do
  framework. Use para rodar servidores, fazer deploy e executar seus próprios projetos.
- **`full`** — tudo do `slim` mais o framework de testes, os casos de benchmark interno e
  algumas ferramentas de linha de comando. Use para testar e fazer benchmark do Bootgly.

Os arquivos do Docker ficam no diretório `bootgly_docker/` (irmão de `bootgly/`). A imagem
permanece livre de dependências: nenhum pacote de terceiros em runtime, nenhum banco de
dados, nenhum framework de benchmark externo.

## Construir a imagem

O contexto de build é o diretório **pai**, para que o alvo `full` alcance o irmão
`bootgly_benchmarks/`. Rode estes comandos de dentro de `bootgly_docker/`:

```bash
# slim — apenas runtime
docker build -f Dockerfile --target slim -t bootgly:slim ..

# full — adiciona teste + benchmark
docker build -f Dockerfile --target full -t bootgly:full ..
```

A CLI `bootgly` é o entrypoint da imagem, então qualquer argumento que você passar vai
direto para ela:

```bash
docker run --rm bootgly:slim help
docker run --rm bootgly:slim demo
docker run --rm -it --entrypoint bash bootgly:full   # abrir um shell
```

## Rodar um servidor

Passe `-f` para rodar um servidor em **primeiro plano** (headless) — isso é necessário em
containers. Sem ele os servidores demo viram daemon (fazem fork e se desanexam) e o container
encerra imediatamente. Em primeiro plano o servidor envia logs para o stdout e para de forma
limpa com `SIGTERM` (`docker stop`). (Use `-i` apenas para um REPL interativo com TTY, ex.:
`docker run -it`.)

```bash
docker run --rm -p 8082:8082 bootgly:slim project Demo-HTTP_Server_CLI start -f
```

Depois, em outro terminal:

```bash
curl http://localhost:8082
```

Todo servidor demo lê a variável de ambiente `PORT` (com fallback para o padrão) e escuta em
`0.0.0.0`:

| Servidor | Projeto | Porta padrão |
|----------|---------|--------------|
| HTTP  | `Demo-HTTP_Server_CLI`  | 8082 |
| HTTPS | `Demo-HTTPS_Server_CLI` | 443  |
| TCP   | `Demo-TCP_Server_CLI`   | 8080 |
| UDP   | `Demo-UDP_Server_CLI`   | 9999 |

Troque a porta sem reconstruir a imagem:

```bash
docker run --rm -e PORT=9090 -p 9090:9090 bootgly:slim project Demo-HTTP_Server_CLI start -f
```

## Usar o Bootgly no seu próprio projeto

### Bind-mount (mais rápido)

Monte seu projeto em `/bootgly/projects/<Nome>` e inicie — sem reconstruir:

```bash
docker run --rm -p 8082:8082 \
  -v "$PWD/MyApp:/bootgly/projects/MyApp" \
  bootgly:slim project MyApp start -f
```

Um projeto é localizado pelo seu diretório dentro de `projects/`, então nenhum registro é
necessário para dar `start` nele.

### Imagem base (para apps reais)

```dockerfile
FROM bootgly:slim
COPY . /bootgly/projects/MyApp
EXPOSE 8082
CMD ["project", "MyApp", "start", "-f"]
```

```bash
docker build -t myapp .
docker run --rm -p 8082:8082 myapp
```

## Testar

Rode uma suíte (ou um único teste) por índice:

```bash
docker run --rm bootgly:full test 16          # uma suíte
docker run --rm bootgly:full test 16 1         # um teste de uma suíte
docker run --rm -e AI_AGENT=1 bootgly:full test 16   # saída legível por máquina
```

Algumas suítes verificam caminhos específicos do host (como `/etc/php/8.3/`) ou assumem um
usuário não-root (como `/sbin` não ser gravável). Essas premissas não valem dentro de um
container limpo e, como o runner de testes é fail-fast, o `docker run --rm bootgly:full test`
completo para na primeira suíte assim. Rode as suítes individualmente por índice para
contornar isso — é uma característica desses testes, não da imagem.

## Benchmark

O benchmark interno compara o Bootgly com ele mesmo usando o runner TCP_Client embutido —
sem banco de dados, sem frameworks externos:

```bash
docker run --rm bootgly:full \
  test benchmark HTTP_Server_CLI --opponents=bootgly --runner=tcp_client
```

Outros casos incluem `TCP_Server_CLI`, `UDP_Server_CLI`, `Template_Engine` e `Cache`.

Benchmark entre frameworks e TechEmpower (PostgreSQL + Swoole) não faz parte desta imagem de
propósito; rode isso direto a partir do repositório `bootgly_benchmarks`.

## Docker Compose

Um arquivo Compose em `bootgly_docker/` conduz os três casos de uso por profiles. A partir
desse diretório:

```bash
docker compose --profile serve up        # servidor HTTP demo em :8082
docker compose --profile test  up        # roda uma suíte de testes
docker compose --profile bench up        # roda o benchmark interno
```

O estado e os PIDs do servidor persistem em um volume nomeado `workdata`.

## Referência

### Layout da imagem

```text
/bootgly/                 código do framework · WORKDIR · symlink em /usr/local/bin/bootgly
/bootgly_benchmarks/      casos de benchmark (apenas no alvo full)
/usr/local/etc/php/conf.d/zz-bootgly.ini   tuning de opcache + JIT
```

### Portas expostas

`8082` HTTP, `443` HTTPS, `8080` TCP, `8083`/`8084` benchmark, `9999/udp` UDP.

### Variáveis de ambiente

```text
PORT        Sobrescreve a porta de escuta de um servidor
AI_AGENT    Defina como 1 para saída de testes legível por máquina
```

### Argumentos de build

```text
PHP_IMAGE         Imagem base (padrão: php:8.4-cli-bookworm)
BOOTGLY_VERSION   Label de versão OCI da imagem (padrão: 0.17.1-beta)
```

### Extensões PHP

Incluídas na imagem: `pcntl`, `sockets`, `shmop`, `opcache` e `mbstring`, mais `openssl`,
`posix` e `readline` da imagem base. opcache e JIT tracing ficam habilitados por padrão.

### Notas

```text
Usuário    Os containers rodam como root por padrão para que o framework possa
           escutar em portas baixas (ex.: 443) e gerenciar workers/PIDs. Passe
           --user para abrir mão de privilégios (use uma porta >= 1024).
Coverage   Desabilite o opcache para medições de coverage precisas:
           docker run --rm bootgly:full php -d opcache.enable_cli=0 bootgly test --coverage
```
