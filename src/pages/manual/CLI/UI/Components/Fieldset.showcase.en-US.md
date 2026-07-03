# Fieldset

The official Fieldset demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Framing content — and other components

Three framing variations (content wider than the title, title wider than the content, and no title at all), followed by composition: a whole `Menu` rendered **inside** a Fieldset by switching the Menu to `RETURN_OUTPUT` mode and using its output as the Fieldset content.

<d-block-terminal engine="bootgly-cli" title="Fieldset — live demo" command="demo 22" height="420">
`Fieldset` draws a box around `$Fieldset->content`, embedding `$Fieldset->title` in the top border. Any string works as content — including the rendered output of another component.
</d-block-terminal>

The component is documented in the [Fieldset overview](/manual/CLI/UI/Components/Fieldset/overview).
