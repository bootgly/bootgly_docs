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
   ->to->wait(10000)
   ->assert();
```

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
      $this::$description .= " [{$duration} ms]";

      // implicit ->expect($duration)
      return $this
         ->to->delimit(1000, 20000);
      // implicit ->assert()
   })
   ->assert();
```

## Boas práticas

- Use waiters para limites de performance simples e explícitos.
- Mantenha margens realistas para evitar testes instáveis.
- Prefira a Closure quando precisar validar intervalos ou registrar a duração medida.
- Evite medir chamadas que dependem fortemente de rede, disco ou ambiente externo sem isolamento.
