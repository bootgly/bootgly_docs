export default {
  '/getting-started': {
    config: {
      icon: 'flag',
      status: 'draft',
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
      status: 'empty',
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
    }
  },
  '/Bootgly/essential/templating': {
    config: {
      icon: 'alternate_email',
      status: 'empty',
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Templating'
      }
    }
  },
  '/Bootgly/essential/testing': {
    config: {
      icon: 'science',
      status: 'empty',
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

  '/CLI/UI': {
    config: null,
    data: {
      '*': {
        title: 'CLI UI components'
      }
    }
  },
  '/CLI/UI/Alert': {
    config: {
      icon: 'notification_important',
      status: 'draft',
      menu: {
        subheader: '.CLI.UI'
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
  '/CLI/UI/Fieldset': {
    config: {
      icon: 'crop_square',
      status: 'draft',
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
  '/CLI/UI/Menu': {
    config: {
      icon: 'menu',
      status: 'draft',
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
  '/CLI/UI/Progress': {
    config: {
      icon: 'downloading',
      status: 'draft',
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
  '/CLI/UI/Table': {
    config: {
      icon: 'table_chart',
      status: 'draft',
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
  '/WPI/HTTP/HTTP_Server': {
    config: null,
    data: {
      '*': {
        title: 'WPI HTTP Server'
      }
    }
  },
  '/WPI/HTTP/HTTP_Servers': {
    config: {
      icon: 'dns', // device_hub?
      status: 'draft',
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
        title: 'HTTP Servers'
      }
    }
  },
  '/WPI/HTTP/HTTP_Server_CLI': {
    config: {
      icon: 'dns', // device_hub?
      status: 'empty',
      menu: {
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
  '/WPI/HTTP/HTTP_Server_Request': {
    config: {
      icon: 'last_page',
      status: 'draft',
      menu: {
        subheader: '.WPI.HTTP.HTTP_Server'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Request'
      }
    },
    meta: {
      'en-US': {
        overview: {
          _sections: {
            count: 11,
            done: null
          },
          _translations: 1
        }
      },
      'pt-BR': {}
    }
  },
  '/WPI/HTTP/HTTP_Server_Response': {
    config: {
      icon: 'first_page',
      status: 'draft',
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
  '/WPI/HTTP/HTTP_Server_Router': {
    config: {
      icon: 'alt_route',
      status: 'draft',
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
  '/WPI/HTTP/HTTP_Server_Middlewares': {
    config: {
      icon: 'settings_input_component',
      status: 'empty',
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
