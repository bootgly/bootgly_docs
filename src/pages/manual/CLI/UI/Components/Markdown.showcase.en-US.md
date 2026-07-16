# Markdown

The official Markdown demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Markdown rendered in the terminal

A full-featured document renders at once: styled headings, wrapped paragraphs with emphasis and inline code, nested lists and tasks, a syntax-highlighted PHP block, stacked quotes, an aligned table and a rule.

<d-block-terminal
  engine="bootgly-cli"
  title="Markdown — live demo"
  command="demo 54"
  height="520"
>
A markdown document painted with raw SGR styling: headings, lists, tasks, quotes, syntax-highlighted fenced code, an aligned table and links. Use the source button to read the PHP file.
</d-block-terminal>

On non-interactive output (pipes, CI) the same render degrades to plain structured text with zero escape codes.

The component is documented in the [Markdown overview](/manual/CLI/UI/Components/Markdown/overview).
