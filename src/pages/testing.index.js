export default {
  '/foundations': {
    config: {
      icon: 'architecture',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Start with test file structure and suite bootstrap standards used across Bootgly modules.',
          'pt-BR': 'Comece pela estrutura dos arquivos de teste e pelo padrão de bootstrap de suíte usado nos módulos Bootgly.'
        }
      },
      menu: {
        subheader: '.foundations'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Foundations'
      },
      'pt-BR': {
        title: 'Fundamentos'
      }
    }
  },

  '/API': {
    config: null,
    data: {
      'en-US': {
        title: 'API'
      },
      'pt-BR': {
        title: 'API'
      }
    }
  },
  '/apis': {
    config: {
      icon: 'api',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Understand Basic and Advanced test case APIs and how to structure specifications in Bootgly.',
          'pt-BR': 'Entenda as APIs de caso de teste Básica e Avançada e como estruturar Specifications no Bootgly.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Testing APIs'
      },
      'pt-BR': {
        title: 'APIs de Teste'
      }
    }
  },
  '/assertions': {
    config: {
      icon: 'rule',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Master assertions, comparators, modifiers, behaviors, finders and matchers in the testing APIs.',
          'pt-BR': 'Domine asserções, comparadores, modificadores, comportamentos, buscadores e matchers nas APIs de teste.'
        }
      },
      menu: {
        subheader: 'API'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Assertions'
      },
      'pt-BR': {
        title: 'Asserções'
      }
    }
  },

  '/advanced': {
    config: null,
    data: {
      'en-US': {
        title: 'Advanced'
      },
      'pt-BR': {
        title: 'Avançado'
      }
    }
  },
  '/advanced-features': {
    config: {
      icon: 'rocket_launch',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Explore throwers, waiters, snapshots, lifecycle hooks, skip/ignore controls and output separators.',
          'pt-BR': 'Explore throwers, waiters, snapshots, hooks de ciclo de vida, controles de skip/ignore e separadores de saída.'
        }
      },
      menu: {
        subheader: '.advanced'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Advanced Features'
      },
      'pt-BR': {
        title: 'Recursos Avançados'
      }
    }
  }
}