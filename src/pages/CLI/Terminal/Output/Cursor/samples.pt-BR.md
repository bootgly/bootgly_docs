# Classe `Cursor`

Segue abaixo exemplos de uso da classe Cursor do Terminal Output.

## Exemplos

### Movimentos básicos

Exemplo com `up()`:

```php
$Cursor->up(lines: 2);      // Move o cursor duas linhas para cima
$Cursor->up(lines: 1, 10);  // Move o cursor uma linha para cima e para a coluna 10
```

Exemplo com `right()`:

```php
$Cursor->right(columns: 5);   // Move o cursor cinco colunas para a direita
```

Exemplo com `down()`:

```php
$Cursor->down(lines: 2);      // Move o cursor duas linhas para baixo
$Cursor->down(lines: 1, 10);  // Move o cursor uma linha para baixo e para a coluna 10
```

Exemplo com `left()`:

```php
$Cursor->left(columns: 5);   // Move o cursor cinco colunas para a esquerda
```

### Movimentos absolutos

Exemplos:

```php
$Cursor->moveTo(line: 5);             // Move o cursor para a linha 5
$Cursor->moveTo(column: 10);          // Move o cursor para a coluna 10
$Cursor->moveTo(line: 5, column: 10); // Move o cursor para a coordenada (5,10)
```

### Memorizando posições

Exemplos:

```php
$Cursor->save();   // Salva a posição atual do cursor
```

```php
$Cursor->restore();   // Restaura a última posição salva do cursor
```

### Relatando posição

Exemplo:

```php
$Cursor->report(); // Emite a posição atual do cursor

$Cursor->position; // Returna a posição atual do cursor. [0 => row, 1 => column]
```

### Alterando aparência

Exemplos:

```php
$Cursor->shape('block');     // Muda o formato do cursor para bloquinho
$Cursor->shape('underline'); // Muda o formato do cursor para sublinhado
$Cursor->shape('bar');       // Muda o formato do cursor para barrinha
$Cursor->shape();            // Muda o formato do cursor para o padrão
```

### Alterando a visibilidade

Exemplos:

```php
$Cursor->blink(true);  // Ativa o movimento intermitente do cursor
$Cursor->blink(false); // Desativa o movimento intermitente do cursor
```

```php
$Cursor->show();  // Torna o cursor visível
```

```php
$Cursor->hide();  // Torna o cursor invisível
```
