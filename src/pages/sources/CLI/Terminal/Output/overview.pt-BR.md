# Classe Output

A classe `Output` é responsável por gerenciar a saída de dados no terminal.

## Instância

Para usar a classe `Output`, primeiro é necessário acessar a classe `CLI` e, em seguida, acessar a classe `Terminal` através de sua propriedade estática `$Terminal`. Com isso, pode-se acessar a classe `Output` através de sua propriedade `$Output`:

```php
use Bootgly\CLI;

$Output = CLI::$Terminal->Output;
```

## Configuração

### stream

Propriedade que indica o stream de saída. Por padrão, é configurado para `STDOUT`.

### wait

Tempo de espera em microssegundos para o método `write()`.

### waiting

Tempo de espera em microssegundos para o método `writing()`.

### written

Quantidade de caracteres escritos.

## Uso

### Escrevendo dados

```php
writing(string $data) : Output
```

Escreve uma string no terminal.

### Adicionando quebra de linha

```php
append(string $data) : Output
```

Adiciona uma string e uma quebra de linha no final.

### Limpar o terminal

```php
clear() : bool
```

Limpa todo o conteúdo do terminal.

### Expandindo o terminal

```php
expand(int $lines) : Output
```

Expande o terminal em determinado número de linhas.

### Escapando caracteres

```php
escape(string $data) : Output
```

Adiciona um código ANSI a uma string.

### Escapando caracteres de meta caracteres

```php
metaescape(string $data) : Output
```

Escapa caracteres em uma string para serem interpretados corretamente como comandos no shell.

### Codificação para exibição de caracteres especiais

```php
render(string $data) : Output
```

Renderiza uma string para permitir a exibição correta de caracteres especiais.
