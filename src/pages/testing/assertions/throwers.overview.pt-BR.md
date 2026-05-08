# Throwers

Throwers verificam se um callable lança a exceção, erro ou throwable esperado. Eles são usados na API Avançada com o padrão `->to->call()->to->throw()`.

## Uso básico

```php
$callable = function () {
   throw new Exception('Exception');
};

yield new Assertion(description: 'Validating exception')
   ->expect($callable)
   ->to->call()
   ->to->throw(new Exception('Exception'))
   ->assert();
```

## Throwers disponíveis

| Classe | Captura |
| ------ | ------- |
| `ThrowException` | `Exception` |
| `ThrowError` | `Error` |
| `ThrowThrowable` | `Throwable` |

## Intenção da cadeia

A cadeia separa três passos:

1. `expect($callable)` define o callable sob teste.
2. `to->call()` indica que a expectation deve executar o callable.
3. `to->throw(...)` valida o throwable esperado.

## Boas práticas

- Use throwers para testar contratos de erro de forma explícita.
- Passe o throwable mais específico possível.
- Mantenha o callable pequeno para isolar a linha que deve lançar.
- Use a descrição da assertion para indicar o cenário de falha esperado.
