# Showcase de Jogos ao Vivo

O terminal abaixo roda os **jogos reais da plataforma Console** — PHP 8.4 compilado para WebAssembly, inteiramente no seu navegador. Cada jogo forka o par Client/Server do Terminal exatamente como faz nativamente: aqui cada papel roda em seu próprio worker PHP WASM e um `MessageChannel` faz o papel do pipe.

<d-block-terminal
  engine="bootgly-cli"
  title="Console Games — ao vivo"
  commands="Snake:project Snake start|Pong:project Pong start|Invaders:project Invaders start"
  height="560"
>
Escolha um jogo e pressione Run, depois **clique no terminal para focá-lo**. Enter inicia, `q` sai.
**Snake** — as setas dirigem; segurar uma seta acelera (detecção de auto-repeat).
**Pong** — segure ↑/↓ para mover sua raquete; o primeiro a fazer 5 pontos vence a IA.
**Invaders** — ←/→ movem a nave, Space atira; a formação marcha mais rápido conforme encolhe.
</d-block-terminal>

## O que você está vendo

Os três jogos são projetos exportáveis da plataforma Console (`Console/projects/`) construídos sobre o módulo [Games](/manual/Console/Games):

- O **Loop de timestep fixo** dá o ritmo da simulação com o timeout de leitura do canal — a cobra continua andando e a bola continua voando sem nenhuma tecla pressionada, na mesma velocidade de um terminal nativo.
- O **Canvas** renderiza cada frame por diff: apenas as células que mudaram são escritas, então um frame parado custa zero escritas.
- O **Keyboard** converte os auto-repeats do terminal em estado pressed/held — é assim que *segurar* uma seta acelera a cobra e move a raquete do Pong suavemente.
- As **Scenes** (Menu → Play → Over) estruturam o fluxo de cada jogo.
- **Sprites e matemática 2D** movem o Invaders: uma formação de sprite sheet animando em lockstep, uma cadência de marcha com interval mutável de `Timer`, projéteis integrados por `Vector` e colisões por `Zone` (AABB).

Importe-os para o seu próprio kit com o wizard de projetos (*Import projects from Platforms*) e rode nativamente:

```bash
php bootgly project Snake start
php bootgly project Pong start
php bootgly project Invaders start
```
