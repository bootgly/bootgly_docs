export default {
  '/getting-started': {
    config: {
      icon: 'flag',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Install Bootgly with one command and create your first project with the wizard.',
          'pt-BR': 'Instale o Bootgly com um comando e crie seu primeiro projeto com o wizard.'
        }
      },
      book: 'guide',
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

  '/console-platform': {
    config: {
      icon: 'terminal',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Build full-screen terminal apps and games with the opinionated Console platform.',
          'pt-BR': 'Construa apps e jogos de terminal full-screen com a plataforma Console opinativa.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Console Platform'
      },
      'pt-BR': {
        title: 'Plataforma Console'
      }
    }
  },

  '/web-platform': {
    config: {
      icon: 'language',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Build MVC sites and REST APIs with the opinionated Web platform.',
          'pt-BR': 'Construa sites MVC e APIs REST com a plataforma Web opinativa.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Web Platform'
      },
      'pt-BR': {
        title: 'Plataforma Web'
      }
    }
  },

  '/configuration': {
    config: {
      icon: 'tune',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Load scoped configs, local .env values, strict casts, required secrets and project overlays in Bootgly.',
          'pt-BR': 'Carregue configs por escopo, .env local, casts estritos, segredos obrigatórios e overlays de projeto no Bootgly.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Configuration'
      },
      'pt-BR': {
        title: 'Configuração'
      }
    }
  },

  '/authorization': {
    config: {
      icon: 'verified_user',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Protect HTTP routes with Scope, Role, Policy and persisted RBAC authorization in Bootgly.',
          'pt-BR': 'Proteja rotas HTTP com Authorization por Scope, Role, Policy e RBAC persistido no Bootgly.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Authorization'
      },
      'pt-BR': {
        title: 'Authorization'
      }
    }
  },

  '/cryptography': {
    config: {
      icon: 'key',
      status: 'draft',
      version: '0.24.0-beta',
      meta: {
        description: {
          'en-US': 'Encrypt values with AES-256-GCM key rotation and hash passwords with argon2id rehash-on-verify in Bootgly.',
          'pt-BR': 'Criptografe valores com AES-256-GCM e rotação de chaves e faça hash de senhas com argon2id rehash-on-verify no Bootgly.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Cryptography'
      },
      'pt-BR': {
        title: 'Criptografia'
      }
    }
  },

  '/cache': {
    config: {
      icon: 'cached',
      status: 'draft',
      version: '0.17.0-beta',
      meta: {
        description: {
          'en-US': 'Cache values with File, APCu, Shared-memory or Redis drivers — TTL, tags, atomic counters and the multi-worker rate-limit backend.',
          'pt-BR': 'Faça cache de valores com drivers File, APCu, Shared-memory ou Redis — TTL, tags, contadores atômicos e o backend de rate limit multi-worker.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Cache'
      },
      'pt-BR': {
        title: 'Cache'
      }
    }
  },

  '/storage': {
    config: {
      icon: 'folder',
      status: 'draft',
      version: '0.18.0-beta',
      meta: {
        description: {
          'en-US': 'Store files through a native facade — Local, Memory and S3 drivers, named disks, streaming write/read (S3 multipart) and path jailing.',
          'pt-BR': 'Armazene arquivos através de um facade nativo — drivers Local, Memory e S3, disks nomeados, write/read em streaming (multipart no S3) e jailing de caminho.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Storage'
      },
      'pt-BR': {
        title: 'Storage'
      }
    }
  },

  '/templates': {
    config: {
      icon: 'code',
      status: 'draft',
      version: '0.21.0-beta',
      meta: {
        description: {
          'en-US': 'Write @-directive templates compiled to cached PHP — inheritance (@extends/@section/@yield), includes, components with slots, escaped output and template-line error reporting.',
          'pt-BR': 'Escreva templates com diretivas @ compilados para PHP cacheado — herança (@extends/@section/@yield), includes, componentes com slots, output com escape e erros na linha do template.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Templates'
      },
      'pt-BR': {
        title: 'Templates'
      }
    }
  },

  '/views': {
    config: {
      icon: 'web',
      status: 'draft',
      version: '0.21.0-beta',
      meta: {
        description: {
          'en-US': 'Render project views on top of the template engine — default layouts, views/layouts and views/partials conventions, and JSON/XML/HTML content negotiation driven by the Accept header.',
          'pt-BR': 'Renderize views do projeto sobre o template engine — layouts padrão, convenções views/layouts e views/partials, e content negotiation JSON/XML/HTML guiada pelo header Accept.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Views'
      },
      'pt-BR': {
        title: 'Views'
      }
    }
  },

  '/theme': {
    config: {
      icon: 'palette',
      status: 'draft',
      version: '0.21.0-beta',
      meta: {
        description: {
          'en-US': 'Theme terminal output by semantic key — builtin dark/light/mono themes, NO_COLOR support, a swappable Theme::$Current that drives the CLI @:…: color tokens, and custom theme registration.',
          'pt-BR': 'Tematize a saída do terminal por chave semântica — temas embutidos dark/light/mono, suporte a NO_COLOR, um Theme::$Current trocável que dirige os tokens de cor @:…: da CLI, e registro de temas customizados.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Theme'
      },
      'pt-BR': {
        title: 'Theme'
      }
    }
  },

  '/i18n': {
    config: {
      icon: 'language',
      status: 'draft',
      version: '0.24.0-beta',
      meta: {
        description: {
          'en-US': 'Translate messages with natural-source keys — PHP array catalogs per locale/domain, {token} placeholders, pipe plurals, Accept-Language negotiation, localized validation messages, @translate templates and error pages.',
          'pt-BR': 'Traduza mensagens com keys naturais da língua-fonte — catálogos PHP por locale/domain, placeholders {token}, plurais com pipe, negociação de Accept-Language, mensagens de validação localizadas, templates @translate e páginas de erro.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'i18n'
      },
      'pt-BR': {
        title: 'i18n'
      }
    }
  },

  '/sse': {
    config: {
      icon: 'stream',
      status: 'draft',
      version: '0.24.0-beta',
      meta: {
        description: {
          'en-US': 'Push live events to browsers over plain HTTP with Server-Sent Events — the text/event-stream Response resource with heartbeat, retry and Last-Event-ID resume, on HTTP/1.1 and HTTP/2.',
          'pt-BR': 'Envie eventos ao vivo para navegadores sobre HTTP puro com Server-Sent Events — o resource de Response text/event-stream com heartbeat, retry e resume via Last-Event-ID, em HTTP/1.1 e HTTP/2.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Server-Sent Events'
      },
      'pt-BR': {
        title: 'Server-Sent Events'
      }
    }
  },

  '/queues': {
    config: {
      icon: 'queue',
      status: 'draft',
      version: '0.17.0-beta',
      meta: {
        description: {
          'en-US': 'Enqueue background jobs and run workers — File or Redis drivers, retry/backoff, dead-letter, the queue worker command and lifecycle events.',
          'pt-BR': 'Enfileire jobs em background e rode workers — drivers File ou Redis, retry/backoff, dead-letter, comando de worker e eventos de ciclo de vida.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Queues'
      },
      'pt-BR': {
        title: 'Filas'
      }
    }
  },

  '/scheduler': {
    config: {
      icon: 'schedule',
      status: 'draft',
      version: '0.17.0-beta',
      meta: {
        description: {
          'en-US': 'Schedule cron-style jobs with repeat(), overlap locks, missed-run recovery, a worker command and lifecycle events.',
          'pt-BR': 'Agende jobs no estilo cron com repeat(), locks de sobreposição, recuperação de execuções perdidas, comando worker e eventos de ciclo de vida.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Scheduler'
      },
      'pt-BR': {
        title: 'Scheduler'
      }
    }
  },

  '/mail': {
    config: {
      icon: 'mail',
      status: 'draft',
      version: '0.21.0-beta',
      meta: {
        description: {
          'en-US': 'Send emails with the built-in, dependency-free Mail system — MIME Message builder with attachments/inline images/templates, SMTP over TLS with typed failures, and queued background delivery.',
          'pt-BR': 'Envie e-mails com o sistema de Mail nativo e sem dependências — builder MIME com attachments/imagens inline/templates, SMTP sobre TLS com falhas tipadas e entrega em background via fila.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Mail'
      },
      'pt-BR': {
        title: 'Mail'
      }
    }
  },

  '/error-handling': {
    config: {
      icon: 'bug_report',
      status: 'draft',
      version: '0.23.0-beta',
      meta: {
        description: {
          'en-US': 'Environment-aware error handling — built-in Whoops-style debug page in development (HTML or JSON), clean pages and views/errors overrides in production, plus exception reporting to log channels, Observability metrics and custom reporters.',
          'pt-BR': 'Tratamento de erros por ambiente — página de debug estilo Whoops embutida em development (HTML ou JSON), páginas limpas e overrides em views/errors em production, além de reporting de exceções para canais de log, métricas de Observability e reporters customizados.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Error handling'
      },
      'pt-BR': {
        title: 'Tratamento de erros'
      }
    }
  },

  '/events': {
    config: {
      icon: 'podcasts',
      status: 'draft',
      version: '0.17.0-beta',
      meta: {
        description: {
          'en-US': 'Listen to framework domain events — cache, SQL, HTTP, sessions, workers — on the zero-overhead ABI event bus.',
          'pt-BR': 'Escute eventos de domínio do framework — cache, SQL, HTTP, sessões, workers — no barramento de eventos ABI de overhead zero.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Events'
      },
      'pt-BR': {
        title: 'Events'
      }
    }
  },

  '/logging': {
    config: {
      icon: 'receipt_long',
      status: 'draft',
      version: '0.18.0-beta',
      meta: {
        description: {
          'en-US': 'Structured logging — channels, handlers (file/stream/syslog), formatters, processors, filters, rotation, and a real-time filterable log viewer in Monitor mode.',
          'pt-BR': 'Logging estruturado — canais, handlers (arquivo/stream/syslog), formatters, processors, filters, rotação e um viewer de logs em tempo real e filtrável no modo Monitor.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Logging'
      },
      'pt-BR': {
        title: 'Logging'
      }
    }
  },

  '/observability': {
    config: {
      icon: 'insights',
      status: 'draft',
      version: '0.18.0-beta',
      meta: {
        description: {
          'en-US': 'Native metrics — counters, gauges, histograms, process & runtime health, JSON/Prometheus/OTLP exporters, and /health + /metrics endpoints (Prometheus scrape + OTLP push) with file-per-worker aggregation.',
          'pt-BR': 'Métricas nativas — counters, gauges, histograms, saúde de processo & runtime, exporters JSON/Prometheus/OTLP e endpoints /health + /metrics (scrape Prometheus + push OTLP) com agregação por-worker.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Observability'
      },
      'pt-BR': {
        title: 'Observabilidade'
      }
    }
  },

  '/performance': {
    config: {
      icon: 'speed',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Tune HTTP workers, benchmark concurrency, ADI Database pools and PostgreSQL settings for Bootgly projects.',
          'pt-BR': 'Ajuste workers HTTP, concorrência de benchmark, pools do ADI Database e configurações PostgreSQL em projetos Bootgly.'
        }
      },
      book: 'guide',
      menu: {
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Performance'
      },
      'pt-BR': {
        title: 'Performance'
      }
    }
  },

  '/database-dbal': {
    config: {
      icon: 'hub',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Use the Bootgly DBAL inside HTTP Server CLI responses without exposing low-level async loops.',
          'pt-BR': 'Use o DBAL do Bootgly dentro de respostas HTTP Server CLI sem expor loops async de baixo nível.'
        }
      },
      book: 'guide',
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

  '/database-queries': {
    config: {
      icon: 'storage',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Build, run and inspect SQL SELECT, INSERT, UPDATE and DELETE statements with the Bootgly Query Builder.',
          'pt-BR': 'Monte, execute e inspecione SELECT, INSERT, UPDATE e DELETE SQL com o Query Builder do Bootgly.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Database queries'
      },
      'pt-BR': {
        title: 'Consultas de banco'
      }
    }
  },

  '/database-orm': {
    config: {
      icon: 'account_tree',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Map SQL rows to entities with Bootgly ORM Data Mapper while preserving async DBAL operations.',
          'pt-BR': 'Mapeie linhas SQL para entidades com o ORM Data Mapper do Bootgly preservando operações async do DBAL.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Database ORM'
      },
      'pt-BR': {
        title: 'ORM de banco'
      }
    }
  },

  '/database-read-replicas': {
    config: {
      icon: 'lan',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Route safe SQL reads to replica pools while writes, locks and transactions stay on primary.',
          'pt-BR': 'Roteie leituras SQL seguras para pools de réplica enquanto escritas, locks e transações ficam no primário.'
        }
      },
      book: 'guide',
      menu: {
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Database read replicas'
      },
      'pt-BR': {
        title: 'Réplicas de leitura de banco'
      }
    }
  },

  '/database-transactions': {
    config: {
      icon: 'sync_alt',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Run SQL statements on one pooled connection with commit, rollback and nested savepoints.',
          'pt-BR': 'Rode instruções SQL em uma conexão do pool com commit, rollback e savepoints aninhados.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Database transactions'
      },
      'pt-BR': {
        title: 'Transações de banco'
      }
    }
  },

  '/database-migrations': {
    config: {
      icon: 'schema',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Create, apply, roll back and sync SQL schema migrations end to end with the Bootgly Schema Builder and CLI.',
          'pt-BR': 'Crie, aplique, reverta e sincronize migrations de schema SQL ponta a ponta com o Schema Builder e a CLI do Bootgly.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Database migrations'
      },
      'pt-BR': {
        title: 'Migrations de banco'
      }
    }
  },

  '/database-seeders': {
    config: {
      icon: 'playlist_add',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Create, list and run rerunnable SQL data seeders with Query Builder and deterministic fakers.',
          'pt-BR': 'Crie, liste e rode seeders SQL reexecutáveis com Query Builder e fakers determinísticos.'
        }
      },
      book: 'guide',
      menu: {
        separator: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Database seeders'
      },
      'pt-BR': {
        title: 'Seeders de banco'
      }
    }
  },

  '/docker': {
    config: {
      icon: 'view_in_ar',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Build a slim or full Bootgly image to run servers, test, benchmark and ship your own projects with Docker.',
          'pt-BR': 'Construa uma imagem Bootgly slim ou full para rodar servidores, testar, fazer benchmark e publicar seus projetos com Docker.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Docker'
      },
      'pt-BR': {
        title: 'Docker'
      }
    }
  },

  '/reload': {
    config: {
      icon: 'autorenew',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Graceful hot-reload of a running server — drain in-flight requests, re-exec the master, reload all code with the same PID.',
          'pt-BR': 'Hot-reload gracioso de um servidor em execução — drena requisições em andamento, re-executa o master, recarrega todo o código com o mesmo PID.'
        }
      },
      book: 'guide',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Reload'
      },
      'pt-BR': {
        title: 'Reload'
      }
    }
  }
}
