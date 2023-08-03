export default {
  // Bootgly
  '/Bootgly': {
    config: null,
    data: {
      '*': {
        title: 'Bootgly'
      }
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
      status: 'draft',
      menu: {
        header: {
          icon: 'contact_support',
          name: 'Bootgly'
        },
        subheader: 'Bootgly.about'
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
      status: 'draft',
      menu: {
        subheader: 'Bootgly.basic'
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
      status: 'empty',
      menu: {
        subheader: 'Bootgly.concepts'
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
  '/Bootgly/concepts/interfaces': {
    config: {
      icon: 'link',
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
        title: 'Interfaces'
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
  '/Bootgly/essential/get-starting': {
    config: {
      icon: 'star',
      status: 'draft',
      menu: {
        subheader: 'Bootgly.essential'
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
        title: 'Get starting'
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
  // CLI
  '/CLI': {
    config: null,
    data: {
      '*': {
        title: 'Bootgly CLI'
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
      menu: {
        header: {
          icon: 'terminal',
          name: 'CLI'
        }
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
        subheader: 'CLI.Terminal.Input'
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
        subheader: 'CLI.Terminal.Output'
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
        subheader: 'CLI.Terminal.components'
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
    config: null,
    data: {
      '*': {
        title: 'Bootgly WPI'
      }
    }
  },
  '/WPI/interfaces': {
    config: null,
    data: {
      '*': {
        title: 'interfaces'
      }
    }
  },
  '/WPI/interfaces/TCP_Client': {
    config: {
      icon: 'desktop_windows',
      status: 'empty',
      menu: {
        header: {
          icon: 'language',
          name: 'WPI'
        },
        subheader: 'WPI.interfaces'
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
  '/WPI/interfaces/TCP_Server': {
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
  '/WPI/nodes': {
    config: null,
    data: {
      '*': {
        title: 'nodes'
      }
    }
  },
  '/WPI/nodes/HTTP_Server': {
    config: {
      icon: 'dns', // device_hub?
      status: 'empty',
      menu: {
        subheader: 'WPI.nodes'
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
  }
}
