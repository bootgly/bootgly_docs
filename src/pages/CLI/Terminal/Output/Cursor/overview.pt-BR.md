# Classe `Cursor`

A classe Cursor é responsável pela manipulação e movimentação do cursor na tela do terminal.

## Instância

Para utilizar a classe Cursor, é necessário obter uma instância através da classe Output. Para isso, basta acessar a propriedade `$Output` da classe Terminal:

```php
use Bootgly\CLI;

$Output = CLI::$Terminal->Output;

$Cursor = $Output->Cursor; // Instância da classe Cursor
```

## Configurações

A classe Cursor não possui configurações próprias além das configurações já realizadas pela classe Output.

## Uso

### Movimentos básicos

```php
up (int $lines, ? int $column = null) : self
```

Move o cursor para cima no número de linhas especificado. Se um valor opcional para coluna for passado, o cursor se posiciona nesta coluna após subir as linhas.

```php
right (int $columns) : self
```

Move o cursor para a direita no número de colunas especificado.

```php
down (int $lines, ? int $column = null) : self
```

Move o cursor para baixo no número de linhas especificado. Se um valor opcional para coluna for passado, o cursor se posiciona nesta coluna após descer as linhas.

```php
left (int $columns) : self
```

Move o cursor para a esquerda no número de colunas especificado.

### Movimentos absolutos

```php
moveTo (? int $line = null, ? int $column = null) : self
```

Move o cursor para um posição absoluta na tela do terminal. Se apenas a linha for informada, o cursor se move apenas nesta linha. Se apenas a coluna for informada, o cursor se move apenas nesta coluna. Se ambas forem informadas, o cursor se move para a coordenada especificada.

### Memorizando posições

```php
save () : self
```

Salva a posição atual do cursor para poder ser recuperada posteriormente através do método `restore()`.

```php
restore () : self
```

Restaura a posição do cursor previamente salva através do método `save()`.

### Relatando posição

```php
report () : self
```

Emite a posição atual do cursor. É possível conhecer a posição atual do cursor através da propriedade `position`.

### Alterando aparência

```php
shape (? string $style = '@user') : self
```

Altera o formato do cursor. Os estilos disponíveis são: "block" (bloco), "underline" (sublinhado) e "bar" (barrinha).

### Alterando a visibilidade

```php
blink (bool $status) : self
```

Ativa ou desativa o movimento intermitente do cursor.

```php
show () : self
```

Torna o cursor visível.

```php
hide () : self
```

Torna o cursor invisível.
