# Sistema de autoload do Bootgly

O Bootgly PHP Framework oferece um sistema de autoload eficiente e flexível. Primeiro, o arquivo que antecede e inclui o `autoload.php` deve definir qual é o diretório de trabalho baseado na mesma pasta onde este arquivo se encontra. Os dois arquivos que incluem o `autoload.php` são: `bootgly` e o `index.php`. Esse diretório de trabalho pode ser diferente do diretório raiz onde a plataforma Bootgly se encontra como veremos na seção a seguir.

O sistema de autoload pode trabalhar com até dois diretórios base diferentes: o diretório raiz e o diretório de trabalho.

## Diretório raiz vs diretório de trabalho

O diretório raiz, definido pela constante `BOOTGLY_ROOT_DIR` é onde a **plataforma Bootgly se encontra**. Já o diretório de trabalho, definido pela constante `BOOTGLY_WORKING_DIR` é **onde você desenvolve seus projetos** com o Bootgly e em geral terá um caminho diferente do diretório raiz do Bootgly.

Se você está utilizando um starter kit para começar a desenvolver seus projetos e você utilizou o `Composer` para gerenciar as suas dependências, o diretório raiz do Bootgly terá o caminho relativo `@imports/bootgly/bootgly/`. Já se você utilizou o `git submodules` pra gerenciar as dependências do Bootgly e quer deixar o `Composer` pra depois, o diretório raiz do Bootgly terá o caminho relativo `Bootgly/Bootgly`.

Você ainda tem a opção de somente utilizar a plataforma base do Bootgly e aí terá que utilizar as interfaces CLI e WPI para desenvolver seus apps e APIs e nesse caso os diretórios raiz e de trabalho do Bootgly serão o mesmo, já que os arquivos que incluem o `autoload.php` estarão na mesma pasta que o arquivo `autoload.php`!

Pra ficar menos teórico, aqui está o código fonte com a lógica do autoload de classes `spl_autoload_register` do Bootgly:

```php
spl_autoload_register (function (string $class) {
   $paths = explode('\\', $class);
   $file = implode('/', $paths) . '.php';

   $included = @include(BOOTGLY_WORKING_DIR . $file);

   if ($included === false && BOOTGLY_ROOT_DIR !== BOOTGLY_WORKING_DIR) {
      @include(BOOTGLY_ROOT_DIR . $file);
   }
});
```

## Substituição e Extensão de Componentes

Uma característica poderosa do sistema de autoload do Bootgly é permitir que os desenvolvedores facilmente substituam ou estendam componentes do core do framework. Isso é possível porque, ao carregar as classes, o sistema de autoload primeiro verifica se o arquivo existe no diretório de trabalho e se uma classe com o mesmo namespace for encontrada no diretório de trabalho, ela será carregada em vez da classe do core que está na sua pasta raiz.

Essa funcionalidade é particularmente útil ao desenvolver projetos com o Bootgly Framework, pois os desenvolvedores podem personalizar e ajustar partes específicas do framework sem modificar diretamente os arquivos principais do Bootgly.
