# Tree

The official Tree demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Hierarchical picker with lazy children

The demo dumps the project structure statically first, then opens the interactive picker: aim with `↑`/`↓` (the `=>` marker blinks), fold with `→`/`←`, press `→` on the lazy `📦 vendor` branch to watch its resolver scan in place, hit `Enter` on `projects` to see a programmable action fold it instead of confirming, and confirm any other node with `Enter` — or cancel with `Esc`.

<d-block-terminal
  engine="bootgly-cli"
  title="Tree — live demo"
  command="demo 51"
  height="480"
>
The same tree drives both outputs: a report-safe static render and a raw-input navigation session with viewport windowing. Use the source button to read the PHP file.
</d-block-terminal>

On non-interactive output (pipes, CI) the picker degrades to a single static dump.

The component is documented in the [Tree overview](/manual/CLI/UI/Components/Tree/overview).
