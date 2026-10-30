# Classe Output

A classe `Output` é responsável por lidar com a saída de dados no Terminal. Através dela, podemos escrever textos coloridos e formatados, posicionar o cursor em determinada linha e coluna, expandir ou contrair linhas no Terminal, dentre outras funcionalidades.

## Instância

Para utilizar a instância corretamente, é necessário acessá-la através da classe `CLI`:

```php
use const Bootgly\CLI;

$Output = CLI->Terminal->Output;
```

## Configurações

Aqui estão as principais propriedades da classe `Output`.

### Propriedade wait

Indica o tempo a ser aguardado após cada escrita com o método `write()`. Por padrão, o valor é `-1` (sem delay). Caso queira adicionar um delay, pode alterá-lo para outro valor em microssegundos.

```php
// Define o tempo de espera entre cada escrita com write() para 1000 microsegundos
$Output->wait = 1000;
```

### Propriedade waiting

Indica o tempo a ser aguardado entre cada caractere escrito no Terminal quando se utiliza o método `reading`. Por padrão, o valor é `30000` (30 milissegundos).

## Uso

Aqui estão os principais métodos da classe `Output`.

### Escrever na saída

```php
write (string $data, int $times = 1) : self
```

Este método escreve no Terminal o texto fornecido no primeiro parâmetro "$data". Se o segundo parâmetro "$times" for definido, ele repetirá a escrita "n" vezes.

### Escrevendo na saída

```php
writing (string $data) : self
```

Este método escreve um caractere de cada vez do texto fornecido no parâmetro "$data", adicionando uma espera definida pela propriedade "$waiting" entre cada caractere escrito. É uma forma de escrita animada na saída do Terminal.

### Acrescentar string na saída

```php
append (string $data) : self
```

Este método é semelhante ao `write`, mas adiciona uma quebra de linha no final da string escrita.

### Limpar saída

```php
clear() : true
```

Este método limpa o texto de toda a saída do Terminal.

### Escapar na saída

```php
escape (string $data) : self
```

Este método precede o dado passado por argumento com o código de escape ANSI `\e[`.

### Metaescapar

```php
metaescape (string $data) : self
```

Este método utiliza o `escapeshellcmd()` no texto fornecido no parâmetro "$data".

### Metaencodar

```php
metaencode (string $data) : self
```

Este método transforma o valor passado em um JSON já codificado, enviando a string JSON para a saída do Terminal.

### Renderizar

```php
render (string $data) : self
```

Este método executa o método estático `render()` da classe `Escaped` e envia para o Terminal o resultado.
Ele é utilizado com os tokens de template para códigos escapados.

Exemplo:

```php
$Output->render('@#green: Esse texto será apresentado pelo Terminal na cor verde.');
```

Os tokens escapados cobrem foregrounds, backgrounds e efeitos — nomes minúsculos escolhem as cores normais, nomes Capitalizados as brilhantes:

| Token | Efeito |
| --- | --- |
| `@#color:` | Foreground — `@#green:`, `@#Cyan:` (brilhante) |
| `@!color:` | Background — `@!black:`, `@!Red:` (brilhante) |
| `@*:` | Negrito |
| `@@:` | Piscar |
| `@;` | Reset |

```php
$Output->render('@!black:@#Cyan: O visual de linha mirada — ciano sobre o preenchimento preto esmaecido. @;');
```

O `render()` é feito para texto que o seu programa escreveu: ele renderiza o markup e escreve todo outro byte como está, caracteres de controle incluídos — não é um sanitizador. Texto de fora — a resposta de um peer, um nome de arquivo, a mensagem de um remoto — passa antes por `Escaped::scrub(Controls::escape(mb_scrub($text, 'UTF-8')))`: um byte que não é UTF-8 vira `?`, um caractere de controle um escape visível, e um `@` que abriria markup é removido:

```php
use Bootgly\ABI\Code\__String\Controls;
use Bootgly\ABI\Templates\Template\Escaped;

$name = "report\e[2J.txt"; // um nome de arquivo, a resposta de um peer…

$shown = Escaped::scrub(Controls::escape(mb_scrub($name, 'UTF-8')));
$Output->render("@#green:Saved:@; {$shown}@.;");
// Saved: report\u001b[2J.txt
```

O `pad()` segue o mesmo contrato. O `write()` é o caminho raw: não renderiza markup e não escapa nada. [Registre texto que você não escreveu](/guide/logging/overview/#registre-texto-que-você-não-escreveu) detalha as duas chamadas.

## Veja ao vivo

O demo oficial de Output roda no [showcase ao vivo](/manual/CLI/Terminal/Output/showcase) — código real do framework em PHP 8.4 WebAssembly, no seu navegador, direto desta página.

## Regiões aninhadas

[`Output\Region`](/manual/CLI/Terminal/Output/Region/overview) é um Output que escreve dentro de uma área hospedeira: cada linha carrega um gutter esquerdo pintado e desloca à direita pela largura do gutter. Entregue uma Region a um componente no lugar deste Output e ele renderiza aninhado, sem alteração — o stream de bytes é traduzido em tempo real.
