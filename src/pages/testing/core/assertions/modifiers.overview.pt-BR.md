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

## Combinando NOT com AND / OR

O `not` nega a expectation que vem imediatamente depois dele, e mais nenhuma. Tudo o que for encadeado adiante é julgado por conta própria.

```php
yield new Assertion(description: 'NOT [6] AND [5]')
   ->expect(5)
   ->not->to->be(6)
   ->and
   ->to->be(5)
   ->assert();
```

As duas metades precisam valer aqui: 5 não é 6, e 5 é 5. Troque a segunda por `->to->be(999)` e a cadeia falha, porque só a primeira expectation foi negada.

Para negar também uma expectation posterior, repita o modificador antes dela.

```php
yield new Assertion(description: 'NOT [6] AND NOT [7]')
   ->expect(5)
   ->not->to->be(6)
   ->and
   ->not->to->be(7)
   ->assert();
```

## Boas práticas

- Use `not` para negar uma intenção simples.
- Use `and` quando todas as condições fazem parte do mesmo contrato.
- Use `or` apenas quando alternativas realmente forem válidas.
- Repita o `not` para cada expectation que você pretende negar; um `not` nunca se propaga pela cadeia.
- Evite cadeias longas demais; divida em assertions menores quando a leitura ficar difícil.
