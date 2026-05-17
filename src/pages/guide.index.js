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
      menu: {},
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
      menu: {},
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
  }
}
