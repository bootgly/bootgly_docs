# Modificadores

Modificadores alteram a composição lógica de uma expectation na API Avançada. Eles permitem negar, combinar e ramificar validações usando uma cadeia fluente.

## NOT

Use `->not->` para negar uma expectation.

```php
yield new Assertion(description: 'NOT to be [true]')
   ->expect(true)
   ->not->to->be(false)
   ->assert();
```

A leitura da cadeia permanece próxima da intenção do teste: o valor esperado não deve ser `false`.

## AND

Use `->and->` para combinar múltiplas expectations com lógica AND.

```php
yield new Assertion(description: 'to be [true] AND [true]')
   ->expect(true)
   ->to->be(true)
   ->and
   ->to->be(true)
   ->assert();
```

Todas as expectations encadeadas por `and` precisam passar.

## OR

Use `->or->` para combinar expectations com lógica OR.

```php
yield new Assertion(description: 'to be [false] OR [true]')
   ->expect(true)
   ->to->be(false)
   ->or
   ->to->be(true)
   ->assert();
```

Nesse caso, basta uma das expectations passar.

## Boas práticas

- Use `not` para negar uma intenção simples.
- Use `and` quando todas as condições fazem parte do mesmo contrato.
- Use `or` apenas quando alternativas realmente forem válidas.
- Evite cadeias longas demais; divida em assertions menores quando a leitura ficar difícil.
