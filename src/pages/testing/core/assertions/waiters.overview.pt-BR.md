# Waiters

Waiters validam tempo de execução e performance de um callable. Eles usam a cadeia `->to->call()->to->wait()` para medir a duração da chamada.

## Uso básico

Verifique se uma função executa dentro de um tempo esperado em microssegundos.

```php
yield new Assertion(description: 'Validating wait time')
   ->expect(function () {
      usleep(10000);
   })
   ->to->call()
   ->to->wait(200000)
   ->assert();
```

O orçamento é aplicado de verdade: quando ele acaba, o callable é morto e a asserção falha.

Duas coisas decidem o número que você escreve. Ele é em **microssegundos**, então `200000` são 200 ms. E ele cobre toda a janela medida, não só o callable — o waiter executa o seu callable em um processo forkado, então a criação e a colheita desse processo estão dentro da medição. Esse overhead é de alguns milissegundos numa máquina de desenvolvimento e pode chegar a algumas dezenas num runner de CI compartilhado, e é por isso que o exemplo acima dá 200 ms de orçamento a um callable de 10 ms, e não 10 ms.

## Closure com Subassertion

Para verificações mais complexas, use uma Closure que recebe a duração medida e retorna sub-asserções.

```php
$callable = function () {
   usleep(1000); // Simula uma tarefa bloqueante
};

yield new Assertion(description: 'Validating wait time (Closure)')
   ->expect($callable)
   ->to->call()
   ->to->wait(function (float $duration): Assertion {
      $this::$description .= " [{$duration} µs]";

      // implicit ->expect($duration)
      return $this
         ->to->delimit(1000, 200000);
      // implicit ->assert()
   })
   ->assert();
```

A forma com Closure não define orçamento nenhum — nada é morto, e o veredito vem inteiramente das sub-asserções que você retorna. O `$duration` chega em microssegundos, a mesma unidade que o `wait(<número>)` recebe.

## Boas práticas

- Use waiters para limites de performance simples e explícitos.
- Mantenha margens realistas para evitar testes instáveis: um orçamento próximo da duração esperada falha só com o overhead do fork.
- Prefira a Closure quando precisar validar intervalos ou registrar a duração medida.
- Evite medir chamadas que dependem fortemente de rede, disco ou ambiente externo sem isolamento.
