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
  }
}
