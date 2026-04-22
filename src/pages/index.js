export default {
  '/getting-started': {
    config: {
      icon: 'flag',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Set up Bootgly, choose a starter and run your first CLI or Web project.',
          'pt-BR': 'Instale o Bootgly, escolha um starter e rode seu primeiro projeto CLI ou Web.'
        }
      },
      type: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Getting started'
      },
      'pt-BR': {
        title: 'Começando'
      }
    }
  },

  // manual
  // Bootgly
  '/Bootgly': {
    config: null,
    data: {
      '*': {
        title: 'Bootgly'
      }
    },
    meta: {
      expanding: true
    }
  },
  '/Bootgly/about': {
    config: null,
    data: {
      'en-US': {
        title: 'Bootgly - About'
      },
      'pt-BR': {
        title: 'Bootgly - Sobre'
      }
    }
  },
  '/Bootgly/about/what': {
    config: {
      icon: 'play_arrow',
      status: 'done',
      meta: {
        description: {
          'en-US': 'Understand Bootgly and its I2P architecture for building CLI and Web apps from one foundation.',
          'pt-BR': 'Entenda o Bootgly e sua arquitetura I2P para criar aplicações CLI e Web sobre a mesma base.'
        }
      },
      menu: {
        header: {
          icon: 'contact_support',
          label: '.Bootgly'
        },
        subheader: '.Bootgly.about'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'What is Bootgly?'
      },
      'pt-BR': {
        title: 'O que é Bootgly?'
      }
    },
    meta: {
      'en-US': {
        overview: {
          _sections: {
            count: 2,
            done: 2
          },
          _translations: 2
        }
      },
      'pt-BR': {}
    }
  },
  '/Bootgly/about/why': {
    config: {
      icon: 'question_mark',
      status: 'done',
      meta: {
        description: {
          'en-US': 'See why Bootgly favors shared architecture, low dependencies and performance across CLI and HTTP workloads.',
          'pt-BR': 'Veja por que o Bootgly aposta em arquitetura compartilhada, poucas dependências e desempenho em CLI e HTTP.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Why Bootgly?'
      },
      'pt-BR': {
        title: 'Por quê Bootgly?'
      }
    },
    meta: {
      'en-US': {
        overview: {
          _sections: {
            count: 4,
            done: 4
          },
          _translations: 2
        }
      },
      'pt-BR': {}
    }
  },

  '/Bootgly/basic': {
    config: null,
    data: {
      'en-US': {
        title: 'Bootgly - Basic'
      },
      'pt-BR': {
        title: 'Bootgly - Básico'
      }
    }
  },
  '/Bootgly/basic/architecture': {
    config: {
      icon: 'developer_board',
      status: 'done',
      meta: {
        description: {
          'en-US': 'Explore the I2P layers that connect ABI, ACI, ADI, API, CLI and WPI into one framework.',
          'pt-BR': 'Explore as camadas I2P que conectam ABI, ACI, ADI, API, CLI e WPI em um único framework.'
        }
      },
      menu: {
        subheader: '.Bootgly.basic'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Architecture'
      },
      'pt-BR': {
        title: 'Arquitetura'
      }
    }
  },
  '/Bootgly/basic/directory_structure': {
    config: {
      icon: 'account_tree',
      status: 'done',
      meta: {
        description: {
          'en-US': 'Learn how Bootgly organizes framework code, project resources and boot files for predictable growth.',
          'pt-BR': 'Aprenda como o Bootgly organiza código do framework, recursos do projeto e boot files para crescer com previsibilidade.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Directory Structure'
      },
      'pt-BR': {
        title: 'Estrutura de diretórios'
      }
    }
  },

  '/Bootgly/concepts': {
    config: null,
    data: {
      'en-US': {
        title: 'Bootgly - Concepts'
      },
      'pt-BR': {
        title: 'Bootgly - Conceitos'
      }
    }
  },
  '/Bootgly/concepts/autoload-system': {
    config: {
      icon: 'cached',
      status: 'done',
      meta: {
        description: {
          'en-US': 'See how Bootgly resolves classes across framework and project directories to enable extension and substitution.',
          'pt-BR': 'Veja como o Bootgly resolve classes entre framework e projeto para permitir extensão e substituição.'
        }
      },
      menu: {
        subheader: '.Bootgly.concepts'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Autoload system'
      }
    }
  },
  '/Bootgly/concepts/bootstrap-files': {
    config: {
      icon: 'post_add',
      status: 'done',
      meta: {
        description: {
          'en-US': 'Learn which boot files start CLI and Web projects and how Bootgly initializes each runtime.',
          'pt-BR': 'Aprenda quais boot files iniciam projetos CLI e Web e como o Bootgly prepara cada runtime.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Bootstrap files'
      }
    }
  },
  '/Bootgly/concepts/github-repositories': {
    config: {
      icon: 'archive',
      status: 'done',
      meta: {
        description: {
          'en-US': 'Understand how Bootgly splits framework, templates and satellite repositories across its ecosystem.',
          'pt-BR': 'Entenda como o Bootgly distribui framework, templates e repositórios satélite no seu ecossistema.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Git repositories'
      }
    }
  },

  '/Bootgly/essential': {
    config: null,
    data: {
      'en-US': {
        title: 'Bootgly - Essential'
      },
      'pt-BR': {
        title: 'Bootgly - Essencial'
      }
    }
  },
  '/Bootgly/essential/debugging': {
    config: {
      icon: 'bug_report',
      status: 'empty',
      meta: {
        description: {
          'en-US': 'Inspect errors, backtraces and runtime state with Bootgly debugging and diagnostics foundations.',
          'pt-BR': 'Inspecione erros, backtraces e estado de runtime com a base de debugging e diagnóstico do Bootgly.'
        }
      },
      menu: {
        subheader: '.Bootgly.essential'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Debugging'
      },
      'pt-BR': {
        title: 'Debugando'
      }
    }
  },
  '/Bootgly/essential/projects': {
    config: {
      icon: 'create_new_folder',
      status: 'done',
      meta: {
        description: {
          'en-US': 'Structure Bootgly projects with boot files, metadata and reusable resources for CLI and Web apps.',
          'pt-BR': 'Estruture projetos Bootgly com boot files, metadados e recursos reutilizáveis para aplicações CLI e Web.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Projects'
      },
      'pt-BR': {
        title: 'Projetos'
      }
    },
    meta: {
      'en-US': {
        overview: {
          _sections: {
            count: 5,
            done: 5
          },
          _translations: 2
        }
      },
      'pt-BR': {}
    }
  },
  '/Bootgly/essential/testing': {
    config: {
      icon: 'science',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Start testing Bootgly code with assertions, suites and project-friendly automation patterns.',
          'pt-BR': 'Comece a testar código Bootgly com assertions, suítes e automação amigável para projetos.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Testing'
      },
      'pt-BR': {
        title: 'Testando'
      }
    }
  },

  // WPI
  '/WPI': {
    config: {
      icon: 'language',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Build web-facing systems with Bootgly HTTP, TCP and UDP layers, from datagrams and sockets to high-level servers.',
          'pt-BR': 'Crie sistemas voltados para a Web com as camadas HTTP, TCP e UDP do Bootgly, de datagramas e sockets a servidores de alto nível.'
        }
      },
      menu: {
        header: {
          icon: 'language',
          label: 'Bootgly WPI'
        },
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Web Programming Interface'
      }
    }
  },
  '/WPI/HTTP': {
    config: null,
    data: {
      '*': {
        title: 'HTTP'
      }
    }
  },
  '/WPI/HTTP/HTTP_Server_CLI': {
    config: {
      icon: 'dns',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Run an event-driven HTTP server in pure PHP with workers, fibers, routing and middleware.',
          'pt-BR': 'Execute um servidor HTTP orientado a eventos em PHP puro, com workers, fibers, roteamento e middleware.'
        }
      },
      menu: {
        subheader: '.WPI.HTTP'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'HTTP Server CLI'
      }
    }
  },
  '/WPI/HTTP/HTTP_Server_CLI/Request': {
    config: {
      icon: 'last_page',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Inspect HTTP request data, connection details and URL parts inside Bootgly handlers.',
          'pt-BR': 'Inspecione dados da requisição HTTP, detalhes da conexão e partes da URL dentro dos handlers do Bootgly.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Request'
      }
    }
  },
  '/WPI/HTTP/HTTP_Server_CLI/Response': {
    config: {
      icon: 'first_page',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Compose HTTP responses with headers, body formats, files and protocol-aware delivery.',
          'pt-BR': 'Monte respostas HTTP com headers, formatos de body, arquivos e entrega consciente do protocolo.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Response'
      }
    }
  },
  '/WPI/HTTP/HTTP_Server_CLI/Router': {
    config: {
      icon: 'alt_route',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Match routes and dispatch HTTP requests through Bootgly routing.',
          'pt-BR': 'Faça o match de rotas e despache requisições HTTP pelo roteamento do Bootgly.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Routing'
      }
    }
  },
  '/WPI/HTTP/HTTP_Server_CLI/Middlewares': {
    config: {
      icon: 'settings_input_component',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Chain CORS, rate limits, security headers and other HTTP middlewares around each request.',
          'pt-BR': 'Encadeie CORS, rate limits, secure headers e outros middlewares HTTP ao redor de cada requisição.'
        }
      },
      menu: {
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Middlewares'
      }
    }
  },
  '/WPI/HTTP/HTTP_Client_CLI': {
    config: {
      icon: 'desktop_windows',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Send outbound HTTP requests from the CLI with Bootgly client, decoding and connection flow.',
          'pt-BR': 'Envie requisições HTTP de saída pela CLI com o cliente, a decodificação e o fluxo de conexão do Bootgly.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'HTTP Client CLI'
      }
    }
  },
  '/WPI/HTTP/HTTP_Client_CLI/Request': {
    config: {
      icon: 'last_page',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Build outbound HTTP requests with methods, headers, body data and transport options.',
          'pt-BR': 'Monte requisições HTTP de saída com métodos, headers, dados de body e opções de transporte.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Request'
      }
    }
  },
  '/WPI/HTTP/HTTP_Client_CLI/Response': {
    config: {
      icon: 'first_page',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Read outbound HTTP responses, status codes, headers and payloads from Bootgly CLI clients.',
          'pt-BR': 'Leia respostas HTTP de saída, status codes, headers e payloads nos clientes CLI do Bootgly.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Response'
      }
    }
  },
  '/WPI/TCP': {
    config: null,
    data: {
      '*': {
        title: 'TCP'
      }
    }
  },
  '/WPI/TCP/TCP_Client_CLI': {
    config: {
      icon: 'desktop_windows',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Open low-level outbound TCP connections for custom protocols, event loops and raw socket workflows.',
          'pt-BR': 'Abra conexões TCP de saída de baixo nível para protocolos customizados, event loops e fluxos raw de socket.'
        }
      },
      menu: {
        separator: true,
        subheader: '.WPI.TCP'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'TCP Client CLI'
      }
    }
  },
  '/WPI/TCP/TCP_Server_CLI': {
    config: {
      icon: 'dns',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Accept low-level TCP connections with non-blocking sockets, multi-worker runtime and raw package handlers.',
          'pt-BR': 'Aceite conexões TCP de baixo nível com sockets não bloqueantes, runtime multi-worker e handlers raw de pacotes.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'TCP Server CLI'
      }
    }
  },
  '/WPI/UDP': {
    config: null,
    data: {
      '*': {
        title: 'UDP'
      }
    }
  },
  '/WPI/UDP/UDP_Server_CLI': {
    config: {
      icon: 'dns',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Accept UDP datagrams with a raw handler API, worker-based execution and terminal-friendly control.',
          'pt-BR': 'Aceite datagramas UDP com uma API raw de handler, execução com workers e controle amigável pelo terminal.'
        }
      },
      menu: {
        separator: true,
        subheader: '.WPI.UDP'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'UDP Server CLI'
      }
    }
  },
  '/WPI/UDP/UDP_Client_CLI': {
    config: {
      icon: 'desktop_windows',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Send UDP datagrams with callback-based client flows, configurable workers and monitor-friendly execution.',
          'pt-BR': 'Envie datagramas UDP com fluxos de cliente baseados em callbacks, workers configuráveis e execução amigável para monitoramento.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'UDP Client CLI'
      }
    }
  },

  // CLI
  '/CLI': {
    config: {
      icon: 'terminal',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Build command-line apps with Bootgly terminal APIs, commands, scripts and interactive UI components.',
          'pt-BR': 'Crie aplicações de linha de comando com APIs de terminal, comandos, scripts e UI interativa do Bootgly.'
        }
      },
      menu: {
        header: {
          icon: 'terminal',
          label: 'Bootgly CLI'
        },
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Command Line Interface'
      }
    }
  },

  '/CLI/Commands': {
    config: {
      icon: 'keyboard_command_key',
      status: 'empty',
      meta: {
        description: {
          'en-US': 'Define and route Bootgly CLI commands with arguments, options and predictable execution flow.',
          'pt-BR': 'Defina e roteie comandos do Bootgly CLI com argumentos, opções e um fluxo de execução previsível.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Commands'
      }
    }
  },
  '/CLI/Scripts': {
    config: {
      icon: 'description',
      status: 'empty',
      meta: {
        description: {
          'en-US': 'Organize reusable CLI scripts and automate project tasks inside the Bootgly runtime.',
          'pt-BR': 'Organize scripts reutilizáveis de CLI e automatize tarefas do projeto dentro do runtime Bootgly.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Scripts'
      }
    }
  },
  '/CLI/Terminal': {
    config: {
      icon: 'terminal',
      status: 'empty',
      meta: {
        description: {
          'en-US': 'Handle terminal input, output and reporting to build interactive command-line experiences.',
          'pt-BR': 'Controle entrada, saída e reporting do terminal para criar experiências interativas em linha de comando.'
        }
      },
      menu: {
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Terminal'
      }
    }
  },

  '/CLI/Terminal/Input': {
    config: {
      icon: 'input',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Read terminal input in blocking or event-driven modes for interactive Bootgly CLI tools.',
          'pt-BR': 'Leia entrada do terminal em modos bloqueante ou orientado a eventos para ferramentas CLI do Bootgly.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'CLI Terminal Input'
      }
    }
  },
  '/CLI/Terminal/Output': {
    config: {
      icon: 'output',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Render colored text, cursor moves and paced output for richer terminal interfaces.',
          'pt-BR': 'Renderize texto colorido, movimentos de cursor e saída cadenciada para interfaces de terminal mais ricas.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'CLI Terminal Output'
      }
    }
  },
  '/CLI/Terminal/Reporting': {
    config: {
      icon: 'report',
      status: 'empty',
      meta: {
        description: {
          'en-US': 'Track terminal events and feedback flows that support observability in Bootgly CLI sessions.',
          'pt-BR': 'Acompanhe eventos e fluxos de feedback do terminal que apoiam a observabilidade em sessões CLI do Bootgly.'
        }
      },
      menu: {
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'CLI Terminal Reporting'
      }
    }
  },
  '/CLI/Terminal/Input/Keystrokes': {
    config: {
      icon: 'keyboard',
      status: 'empty',
      meta: {
        description: {
          'en-US': 'Capture key presses and keyboard-driven interactions for responsive terminal controls.',
          'pt-BR': 'Capture pressionamentos de teclas e interações guiadas por teclado para controles responsivos no terminal.'
        }
      },
      menu: {
        subheader: '.CLI.Terminal.Input'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Keystrokes'
      }
    }
  },
  '/CLI/Terminal/Input/Mousestrokes': {
    config: {
      icon: 'mouse',
      status: 'empty',
      meta: {
        description: {
          'en-US': 'Interpret mouse actions in the terminal to support selection, clicks and richer CLI UX.',
          'pt-BR': 'Interprete ações do mouse no terminal para suportar seleção, cliques e uma UX de CLI mais rica.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Mousestrokes'
      }
    }
  },
  '/CLI/Terminal/Output/Cursor': {
    config: {
      icon: 'fas fa-i-cursor',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Move, hide and style the terminal cursor to orchestrate dynamic CLI layouts.',
          'pt-BR': 'Mova, oculte e estilize o cursor do terminal para orquestrar layouts dinâmicos de CLI.'
        }
      },
      menu: {
        subheader: '.CLI.Terminal.Output'
      },
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Cursor'
      }
    }
  },
  '/CLI/Terminal/Output/Text': {
    config: {
      icon: 'text_fields',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Write styled text, clear lines and control output pacing in Bootgly terminal views.',
          'pt-BR': 'Escreva texto estilizado, limpe linhas e controle o ritmo da saída nas views de terminal do Bootgly.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Text'
      }
    }
  },
  '/CLI/Terminal/Output/Viewport': {
    config: {
      icon: 'wysiwyg',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Work with terminal viewport space to align, refresh and compose screen-based interfaces.',
          'pt-BR': 'Trabalhe o espaço visível do terminal para alinhar, atualizar e compor interfaces baseadas em tela.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Viewport'
      }
    }
  },
  '/CLI/Terminal/Reporting/Mouse': {
    config: {
      icon: 'mouse',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Report mouse events from the terminal so Bootgly components can react in real time.',
          'pt-BR': 'Reporte eventos de mouse do terminal para que componentes Bootgly reajam em tempo real.'
        }
      },
      menu: {
        subheader: '.CLI.Terminal.Reporting',
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Mouse'
      }
    }
  },

  '/CLI/UI/Components': {
    config: null,
    data: {
      '*': {
        title: 'CLI UI Components'
      }
    }
  },
  '/CLI/UI/Components/Alert': {
    config: {
      icon: 'notification_important',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Surface success, failure and attention states with styled CLI alerts.',
          'pt-BR': 'Exiba estados de sucesso, falha e atenção com alertas de CLI estilizados.'
        }
      },
      menu: {
        subheader: '.CLI.UI.Components'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Alert'
      }
    }
  },
  '/CLI/UI/Components/Fieldset': {
    config: {
      icon: 'crop_square',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Group prompts and form-like inputs into structured terminal sections.',
          'pt-BR': 'Agrupe prompts e entradas em formato de formulário dentro de seções estruturadas de terminal.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Fieldset'
      }
    }
  },
  '/CLI/UI/Components/Menu': {
    config: {
      icon: 'menu',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Build keyboard-friendly terminal menus for selection and navigation flows.',
          'pt-BR': 'Monte menus de terminal amigáveis ao teclado para fluxos de seleção e navegação.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Menu'
      }
    }
  },
  '/CLI/UI/Components/Progress': {
    config: {
      icon: 'downloading',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Show live progress, ETA and rates for long-running CLI work.',
          'pt-BR': 'Mostre progresso em tempo real, ETA e taxas para trabalhos longos em CLI.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Progress'
      }
    }
  },
  '/CLI/UI/Components/Table': {
    config: {
      icon: 'table_chart',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Present structured datasets in readable terminal tables.',
          'pt-BR': 'Apresente conjuntos de dados estruturados em tabelas legíveis no terminal.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Table'
      }
    }
  },
}
