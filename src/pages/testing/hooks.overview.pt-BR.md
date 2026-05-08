# Hooks

Hooks permitem executar código antes ou depois das asserções da API Avançada. Eles centralizam preparação, limpeza e instrumentação sem duplicar lógica dentro de cada `Assertion`.

## Importação

```php
use Bootgly\ACI\Tests\Assertions\Hook;
```

## Hooks disponíveis

| Hook | Momento |
| ---- | ------- |
| `Hook::BeforeAll` | Antes de todas as asserções. |
| `Hook::AfterAll` | Depois de todas as asserções. |
| `Hook::BeforeEach` | Antes de cada asserção. |
| `Hook::AfterEach` | Depois de cada asserção. |

## Exemplo básico

```php
return new Specification(
   description: 'It should compare equal values',
   test: new Assertions(Case: function (): Generator
   {
      yield new Assertion(description: 'Equal integers')
         ->expect(1)
         ->to->be(1)
         ->assert();
   })
      ->input('test')
      ->on(Hook::BeforeEach, function ($Assertion, $arguments): void
      {
         // executar algo antes de cada asserção
      })
);
```

## Datasets com `input()`

Use `->input()` para passar dados para a Closure das asserções.

```php
test: new Assertions(Case: function (): Generator
{
   yield new Assertion(description: 'Test with data')
      ->expect(1)
      ->to->be(1)
      ->assert();
})
   ->input('valor1', 'valor2', 'valor3')
```

A API executa a Closure com os inputs configurados e preserva a ordem dos hooks ao redor das asserções.

## Cenários úteis

- preparar estado antes de cada asserção;
- limpar recursos após cada asserção;
- medir duração por assertion;
- adicionar contexto ao relatório;
- compartilhar datasets simples com `input()`.

## Boas práticas

- Use `BeforeAll` e `AfterAll` para trabalho de suite local ao bloco de `Assertions`.
- Use `BeforeEach` e `AfterEach` para estado que muda por asserção.
- Mantenha hooks pequenos; lógica complexa deve ficar em fixtures ou helpers.
- Evite modificar a expectativa da asserção dentro do hook sem necessidade explícita.
