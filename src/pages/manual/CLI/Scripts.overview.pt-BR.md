# Scripts

Scripts são os arquivos executáveis autorizados a inicializar e usar o runtime do Bootgly. Eles têm dois papéis:

- **um portão de segurança** — no boot, o CLI valida que o script em execução está registrado; um script de entrada desconhecido é recusado;
- **um executor de tarefas** — scripts de tarefas reutilizáveis (deploys, relatórios, manutenção) vivem em diretórios `scripts/` e podem ser executados sob demanda.

## Registrando scripts

O registro é o arquivo de bootstrap `scripts/@.php`. O Bootgly carrega o dele (raiz do framework) e, quando você executa a partir de um projeto, o seu (diretório de trabalho). Ele retorna os nomes de arquivos permitidos agrupados por onde vivem:

```php
<?php
// scripts/@.php

return [
   'scripts' => [
      'built-in' => [ # Relativo a scripts/ (diretório raiz do Bootgly)
         'observability-ship.php',
      ],
      'imported' => [ # Relativo ao diretório de trabalho (seu diretório raiz)
         'vendor/bin/phpstan'
      ],
      'user' => [ # Relativo a scripts/ (seu diretório de trabalho)
         'deploy.php',
      ]
   ]
];
```

Os grupos resolvem para caminhos-base diferentes:

| Grupo | Resolvido contra | Uso típico |
|---|---|---|
| `bootstrap` | binário `bootgly` absoluto / global / relativo | o próprio launcher do framework (sempre registrado) |
| `built-in` | o diretório `scripts/` do Bootgly | scripts distribuídos com o framework |
| `imported` | seu diretório de trabalho | binários de terceiros, ex.: `vendor/bin/phpstan` |
| `user` | o diretório `scripts/` do seu projeto | seus próprios scripts de tarefas |

## O portão de validação

Quando o CLI inicializa, ele valida o script que o PHP está executando:

```bash
php scripts/deploy.php
```

Se `deploy.php` está registrado no grupo `user`, o boot prossegue. Se não está, o boot lança:

```text
Invalid script: script `scripts/deploy.php` not registered in bootstrap file!
Please, register it in `scripts/@.php`.
```

Scripts registrados que não são o `bootgly` executam em **modo de script externo**: o framework inicializa (autoloader, Terminal, projects) mas não roteia comandos — seu script conduz o fluxo.

## Executando um script de tarefa a partir do código

O `Scripts::execute()` executa um script de tarefa registrado pelo nome do arquivo, procurando primeiro no `scripts/` do seu projeto e depois no do Bootgly:

```php
use Bootgly\CLI\Scripts;

Scripts::execute('observability-ship.php');
```

Um nome de arquivo desconhecido lança uma exceção (`Script not found`).

## Reference

O gerenciador de scripts vive em `CLI->Scripts` (`Bootgly\CLI\Scripts`):

```php
public function validate (): int
```

Valida o script atualmente em execução (`$_SERVER['SCRIPT_FILENAME']` resolvido contra `$_SERVER['PWD']`) contra o registro. Retorna `1` para um script registrado globalmente (ex.: o launcher `bootgly` — boot completo do CLI com roteamento de comandos), `0` para um script local/externo registrado (o framework inicializa, sem roteamento de comandos), `-1` para um script não registrado (o boot do CLI lança exceção) e `-2` quando o ambiente não expõe um caminho de script.

```php
public static function execute (string $script): void
```

Faz o require do script informado a partir do diretório `scripts/` de trabalho, com fallback para o diretório `scripts/` do Bootgly. Lança uma exceção quando o arquivo não existe em nenhum dos dois.

Após a validação, três propriedades somente leitura ficam disponíveis: `path` (o diretório de trabalho), `filename` (o nome de arquivo normalizado do script) e `validation` (o último código retornado pelo `validate()`).
