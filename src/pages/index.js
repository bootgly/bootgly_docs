export default {
  '/getting-started': {
    config: {
      icon: 'flag',
      status: 'draft',
      meta: {
        description: {
          'en-US': 'Getting started — Documentation of Bootgly',
          'pt-BR': 'Começando — Documentacao do Bootgly'
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
          'en-US': 'What is Bootgly? — Documentation of Bootgly',
          'pt-BR': 'O que é Bootgly? — Documentacao do Bootgly'
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
          'en-US': 'Why Bootgly? — Documentation of Bootgly',
          'pt-BR': 'Por quê Bootgly? — Documentacao do Bootgly'
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
          'en-US': 'Architecture — Documentation of Bootgly',
          'pt-BR': 'Arquitetura — Documentacao do Bootgly'
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
          'en-US': 'Directory Structure — Documentation of Bootgly',
          'pt-BR': 'Estrutura de diretórios — Documentacao do Bootgly'
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
          '*': 'Autoload system — Documentation of Bootgly'
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
          '*': 'Bootstrap files — Documentation of Bootgly'
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
          '*': 'Git repositories — Documentation of Bootgly'
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
          'en-US': 'Debugging — Documentation of Bootgly',
          'pt-BR': 'Debugando — Documentacao do Bootgly'
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
          'en-US': 'Projects — Documentation of Bootgly',
          'pt-BR': 'Projetos — Documentacao do Bootgly'
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
          'en-US': 'Testing — Documentation of Bootgly',
          'pt-BR': 'Testando — Documentacao do Bootgly'
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

  // CLI
  '/CLI': {
    config: {
      icon: 'terminal',
      status: 'draft',
      meta: {
        description: {
          '*': 'Command Line Interface — Documentation of Bootgly'
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
          '*': 'Commands — Documentation of Bootgly'
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
          '*': 'Scripts — Documentation of Bootgly'
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
          '*': 'Terminal — Documentation of Bootgly'
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
          '*': 'CLI Terminal Input — Documentation of Bootgly'
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
          '*': 'CLI Terminal Output — Documentation of Bootgly'
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
          '*': 'CLI Terminal Reporting — Documentation of Bootgly'
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
          '*': 'Keystrokes — Documentation of Bootgly'
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
          '*': 'Mousestrokes — Documentation of Bootgly'
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
          '*': 'Cursor — Documentation of Bootgly'
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
          '*': 'Text — Documentation of Bootgly'
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
          '*': 'Viewport — Documentation of Bootgly'
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
          '*': 'Mouse — Documentation of Bootgly'
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
          '*': 'Alert — Documentation of Bootgly'
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
          '*': 'Fieldset — Documentation of Bootgly'
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
          '*': 'Menu — Documentation of Bootgly'
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
          '*': 'Progress — Documentation of Bootgly'
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
          '*': 'Table — Documentation of Bootgly'
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

  // WPI
  '/WPI': {
    config: {
      icon: 'language',
      status: 'draft',
      meta: {
        description: {
          '*': 'Web Programming Interface — Documentation of Bootgly'
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
        title: 'WPI HTTP'
      }
    }
  },
  '/WPI/HTTP/HTTP_Server_CLI': {
    config: {
      icon: 'dns',
      status: 'draft',
      meta: {
        description: {
          '*': 'HTTP Server CLI — Documentation of Bootgly'
        }
      },
      menu: {
        subheader: '.WPI.HTTP',
        separator: true
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
          '*': 'Request — Documentation of Bootgly'
        }
      },
      menu: {
        subheader: '.WPI.HTTP.HTTP_Server_CLI'
      },
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
          '*': 'Response — Documentation of Bootgly'
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
          '*': 'Routing — Documentation of Bootgly'
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
          '*': 'Middlewares — Documentation of Bootgly'
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
          '*': 'HTTP Client CLI — Documentation of Bootgly'
        }
      },
      menu: {
        subheader: '.WPI.HTTP.HTTP_Client_CLI'
      },
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
          '*': 'Request — Documentation of Bootgly'
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
          '*': 'Response — Documentation of Bootgly'
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
        title: 'WPI TCP'
      }
    }
  },
  '/WPI/TCP/TCP_Client': {
    config: {
      icon: 'desktop_windows',
      status: 'empty',
      meta: {
        description: {
          '*': 'TCP Client — Documentation of Bootgly'
        }
      },
      menu: {
        subheader: '.WPI.TCP'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'TCP Client'
      }
    }
  },
  '/WPI/TCP/TCP_Server': {
    config: {
      icon: 'dns',
      status: 'empty',
      meta: {
        description: {
          '*': 'TCP Server — Documentation of Bootgly'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'TCP Server'
      }
    }
  }
}
