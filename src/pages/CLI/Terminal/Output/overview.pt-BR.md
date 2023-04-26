# Classe Output

A classe `Output` é responsável por lidar com a saída de dados no terminal. Através dela, podemos escrever textos coloridos e formatados, posicionar o cursor em determinada linha e coluna, expandir ou contrair linhas no terminal, dentre outras funcionalidades.

## Instância

Para utilizar a instância corretamente, é necessário acessá-la através da classe `CLI`:

```php
use Bootgly\CLI;

$Output = CLI::$Terminal->Output;
```

## Configurações

Aqui estão as principais propriedades da classe `Output`.

### wait

Indica o tempo a ser aguardado antes de escrever os linhas no terminal. Por padrão, o valor é `-1` (sem delay). Caso queira adicionar um delay à cada escrita, pode alterá-lo para outro valor em microssegundos.

### waiting

Indica o tempo a ser aguardado entre cada caractere escrito no Terminal quando se utiliza o método `reading`. Por padrão, o valor é `30000` (30 milissegundos).

## Uso

Aqui estão os principais métodos da classe `Output`.

### Escrever na saída

```php
write (string $data, int $times = 1) : self
```

Este método escreve no terminal o texto fornecido no primeiro parâmetro "$data". Se o segundo parâmetro "$times" for definido, ele repetirá a escrita "n" vezes.

### Escrevendo na saída

```php
writing (string $data) : self
```

Este método escreve um caractere de cada vez do texto fornecido no parâmetro "$data", adicionando uma espera definida pela propriedade "$waiting" entre cada caractere escrito. É uma forma de escrita animada na saída do Terminal.

### Acrescentar string na saída

```php
append (string $data) : self
```

Este método é semelhante ao `write`, mas adiciona uma quebra de linha após a escrita.

### Limpar saída

```php
clear() : true
```

Este método limpa o texto de toda a saída do terminal.

### Escapar na saída

```php
escape (string $data) : self
```

Este método precede o dado passado por argumento com o código de escape ANSI.

### Metaescapar

```php
metaescape (string $data) : self
```

Este método utiliza o "escapeshellcmd()" no texto fornecido no parâmetro "$data".

### Metaencodar

```php
metaencode (string $data) : self
```

Este método transforma o valor passado em um JSON já codificado, enviando a string JSON para a saída do terminal.

### Renderizar

```php
render (string $data) : self
```

Este método executa o método estático "render()" da classe `Escaped` e envia para o terminal o resultado.
Ele é utilizado com os tokens de template para códigos escapados.

Exemplo:

```php
$Output->render('@#green: Esse texto será apresentado pelo terminal na cor verde.');
```
