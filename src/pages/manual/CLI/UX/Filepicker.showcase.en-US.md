# Filepicker

The official Filepicker demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Filesystem browser with lazy scans

Browse the bundled `projects/` directory: aim with `↑`/`↓` (the marker blinks), press `Enter` on a directory to drill into it — each directory is scanned only when first opened — and `Enter` on a file to pick it. `Esc` cancels.

<d-block-terminal
  engine="bootgly-cli"
  title="Filepicker — live demo"
  command="demo 52"
  height="480"
>
A Tree preconfigured for the filesystem: lazy DirectoryIterator scans, 📁/📄 icons, directories sorted first. Use the source button to read the PHP file.
</d-block-terminal>

On non-interactive output (pipes, CI) the picker degrades to a typed path line.

The component is documented in the [Filepicker overview](/manual/CLI/UX/Filepicker/overview).
