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
