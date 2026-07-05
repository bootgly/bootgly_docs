# Question

The official Question demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Validated answers

The demo asks for a server port (numeric Validator — try an invalid answer to see the Failure Alert and the re-ask) and then a required project name with bounded attempts. Click the terminal to interact; empty answers assume the defaults.

<d-block-terminal engine="bootgly-cli" title="Question — live demo" commands="Validated input:demo 27|Masked input:demo 29|Suggestions:demo 38|Confirm:demo 26" height="380">
`ask()` loops until the Validator accepts: invalid answers render the error message as a Failure Alert and re-ask; empty answers assume the default; exhausted attempts (or EOF) fall back to the default. The masked demo self-echoes `•` per typed character and never reveals the default. The Confirm demo asks yes/no questions — `confirm()` renders ` [Y/n] `/` [y/N] ` and returns a `bool`.
</d-block-terminal>

The component is documented in the [Question overview](/manual/CLI/UI/Components/Question/overview).
