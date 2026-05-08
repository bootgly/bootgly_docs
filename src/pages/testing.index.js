export default {
  // About
  '/about': {
    config: null,
    data: {
      'en-US': {
        title: 'Bootgly Tests'
      },
      'pt-BR': {
        title: 'Bootgly Testes'
      }
    }
  },
  '/about/testing': {
    config: {
      icon: 'architecture',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Start with test structure, suite bootstrap standards, testing APIs and visual separators.',
          'pt-BR': 'Comece pela estrutura dos testes, bootstrap de suíte, APIs de teste e separadores visuais.'
        }
      },
      menu: {
        subheader: '.about'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Testing'
      },
      'pt-BR': {
        title: 'Testes'
      }
    }
  },

  // Basic
  '/skip-ignore': {
    config: {
      icon: 'visibility_off',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Control skipped and ignored cases in Specifications and Advanced API assertions.',
          'pt-BR': 'Controle casos pulados e ignorados em Specifications e asserções da API Avançada.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Skip and Ignore'
      },
      'pt-BR': {
        title: 'Skip e Ignore'
      }
    }
  },
  '/running-tests': {
    config: {
      icon: 'play_arrow',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Run Bootgly suites and individual tests via the bootgly CLI, with coverage and static analysis.',
          'pt-BR': 'Execute suítes Bootgly e testes individuais pela CLI bootgly, com cobertura e análise estática.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Running Tests'
      },
      'pt-BR': {
        title: 'Executando Testes'
      }
    }
  },

  // API
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
  '/assertions': {
    config: {
      icon: 'rule',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Master Basic and Advanced assertion APIs, fluent expectations and comparison operators.',
          'pt-BR': 'Domine as APIs de asserção Básica e Avançada, expectations fluentes e operadores de comparação.'
        }
      },
      menu: {
        separator: true,
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
  '/assertions/modifiers': {
    config: {
      icon: 'tune',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Compose assertion expectations with NOT, AND and OR modifiers in the Advanced API.',
          'pt-BR': 'Componha expectations de asserção com modificadores NOT, AND e OR na API Avançada.'
        }
      },
      menu: {
        subheader: '.assertions'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Modifiers'
      },
      'pt-BR': {
        title: 'Modificadores'
      }
    }
  },
  '/assertions/behaviors-types': {
    config: {
      icon: 'category',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Validate value types with Type behaviors in fluent assertions.',
          'pt-BR': 'Valide tipos de valores com behaviors Type em asserções fluentes.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Behaviors (Types)'
      },
      'pt-BR': {
        title: 'Behaviors (Types)'
      }
    }
  },
  '/assertions/behaviors-values': {
    config: {
      icon: 'fact_check',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Validate value properties such as even, positive, email, URL, IP and UUID.',
          'pt-BR': 'Valide propriedades de valores como par, positivo, email, URL, IP e UUID.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Behaviors (Values)'
      },
      'pt-BR': {
        title: 'Behaviors (Values)'
      }
    }
  },
  '/assertions/delimiters': {
    config: {
      icon: 'settings_ethernet',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Assert numeric, date and comparable values inside open, closed or half-open intervals.',
          'pt-BR': 'Valide valores numéricos, datas e comparáveis dentro de intervalos abertos, fechados ou semiabertos.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Delimiters'
      },
      'pt-BR': {
        title: 'Delimitadores'
      }
    }
  },
  '/assertions/finders': {
    config: {
      icon: 'search',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Find values in strings, arrays, objects and runtime declarations with finder expectations.',
          'pt-BR': 'Encontre valores em strings, arrays, objetos e declarações de runtime com finder expectations.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Finders'
      },
      'pt-BR': {
        title: 'Finders'
      }
    }
  },
  '/assertions/matchers': {
    config: {
      icon: 'pattern',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Match values by regular expressions and dedicated pattern matcher classes.',
          'pt-BR': 'Compare valores por expressões regulares e classes matcher dedicadas a padrões.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Matchers'
      },
      'pt-BR': {
        title: 'Matchers'
      }
    }
  },
  '/assertions/throwers': {
    config: {
      icon: 'error',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Assert expected exceptions, errors and throwables through the call and throw chain.',
          'pt-BR': 'Valide exceptions, errors e throwables esperados pela cadeia call e throw.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Throwers'
      },
      'pt-BR': {
        title: 'Throwers'
      }
    }
  },
  '/assertions/waiters': {
    config: {
      icon: 'timer',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Measure callable execution time and assert performance bounds with waiters.',
          'pt-BR': 'Meça tempo de execução de callables e valide limites de performance com waiters.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Waiters'
      },
      'pt-BR': {
        title: 'Waiters'
      }
    }
  },

  // Digging Deeper
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
  '/snapshots': {
    config: {
      icon: 'bookmark_added',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Capture and restore expected values for regression testing with Bootgly snapshots.',
          'pt-BR': 'Capture e restaure valores esperados para testes de regressão com snapshots do Bootgly.'
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
        title: 'Snapshots'
      },
      'pt-BR': {
        title: 'Snapshots'
      }
    }
  },
  '/hooks': {
    config: {
      icon: 'webhook',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Run setup, cleanup and instrumentation around Advanced API assertions with lifecycle hooks.',
          'pt-BR': 'Execute preparação, limpeza e instrumentação ao redor de asserções da API Avançada com hooks de ciclo de vida.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Hooks'
      },
      'pt-BR': {
        title: 'Hooks'
      }
    }
  },
  '/code-coverage': {
    config: {
      icon: 'analytics',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Measure test coverage with Bootgly coverage drivers and text, HTML or Clover reports.',
          'pt-BR': 'Meça cobertura de testes com os drivers de cobertura do Bootgly e relatórios em texto, HTML ou Clover.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Code Coverage'
      },
      'pt-BR': {
        title: 'Code Coverage'
      }
    }
  },
  '/doubles': {
    config: {
      icon: 'theater_comedy',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Use Mock, Spy and the Doubles registry to isolate collaborators and verify interactions.',
          'pt-BR': 'Use Mock, Spy e o registry Doubles para isolar colaboradores e verificar interações.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Doubles'
      },
      'pt-BR': {
        title: 'Doubles'
      }
    }
  },
  '/fakers': {
    config: {
      icon: 'casino',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Generate deterministic fake data with built-in fakers and seed-based output.',
          'pt-BR': 'Gere dados falsos determinísticos com fakers nativos e saída baseada em seed.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Fakers'
      },
      'pt-BR': {
        title: 'Fakers'
      }
    }
  },
  '/fixtures': {
    config: {
      icon: 'inventory_2',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Prepare, inject and dispose deterministic test state with Suite and Specification fixtures.',
          'pt-BR': 'Prepare, injete e descarte estado determinístico de teste com fixtures de Suite e Specification.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Fixtures'
      },
      'pt-BR': {
        title: 'Fixtures'
      }
    }
  }
}