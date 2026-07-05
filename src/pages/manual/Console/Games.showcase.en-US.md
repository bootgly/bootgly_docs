# Live Games Showcase

The terminal below runs the **real Console platform games** — PHP 8.4 compiled to WebAssembly, entirely in your browser. Each game forks the Terminal Client/Server pair exactly like it does natively: here each role runs in its own PHP WASM worker and a `MessageChannel` plays the pipe.

<d-block-terminal
  engine="bootgly-cli"
  title="Console Games — live"
  commands="Snake:project Snake start|Pong:project Pong start"
  height="560"
>
Pick a game and press Run, then **click the terminal to focus it**. Enter starts, `q` quits.
**Snake** — arrows steer; holding an arrow accelerates (auto-repeat detection).
**Pong** — hold ↑/↓ to move your paddle; first to 5 points wins against the AI.
</d-block-terminal>

## What you are seeing

Both games are exportable Console platform projects (`Console/projects/`) built on the [Games](/manual/Console/Games) module:

- The **fixed-timestep Loop** paces the simulation with the channel read timeout — the snake keeps moving and the ball keeps flying with no key pressed, at the same speed as in a native terminal.
- The **Canvas** diff-renders every frame: only the cells that changed are written, so an idle frame costs zero writes.
- The **Keyboard** turns terminal auto-repeats into pressed/held state — that is how *holding* an arrow accelerates the snake and moves the Pong paddle smoothly.
- **Scenes** (Menu → Play → Over) structure each game's flow.

Import them into your own kit with the project wizard (*Import projects from Platforms*) and run them natively:

```bash
php bootgly project Snake start
php bootgly project Pong start
```
