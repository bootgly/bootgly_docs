# Application in Bootgly

API — the **Application Programming Interface** — is the layer of Bootgly that holds the
application pieces no transport owns: the project that boots your code and its configuration,
the environment it runs in, the security primitives your code signs, hashes and checks with,
and the remote procedure call protocols. Nothing here opens a socket or draws a screen — that is
the work of the CLI and WPI above it, which reach the application through these same classes.

## Start here

- **Expose methods to remote clients** — register closures by name and answer JSON-RPC 2.0
  payloads, batches and notifications over any transport:
  **[JSON-RPC](/manual/API/RPC/JSON/overview/)**.
- **Serve tools to AI clients** — answer the Model Context Protocol (`initialize`, tools,
  resources, prompts) from your own closures, with the transport and sessions left to you:
  **[MCP server](/manual/API/RPC/MCP/overview/)**.
- **Structure a project** — the project file, its boot function and its resources:
  **[Projects](/manual/Bootgly/essential/projects/overview/)**.
- **Load configuration** — scoped configs, local `.env` values, strict casts and required
  secrets: **[Configuration](/guide/configuration/overview/)**.
- **Encrypt values and hash passwords** — AES-256-GCM with key rotation and argon2id:
  **[Cryptography](/guide/cryptography/overview/)**.
- **Sign in users and protect routes** — the session and token flows built on these primitives:
  **[Authentication](/guide/authentication/overview/)** and
  **[Authorization](/guide/authorization/overview/)**.

## Components

### RPC

Remote procedure call protocols, transport-independent: a dispatcher takes the raw payload and
returns the raw answer, so the same methods serve an HTTP route, a WebSocket or stdio.

- **[JSON-RPC](/manual/API/RPC/JSON/overview/)** — the JSON-RPC 2.0 dispatcher: methods by name,
  single requests, batches and notifications, designed errors with `Fault`, hidden internal
  errors with a Reporter for your logs, and the batch limit.
- **[MCP server](/manual/API/RPC/MCP/overview/)** — the Model Context Protocol server core over
  the dispatcher: revision negotiation, tools, resources and prompts, and what stays with the
  transport.

## Reference

API (Application Programming Interface) is the application layer of Bootgly's I2P architecture,
in the one-way chain `ABI → ACI → ADI → API → CLI → WPI`: it builds on ABI, ACI and ADI, and the
CLI and WPI build on it. Its root entities, in dependency (alphabetical) order:

- `Bootgly\API\Component` — the abstract base of a renderable component, with its output mode.
- `Bootgly\API\Endpoints` — the endpoint roles (`Server`, `Client`); `Endpoints\Server` holds
  the server `Modes` and `Status`.
- `Bootgly\API\Environment` — environment variables (loaded from files, with a prefix and a
  suffix) and the build, container, agent and config-loading pieces under `Environment\`.
- `Bootgly\API\Environments` — the deployment environments (`Development`, `Production`,
  `Staging`, `Test`).
- `Bootgly\API\Platform` — the contract a platform root implements (`Console` over the CLI,
  `Web` over the WPI), see **[Console Platform](/manual/Console/overview/)**.
- `Bootgly\API\Projects` — the projects registry; `Projects\Project` is one project.
- `Bootgly\API\RPC` — the marker of the RPC protocols: `RPC\JSON` (with `RPC\JSON\Fault`) and
  `RPC\MCP`.
- `Bootgly\API\Security` — the transport-independent security primitives: `JWT`, `Password`,
  `Encrypter`, `Tokens`, `Authorization` and the authenticated `Identity`. The HTTP adapters
  (guards, middlewares) live in the WPI.
- `Bootgly\API\Workables` — the workable roles (`Client`, `Server`); `Workables\Server` holds
  the handler and middleware contracts and the middleware pipeline servers run.
