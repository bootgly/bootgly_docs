export default {
  '/getting-started': {
    config: {
      link: {
        to: '/guide/getting-started/overview/'
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
            count: 4,
            done: 4
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
            count: 6,
            done: 6
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
      link: {
        to: '/testing/about/testing/overview/'
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

  // ADI
  '/ADI': {
    config: {
      icon: 'data_array',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Access data in Bootgly: the SQL database, connection pooling, Query Builder, Schema Builder, Seeders and ORM Data Mapper.',
          'pt-BR': 'Acesse dados no Bootgly: banco SQL, pool de conexões, Query Builder, Schema Builder, Seeders e ORM Data Mapper.'
        }
      },
      menu: {
        header: {
          icon: 'data_array',
          label: 'Bootgly ADI'
        },
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Abstract Data Interface'
      }
    }
  },
  '/ADI/Database': {
    config: {
      icon: 'hub',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Understand the low-level DBAL core: config, connection, pool, operation, result and drivers.',
          'pt-BR': 'Entenda o núcleo baixo nível do DBAL: config, conexão, pool, operação, resultado e drivers.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Database DBAL'
      },
      'pt-BR': {
        title: 'DBAL de banco'
      }
    }
  },
  '/ADI/Databases': {
    config: null,
    data: {
      '*': {
        title: 'Databases'
      }
    }
  },

  '/ADI/Databases/SQL': {
    config: null,
    data: {
      '*': {
        title: 'SQL'
      }
    }
  },
  '/ADI/Databases/SQL/Drivers': {
    config: {
      icon: 'cable',
      status: 'done',
      version: 'v0.22.0',
      meta: {
        description: {
          'en-US': 'Native SQL wire drivers: PostgreSQL, MySQL/MariaDB and SQLite — selection, capabilities and pool notes.',
          'pt-BR': 'Wire drivers SQL nativos: PostgreSQL, MySQL/MariaDB e SQLite — seleção, capacidades e notas de pool.'
        }
      },
      menu: {
        subheader: '.ADI.Databases.SQL'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Drivers'
      },
      'pt-BR': {
        title: 'Drivers'
      }
    }
  },
  '/ADI/Databases/SQL/Drivers/PostgreSQL': {
    config: {
      icon: 'dns',
      status: 'done',
      version: 'v0.22.0',
      meta: {
        description: {
          'en-US': 'Native PostgreSQL Protocol 3.0 driver: SCRAM authentication, TLS, extended protocol and pipelining.',
          'pt-BR': 'Driver nativo do PostgreSQL Protocol 3.0: autenticação SCRAM, TLS, protocolo estendido e pipelining.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'PostgreSQL'
      },
      'pt-BR': {
        title: 'PostgreSQL'
      }
    }
  },
  '/ADI/Databases/SQL/Drivers/MySQL': {
    config: {
      icon: 'bolt',
      status: 'done',
      version: 'v0.22.0',
      meta: {
        description: {
          'en-US': 'Native MySQL/MariaDB driver: caching_sha2 authentication, TLS, binary prepared statements and KILL QUERY.',
          'pt-BR': 'Driver nativo MySQL/MariaDB: autenticação caching_sha2, TLS, prepared statements binários e KILL QUERY.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'MySQL'
      },
      'pt-BR': {
        title: 'MySQL'
      }
    }
  },
  '/ADI/Databases/SQL/Drivers/SQLite': {
    config: {
      icon: 'sd_storage',
      status: 'done',
      version: 'v0.22.0',
      meta: {
        description: {
          'en-US': 'Native SQLite driver over ext-sqlite3: zero-setup file and :memory: databases for tests and prototypes.',
          'pt-BR': 'Driver nativo SQLite sobre ext-sqlite3: bancos em arquivo e :memory: sem setup para testes e protótipos.'
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
      'en-US': {
        title: 'SQLite'
      },
      'pt-BR': {
        title: 'SQLite'
      }
    }
  },
  '/ADI/Databases/SQL/Transaction': {
    config: {
      icon: 'sync_alt',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Use SQL transactions and savepoints on one pinned pooled connection.',
          'pt-BR': 'Use transações SQL e savepoints em uma conexão fixada do pool.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Transactions'
      },
      'pt-BR': {
        title: 'Transações'
      }
    }
  },
  '/ADI/Databases/SQL/Builder': {
    config: {
      icon: 'storage',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Build parameterized SELECT, INSERT, UPDATE and DELETE statements through the SQL Query Builder.',
          'pt-BR': 'Monte SELECT, INSERT, UPDATE e DELETE parametrizados com o Query Builder SQL.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Query Builder'
      },
      'pt-BR': {
        title: 'Query Builder'
      }
    }
  },
  '/ADI/Databases/SQL/Builder/Reading': {
    config: {
      icon: 'search',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Read rows with select, filters, text matching, joins, aliases, aggregates, grouping, order and locks.',
          'pt-BR': 'Leia linhas com select, filtros, busca textual, joins, aliases, agregações, agrupamento, ordem e locks.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Reading rows'
      },
      'pt-BR': {
        title: 'Lendo linhas'
      }
    }
  },
  '/ADI/Databases/SQL/Builder/Writing': {
    config: {
      icon: 'edit_note',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Write rows with insert, multi-row set values, update/delete guards, RETURNING output and upsert handling.',
          'pt-BR': 'Escreva linhas com insert, valores multi-row, guards de update/delete, output RETURNING e upsert.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Writing rows'
      },
      'pt-BR': {
        title: 'Escrevendo linhas'
      }
    }
  },
  '/ADI/Databases/SQL/Builder/Composing': {
    config: {
      icon: 'account_tree',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Compose advanced query shapes with Identifier, Expression, nested filters, subqueries, derived tables and CTEs.',
          'pt-BR': 'Componha queries avançadas com Identifier, Expression, filtros aninhados, subqueries, tabelas derivadas e CTEs.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Composing queries'
      },
      'pt-BR': {
        title: 'Compondo queries'
      }
    }
  },
  '/ADI/Databases/SQL/Builder/Dialects': {
    config: {
      icon: 'compare_arrows',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Compare Query Builder output across PostgreSQL, MySQL and SQLite: quotes, placeholders and capabilities.',
          'pt-BR': 'Compare a saída do Query Builder em PostgreSQL, MySQL e SQLite: quotes, placeholders e capacidades.'
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
      'en-US': {
        title: 'Query dialects'
      },
      'pt-BR': {
        title: 'Dialetos de query'
      }
    }
  },
  '/ADI/Databases/SQL/Schema': {
    config: {
      icon: 'schema',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Compile portable CREATE, ALTER, DROP, RENAME, index and constraint DDL into dialect-specific SQL.',
          'pt-BR': 'Compile DDL portável de CREATE, ALTER, DROP, RENAME, índices e constraints em SQL específico do dialeto.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Schema Builder'
      },
      'pt-BR': {
        title: 'Schema Builder'
      }
    }
  },
  '/ADI/Databases/SQL/Schema/Blueprint': {
    config: {
      icon: 'view_column',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Define tables and columns fluently: types, modifiers, keys, references and auxiliary enums.',
          'pt-BR': 'Defina tabelas e colunas de forma fluente: tipos, modificadores, chaves, referências e enums auxiliares.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Defining tables'
      },
      'pt-BR': {
        title: 'Definindo tabelas'
      }
    }
  },
  '/ADI/Databases/SQL/Schema/Migrations': {
    config: {
      icon: 'history',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Version the schema with migration files, the Runner, batches, history, transactions and locking.',
          'pt-BR': 'Versione o schema com arquivos de migration, o Runner, batches, histórico, transações e lock.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Migrations'
      }
    }
  },
  '/ADI/Databases/SQL/Schema/Dialects': {
    config: {
      icon: 'compare_arrows',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'PostgreSQL, MySQL and SQLite compilation differences and capability checks.',
          'pt-BR': 'Diferenças de compilação e checagem de capacidades de PostgreSQL, MySQL e SQLite.'
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
        title: 'Dialects'
      }
    }
  },
  '/ADI/Databases/SQL/Seed': {
    config: {
      icon: 'playlist_add',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Create and run rerunnable SQL seeders with Query Builder, transactions, locks and deterministic fakers.',
          'pt-BR': 'Crie e rode seeders SQL reexecutáveis com Query Builder, transações, locks e fakers determinísticos.'
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
        title: 'Seeders'
      }
    }
  },
  '/ADI/Databases/SQL/ORM': {
    config: null,
    data: {
      '*': {
        title: 'ORM'
      }
    }
  },
  '/ADI/Databases/SQL/Model': {
    config: {
      icon: 'label',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Compile ORM entity metadata from Table, Key, Column and Relation attributes.',
          'pt-BR': 'Compile metadata de entidades ORM a partir dos attributes Table, Key, Column e Relation.'
        }
      },
      menu: {
        subheader: '.ADI.Databases.SQL.ORM'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'ORM Model'
      },
      'pt-BR': {
        title: 'ORM Model'
      }
    }
  },
  '/ADI/Databases/SQL/Model/Attributes': {
    config: {
      icon: 'sell',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Define ORM entity metadata with Table, Key, Column and Relation attributes.',
          'pt-BR': 'Defina metadata de entidades ORM com attributes Table, Key, Column e Relation.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'ORM Model Attributes'
      },
      'pt-BR': {
        title: 'ORM Model Attributes'
      }
    }
  },
  '/ADI/Databases/SQL/Repository': {
    config: {
      icon: 'account_tree',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Run ORM Data Mapper operations with repositories, selections, hydration and local identity maps.',
          'pt-BR': 'Execute operações ORM Data Mapper com repositories, selections, hidratação e identity maps locais.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'ORM Repository'
      },
      'pt-BR': {
        title: 'ORM Repository'
      }
    }
  },
  '/ADI/Databases/SQL/Repository/Pagination': {
    config: {
      icon: 'last_page',
      status: 'done',
      version: 'v0.22.0',
      meta: {
        description: {
          'en-US': 'Paginate ORM repositories with page/cursor modes, pipelined totals and REST-ready bodies, headers and opaque keyset tokens.',
          'pt-BR': 'Pagine repositories ORM com modos página/cursor, totais em pipeline e bodies REST, headers e tokens keyset opacos.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'ORM Repository Pagination'
      },
      'pt-BR': {
        title: 'ORM Repository Pagination'
      }
    }
  },
  '/ADI/Databases/SQL/Repository/Relations': {
    config: {
      icon: 'hub',
      status: 'done',
      version: 'v0.16.0',
      meta: {
        description: {
          'en-US': 'Load ORM relations through explicit deferred operations or eager auto-await for has-many, belongs-to and many-to-many data.',
          'pt-BR': 'Carregue relações ORM com operações explícitas deferidas ou eager auto-await para has-many, belongs-to e many-to-many.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'ORM Repository Relations'
      },
      'pt-BR': {
        title: 'ORM Repository Relations'
      }
    }
  },
  '/ADI/Validation': {
    config: {
      icon: 'rule',
      status: 'done',
      version: 'v0.23.0',
      meta: {
        description: {
          'en-US': 'Standalone data validation with composable rule objects — the same rules validate HTTP requests, CLI input, jobs and seeders.',
          'pt-BR': 'Validação de dados standalone com objetos de regra componíveis — as mesmas regras validam requisições HTTP, input de CLI, jobs e seeders.'
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
      'en-US': {
        title: 'Validation'
      },
      'pt-BR': {
        title: 'Validation'
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
        showcase: true
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
      status: 'draft',
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
      status: 'draft',
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
      status: 'draft',
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
        showcase: true
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
      status: 'draft',
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
  '/CLI/Terminal/Screen': {
    config: {
      icon: 'fullscreen',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Control the alternate screen buffer, measure the terminal and watch resizes for full-screen TUIs.',
          'pt-BR': 'Controle o buffer de tela alternativo, meça o terminal e observe resizes para TUIs full-screen.'
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
        title: 'CLI Terminal Screen'
      }
    }
  },
  '/CLI/Terminal/Input/Keystrokes': {
    config: {
      icon: 'keyboard',
      status: 'draft',
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
  '/CLI/Terminal/Input/Line': {
    config: {
      icon: 'short_text',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Drive single-line editing with a pure key/buffer engine — virtual cursor, masking and windowing.',
          'pt-BR': 'Conduza a edição de linha única com um motor puro de teclas/buffer — cursor virtual, máscara e janelamento.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Line'
      }
    }
  },
  '/CLI/Terminal/Input/Mousestrokes': {
    config: {
      icon: 'mouse',
      status: 'draft',
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
        showcase: true
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
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Viewport'
      }
    }
  },
  '/CLI/Terminal/Output/Window': {
    config: {
      icon: 'web_asset',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Compute the visible slice of scrollable lists — slide a window to follow the aimed row.',
          'pt-BR': 'Compute a fatia visível de listas roláveis — deslize uma janela para seguir a linha mirada.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Window'
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
        showcase: true
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
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Alert'
      }
    }
  },
  '/CLI/UI/Components/Charts': {
    config: {
      icon: 'bar_chart',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Plot gradient-colored sparklines, bars, meters and live braille graphs in the terminal.',
          'pt-BR': 'Plote sparklines com gradiente, barras, meters e graphs braille ao vivo no terminal.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Charts'
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
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Fieldset'
      }
    }
  },
  '/CLI/UI/Components/Logs': {
    config: {
      icon: 'subject',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Tail and filter structured logs live in the terminal — the Monitor-mode viewer.',
          'pt-BR': 'Acompanhe e filtre logs estruturados ao vivo no terminal — o viewer do modo Monitor.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Logs'
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
        showcase: true
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
  '/CLI/UI/Components/Question': {
    config: {
      icon: 'help',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Ask validated questions with defaults, required answers and attempt limits.',
          'pt-BR': 'Faça perguntas validadas com valores padrão, respostas obrigatórias e limite de tentativas.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Question'
      }
    }
  },
  '/CLI/UI/Components/Scrollarea': {
    config: {
      icon: 'swap_vert',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Buffer content into a fixed screen band with its own scrollbar and scrolling.',
          'pt-BR': 'Armazene conteúdo em uma banda fixa da tela com scrollbar e rolagem próprias.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Scrollarea'
      }
    }
  },
  '/CLI/UI/Components/Spinner': {
    config: {
      icon: 'autorenew',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Animate an indeterminate activity indicator while your CLI code works.',
          'pt-BR': 'Anime um indicador de atividade indeterminada enquanto seu código de CLI trabalha.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Spinner'
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
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Table'
      }
    }
  },
  '/CLI/UI/Components/Text': {
    config: {
      icon: 'animation',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Animate terminal text: typewriter, fade-in and a shimmering color wave.',
          'pt-BR': 'Anime texto no terminal: typewriter, fade-in e uma onda de cor shimmer.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Text'
      }
    }
  },
  '/CLI/UI/Components/Textarea': {
    config: {
      icon: 'edit_note',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Edit multiline text in the terminal — Enter breaks lines, Ctrl+D submits.',
          'pt-BR': 'Edite texto multilinha no terminal — Enter quebra linhas, Ctrl+D submete.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Textarea'
      }
    }
  },
  '/CLI/UI/Components/Timeline': {
    config: {
      icon: 'timeline',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Guide multi-step CLI flows with per-step state: pending, active, done or failed.',
          'pt-BR': 'Guie fluxos de CLI multi-etapas com estado por etapa: pending, active, done ou failed.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Timeline'
      }
    }
  },
  '/CLI/UI/Components/Timer': {
    config: {
      icon: 'timer',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Run countdowns with wall-clock precision and a one-shot completion callback.',
          'pt-BR': 'Rode contagens regressivas com precisão de relógio de parede e callback de conclusão one-shot.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Timer'
      }
    }
  },
  '/CLI/UX': {
    config: null,
    data: {
      '*': {
        title: 'CLI UX'
      }
    }
  },
  '/CLI/UX/Form': {
    config: {
      icon: 'dynamic_form',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Ask a declarative list of fields sequentially, with revert and a summary + confirm loop.',
          'pt-BR': 'Pergunte uma lista declarativa de campos sequencialmente, com revert e um loop de resumo + confirmação.'
        }
      },
      menu: {
        subheader: '.CLI.UX'
      },
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Form'
      }
    }
  },
  '/CLI/UX/Prompt': {
    config: {
      icon: 'terminal',
      status: 'new',
      version: 'v0.20.0-beta',
      meta: {
        description: {
          'en-US': 'Fix the input line at the bottom while buffered content scrolls above — REPL-style.',
          'pt-BR': 'Fixe a linha de entrada no rodapé enquanto o conteúdo bufferizado rola acima — estilo REPL.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Prompt'
      }
    }
  },

  // Console (platform)
  '/Console': {
    config: {
      icon: 'terminal',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'The opinionated TUI platform over the CLI interface: full-screen apps and terminal games.',
          'pt-BR': 'A plataforma TUI opinativa sobre a interface CLI: apps full-screen e jogos de terminal.'
        }
      },
      menu: {
        header: {
          icon: 'terminal',
          label: 'Console'
        },
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Console'
      }
    }
  },
  '/Console/App': {
    config: {
      icon: 'dashboard',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'The TUI application shell: Screens + Router, Keymaps with chords, Statusbar, Toasts, Palette and Tail.',
          'pt-BR': 'O shell de aplicação TUI: Screens + Router, Keymaps com chords, Statusbar, Toasts, Palette e Tail.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'App'
      }
    }
  },
  '/Console/Games': {
    config: {
      icon: 'sports_esports',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'The game shell: fixed-timestep Loop, diff-rendered Canvas, Keyboard held-key heuristics and Scenes.',
          'pt-BR': 'O shell de jogos: Loop de timestep fixo, Canvas com diff, heurísticas de tecla segurada no Keyboard e Scenes.'
        }
      },
      menu: {},
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Games'
      }
    }
  },

  // Web (platform)
  '/Web': {
    config: {
      icon: 'public',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'The opinionated web platform over the WPI interface: MVC apps and REST APIs.',
          'pt-BR': 'A plataforma web opinativa sobre a interface WPI: apps MVC e APIs REST.'
        }
      },
      menu: {
        header: {
          icon: 'public',
          label: 'Web'
        },
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Web'
      }
    }
  },
  '/Web/App': {
    config: {
      icon: 'dashboard',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'The MVC shell: App, Controller dispatch, resource routing, Statics and view conventions.',
          'pt-BR': 'O shell MVC: App, dispatch de Controllers, resource routing, Statics e convenções de views.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'App'
      }
    }
  },
  '/Web/API': {
    config: {
      icon: 'api',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'The REST shell: Action dispatch, REST routes, RFC 9457 problems and Resource transformers.',
          'pt-BR': 'O shell REST: dispatch de Action, rotas REST, problems RFC 9457 e transformadores Resource.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'API'
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
        showcase: false,
        vs: { template: 'vs' }
      }
    },
    data: {
      '*': {
        title: 'HTTP Server CLI'
      }
    }
  },
  '/WPI/HTTP/HTTP_Server_CLI/HTTP2': {
    config: {
      icon: 'bolt',
      status: 'draft',
      version: '0.19.0-beta',
      meta: {
        description: {
          'en-US': 'Serve HTTP/2 natively — h2 over TLS (ALPN) and cleartext prior knowledge, HPACK, multiplexing, flow control and rapid-reset protection, dependency-free.',
          'pt-BR': 'Sirva HTTP/2 nativamente — h2 sobre TLS (ALPN) e prior knowledge em texto claro, HPACK, multiplexação, controle de fluxo e proteção rapid-reset, sem dependências.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'HTTP/2'
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
  '/WPI/HTTP/HTTP_Server_CLI/Response/Resources': {
    config: {
      icon: 'extension',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Extend HTTP responses with built-in and project resources such as JSON, View and Database.',
          'pt-BR': 'Estenda respostas HTTP com resources built-in e de projeto, como JSON, View e Database.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Response Resources'
      },
      'pt-BR': {
        title: 'Response Resources'
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
  '/WPI/HTTP/HTTP_Server_CLI/Authentication': {
    config: {
      icon: 'shield',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Protect HTTP Server CLI routes with Basic, Bearer, JWT and Session authentication guards.',
          'pt-BR': 'Proteja rotas do HTTP Server CLI com guards de autenticação Basic, Bearer, JWT e Session.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Authentication'
      }
    }
  },
  '/WPI/HTTP/HTTP_Server_CLI/Authorization': {
    config: {
      icon: 'verified_user',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Require Scope, Role and Policy gates after HTTP authentication succeeds.',
          'pt-BR': 'Exija gates de Scope, Role e Policy depois que a autenticação HTTP passa.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Authorization'
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
      menu: {},
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
  '/WPI/HTTP/HTTP_Server_CLI/Queues': {
    config: {
      icon: 'queue',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Enqueue background jobs from request handlers and process them with a queue worker.',
          'pt-BR': 'Enfileire jobs em background a partir dos route handlers e processe-os com um worker de fila.'
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
        title: 'Queues'
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
  '/WPI/WS': {
    config: null,
    data: {
      '*': {
        title: 'WS'
      }
    }
  },
  '/WPI/WS/WS_Server_CLI': {
    config: {
      icon: 'sync_alt',
      status: 'draft',
      version: 'v0.19.0-beta',
      meta: {
        description: {
          'en-US': 'Run an event-driven WebSocket server in pure PHP — RFC 6455 framing, rooms, ping/pong heartbeat, compression and handshake auth.',
          'pt-BR': 'Execute um servidor WebSocket orientado a eventos em PHP puro — framing RFC 6455, salas, heartbeat ping/pong, compressão e autenticação no handshake.'
        }
      },
      menu: {
        subheader: '.WPI.WS'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'WS Server CLI'
      }
    }
  },
  '/WPI/WS/WS_Server_CLI/Channels': {
    config: {
      icon: 'forum',
      status: 'draft',
      version: 'v0.19.0-beta',
      meta: {
        description: {
          'en-US': 'Group WebSocket sessions into rooms and broadcast to every member across workers.',
          'pt-BR': 'Agrupe sessões WebSocket em salas e faça broadcast para todos os membros entre workers.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Channels'
      }
    }
  },
  '/WPI/WS/WS_Server_CLI/Compression': {
    config: {
      icon: 'compress',
      status: 'draft',
      version: 'v0.19.0-beta',
      meta: {
        description: {
          'en-US': 'Negotiate permessage-deflate (RFC 7692) to compress WebSocket messages with built-in zlib.',
          'pt-BR': 'Negocie permessage-deflate (RFC 7692) para comprimir mensagens WebSocket com o zlib embutido.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Compression'
      },
      'pt-BR': {
        title: 'Compressão'
      }
    }
  },
  '/WPI/WS/WS_Server_CLI/Authentication': {
    config: {
      icon: 'shield',
      status: 'draft',
      version: 'v0.19.0-beta',
      meta: {
        description: {
          'en-US': 'Authenticate the WebSocket handshake by reusing the HTTP Server CLI auth guards.',
          'pt-BR': 'Autentique o handshake WebSocket reaproveitando os guards de autenticação do HTTP Server CLI.'
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
        title: 'Authentication'
      }
    }
  },
  '/WPI/WS/WS_Client_CLI': {
    config: {
      icon: 'cell_tower',
      status: 'draft',
      version: 'v0.19.0-beta',
      meta: {
        description: {
          'en-US': 'Talk to a WebSocket endpoint in pure PHP — RFC 6455 masked framing, fragmentation, ping/pong, permessage-deflate and wss://.',
          'pt-BR': 'Converse com um endpoint WebSocket em PHP puro — framing mascarado RFC 6455, fragmentação, ping/pong, permessage-deflate e wss://.'
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
        title: 'WS Client CLI'
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
      menu: {
        subheader: '.WPI.TCP',  
        separator: true
      
      },
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
      menu: {},
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
}
