# Textbox

The five official Textbox demos run live below — real framework code on PHP 8.4 WebAssembly, in your browser, **fully interactive**. Click a terminal to give it your keyboard, and use the source button to read the exact PHP file being executed.

## Validated answers

A server port with a numeric Validator (try an invalid answer to see the Failure Alert and the re-ask), then a required project name with bounded attempts — empty answers assume the defaults.

<d-block-terminal engine="bootgly-cli" title="Textbox — validated input" command="demo 27" height="380">
`ask()` loops until the Validator accepts: invalid answers render the error message as a Failure Alert and ask again; empty answers assume the default; exhausted attempts (or EOF) fall back to it. The `attempt` metadata counts the rounds consumed.
</d-block-terminal>

## Masked (secret) input

A password that never reaches the screen, then an API token whose default stays hidden behind the mask:

<d-block-terminal engine="bootgly-cli" title="Textbox — masked input" command="demo 29" height="380">
`mask` self-echoes one character per keystroke (`•` and `*` here) while the kernel echo stays off, so the value is never painted. A masked default renders as the mask repeated three times — whatever its real length — and an empty answer still assumes the real value.
</d-block-terminal>

## Autocompleting with options

A country picked from twenty options in `strict` mode, then an editor where the options are mere suggestions:

<d-block-terminal engine="bootgly-cli" title="Textbox — options" command="demo 38" height="380">
Typing filters the list, `↑`/`↓` aim, `Tab` completes to the aimed label, `Esc` closes the list keeping the typed text and Enter submits. `strict = true` accepts only a listed option; with it off, free text wins and the options only assist.
</d-block-terminal>

## Confirming (yes/no)

Two confirmations with opposite defaults — the suffix reflects which one Enter assumes:

<d-block-terminal engine="bootgly-cli" title="Textbox — confirm" command="demo 26" height="300">
`confirm()` renders ` [Y/n] ` or ` [y/N] ` and returns a `bool`. `y`/`yes`/`n`/`no` are accepted case-insensitively; empty answers and EOF assume the default.
</d-block-terminal>

## Searching with a dynamic source

A component search over static options (string keys — the answer is the key, not the label), then an extension search backed by a Closure with a simulated slow lookup:

<d-block-terminal engine="bootgly-cli" title="Textbox — search" command="demo 53" height="420">
Static options filter here — case-insensitively, matching anywhere in the label. A `source` is re-queried with the current text on every edit and filters by itself, so its results are listed exactly as returned. `viewport` caps the visible rows and the clipped edges announce themselves with `↑ N more` / `↓ N more`.
</d-block-terminal>

The component is documented in the [Textbox overview](/manual/CLI/UI/Components/Textbox/overview).
