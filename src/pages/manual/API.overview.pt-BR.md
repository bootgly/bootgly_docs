# Aplicação no Bootgly

API — a **Application Programming Interface** — é a camada do Bootgly que guarda as peças da
aplicação que nenhum transporte possui: o projeto que dá boot no seu código e a configuração
dele, o ambiente em que ele roda, as primitivas de segurança com que o seu código assina, faz
hash e confere, e os protocolos de chamada de procedimento remoto. Nada aqui abre um socket ou
desenha uma tela — esse é o trabalho do CLI e do WPI acima dela, que chegam à aplicação por essas
mesmas classes.

## Comece aqui

- **Expor métodos a clientes remotos** — registre closures por nome e responda payloads, batches e
  notificações JSON-RPC 2.0 sobre qualquer transporte:
  **[JSON-RPC](/manual/API/RPC/JSON/overview/)**.
- **Servir ferramentas a clientes de IA** — responda o Model Context Protocol (`initialize`,
  tools, resources, prompts) a partir das suas próprias closures, deixando o transporte e as
  sessões com você: **[Servidor MCP](/manual/API/RPC/MCP/overview/)**.
- **Estruturar um projeto** — o arquivo do projeto, a função de boot e os recursos dele:
  **[Projetos](/manual/Bootgly/essential/projects/overview/)**.
- **Carregar configuração** — configs por escopo, valores locais de `.env`, casts estritos e
  segredos obrigatórios: **[Configuração](/guide/configuration/overview/)**.
- **Criptografar valores e fazer hash de senhas** — AES-256-GCM com rotação de chaves e argon2id:
  **[Criptografia](/guide/cryptography/overview/)**.
- **Autenticar usuários e proteger rotas** — os fluxos de sessão e de token construídos sobre
  essas primitivas: **[Autenticação](/guide/authentication/overview/)** e
  **[Autorização](/guide/authorization/overview/)**.

## Componentes

### RPC

Protocolos de chamada de procedimento remoto, independentes de transporte: um dispatcher recebe o
payload raw e devolve a resposta raw, então os mesmos métodos servem uma rota HTTP, um WebSocket
ou o stdio.

- **[JSON-RPC](/manual/API/RPC/JSON/overview/)** — o dispatcher JSON-RPC 2.0: métodos por nome,
  requisições únicas, batches e notificações, erros planejados com `Fault`, erros internos
  escondidos com um Reporter para os seus logs, e o limite de batch.
- **[Servidor MCP](/manual/API/RPC/MCP/overview/)** — o núcleo de servidor do Model Context
  Protocol sobre o dispatcher: negociação de revisão, tools, resources e prompts, e o que fica
  com o transporte.

## Referência

API (Application Programming Interface) é a camada de aplicação da arquitetura I2P do Bootgly, na
cadeia de mão única `ABI → ACI → ADI → API → CLI → WPI`: ela se apoia em ABI, ACI e ADI, e o CLI
e o WPI se apoiam nela. As entidades da raiz dela, em ordem de dependência (alfabética):

- `Bootgly\API\Component` — a base abstrata de um componente renderizável, com o seu modo de
  saída.
- `Bootgly\API\Endpoints` — os papéis de endpoint (`Server`, `Client`); `Endpoints\Server` guarda
  os `Modes` e o `Status` do servidor.
- `Bootgly\API\Environment` — variáveis de ambiente (carregadas de arquivos, com prefixo e
  sufixo) e as peças de build, container, agente e carga de configuração em `Environment\`.
- `Bootgly\API\Environments` — os ambientes de implantação (`Development`, `Production`,
  `Staging`, `Test`).
- `Bootgly\API\Platform` — o contrato que a raiz de uma plataforma implementa (`Console` sobre o
  CLI, `Web` sobre o WPI), veja **[Plataforma Console](/manual/Console/overview/)**.
- `Bootgly\API\Projects` — o registro de projetos; `Projects\Project` é um projeto.
- `Bootgly\API\RPC` — o marcador dos protocolos RPC: `RPC\JSON` (com `RPC\JSON\Fault`) e
  `RPC\MCP`.
- `Bootgly\API\Security` — as primitivas de segurança independentes de transporte: `JWT`,
  `Password`, `Encrypter`, `Tokens`, `Authorization` e a `Identity` autenticada. Os adaptadores
  HTTP (guards, middlewares) ficam no WPI.
- `Bootgly\API\Workables` — os papéis de workable (`Client`, `Server`); `Workables\Server` guarda
  os contratos de handler e de middleware e o pipeline de middlewares que os servidores executam.
