# Skip e Ignore

`skip` e `ignore` controlam se um caso de teste ou uma asserção deve executar. Use esses recursos para lidar com cenários temporariamente desativados sem remover o teste do código.

## Diferença entre Skip e Ignore

| Recurso | Comportamento |
| ------- | ------------- |
| `skip` | Pula o caso com output visível. |
| `ignore` | Pula o caso silenciosamente, sem output. |
| `Assertion::skip()` | Pula uma asserção específica na API Avançada. |

## Skip em Specification

O parâmetro `skip` em `Specification` pula um caso de teste e mantém a indicação no output.

```php
return new Specification(
   description: 'Test to skip',
   skip: true,
   test: function (): bool
   {
      return true;
   }
);
```

Use `skip` quando o teste deve continuar visível para lembrar que existe trabalho pendente ou dependência temporária.

## Ignore em Specification

O parâmetro `ignore` pula um caso de teste silenciosamente.

```php
return new Specification(
   description: 'Test to ignore',
   ignore: true,
   test: function (): bool
   {
      return true;
   }
);
```

Use `ignore` quando o caso não deve aparecer no output da execução.

## Skip na API Avançada

Na API Avançada, use `->skip()` em uma asserção específica.

```php
yield new Assertion(description: 'Skipped assertion')
   ->skip();
```

Esse formato mantém o controle no nível da asserção, sem desativar toda a `Specification`.

## Boas práticas

- Prefira `skip` para trabalho temporariamente bloqueado e visível.
- Prefira `ignore` para casos que devem ficar fora do output.
- Evite manter testes pulados por muito tempo sem motivo documentado.
- Use `Assertion::skip()` quando apenas uma verificação dentro da API Avançada deve ser pulada.
