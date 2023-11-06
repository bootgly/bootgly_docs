export default {
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
        title: 'About'
      },
      'pt-BR': {
        title: 'Sobre'
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
      layouts: {
        footer: true
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
          _translations: 2,
          _sections: {
            count: 2,
            done: 2
          }
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
      layouts: {
        footer: true
      },
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
        title: 'Basic'
      },
      'pt-BR': {
        title: 'Básico'
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
      layouts: {
        footer: true
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
      status: 'draft',
      menu: {},
      layouts: {
        footer: true
      },
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
        title: 'Concepts'
      },
      'pt-BR': {
        title: 'Conceitos'
      }
    }
  },
  '/Bootgly/concepts/autoload-system': {
    config: {
      icon: 'flag',
      status: 'draft',
      menu: {
        subheader: '.Bootgly.concepts'
      },
      layouts: {
        footer: true
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
      status: 'draft',
      menu: {},
      layouts: {
        footer: true
      },
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
      status: 'draft',
      menu: {},
      layouts: {
        footer: true
      },
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
        title: 'Essential'
      },
      'pt-BR': {
        title: 'Essencial'
      }
    }
  },
  '/Bootgly/essential/getting-started': {
    config: {
      icon: 'star',
      status: 'draft',
      menu: {
        subheader: '.Bootgly.essential'
      },
      layouts: {
        footer: true
      },
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
  '/Bootgly/essential/projects': {
    config: {
      icon: 'create_new_folder',
      status: 'empty',
      menu: {},
      layouts: {
        footer: true
      },
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
  '/Bootgly/essential/debugging': {
    config: {
      icon: 'bug_report',
      status: 'empty',
      menu: {},
      layouts: {
        footer: true
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
  '/Bootgly/essential/testing': {
    config: {
      icon: 'science',
      status: 'empty',
      menu: {},
      layouts: {
        footer: true
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
      layouts: {
        footer: true
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
  '/CLI/Terminal': {
    config: null,
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
      layouts: {
        footer: true
      },
      subpages: {
        showcase: true
      }
    },
    data: {
      '*': {
        title: 'Terminal Input'
      }
    }
  },
  '/CLI/Terminal/Output': {
    config: {
      icon: 'output',
      status: 'draft',
      menu: {
        separator: true
      },
      layouts: {
        footer: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Terminal Output'
      }
    }
  },
  '/CLI/Terminal/Input/Mouse': {
    config: {
      icon: 'mouse',
      status: 'empty',
      menu: {
        subheader: '.CLI.Terminal.Input'
      },
      layouts: {
        footer: true
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
  '/CLI/Terminal/Output/Cursor': {
    config: {
      icon: 'fas fa-i-cursor',
      status: 'draft',
      menu: {
        subheader: '.CLI.Terminal.Output'
      },
      layouts: {
        footer: true
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
      layouts: {
        footer: true
      },
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
      menu: {
        separator: true
      },
      layouts: {
        footer: true
      },
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

  '/CLI/Terminal/components': {
    config: null,
    data: {
      '*': {
        title: 'Terminal components'
      }
    }
  },
  '/CLI/Terminal/components/Alert': {
    config: {
      icon: 'notification_important',
      status: 'draft',
      menu: {
        subheader: '.CLI.Terminal.components'
      },
      layouts: {
        footer: true
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
  '/CLI/Terminal/components/Field': {
    config: {
      icon: 'crop_square',
      status: 'draft',
      menu: {},
      layouts: {
        footer: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Field'
      }
    }
  },
  '/CLI/Terminal/components/Menu': {
    config: {
      icon: 'menu',
      status: 'draft',
      menu: {},
      layouts: {
        footer: true
      },
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
  '/CLI/Terminal/components/Progress': {
    config: {
      icon: 'downloading',
      status: 'draft',
      menu: {},
      layouts: {
        footer: true
      },
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
  '/CLI/Terminal/components/Table': {
    config: {
      icon: 'table_chart',
      status: 'draft',
      menu: {},
      layouts: {
        footer: true
      },
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
      layouts: {
        footer: true
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
  '/WPI/TCP': {
    config: null,
    data: {
      '*': {
        title: 'TCP'
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
      layouts: {
        footer: true
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
      layouts: {
        footer: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'TCP Server'
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
  '/WPI/HTTP/HTTP_Server': {
    config: {
      icon: 'dns', // device_hub?
      status: 'empty',
      menu: {
        subheader: '.WPI.HTTP',
        separator: true
      },
      layouts: {
        footer: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'HTTP Server'
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
      layouts: {
        footer: true
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
  '/WPI/HTTP/HTTP_Server_Response': {
    config: {
      icon: 'first_page',
      status: 'draft',
      menu: {},
      layouts: {
        footer: true
      },
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
      layouts: {
        footer: true
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      '*': {
        title: 'Routing'
      }
    }
  }
}
