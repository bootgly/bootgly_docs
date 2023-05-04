export default [
  // Bootgly
  {
    path: '/Bootgly/',
    config: null,
    data: {
      title: 'Bootgly'
    }
  },
  {
    path: '/Bootgly/about/what',
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
    }
  },
  {
    path: '/Bootgly/about/why',
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
    }
  },
  {
    path: '/Bootgly/basic/directory_structure',
    config: {
      icon: 'account_tree',
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
    }
  },
  {
    path: '/Bootgly/concepts/interfaces',
    config: {
      icon: 'link',
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
    }
  },
  // CLI
  {
    path: '/CLI/Terminal/Input',
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
    }
  },
  {
    path: '/CLI/Terminal/Output',
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
    }
  },
  {
    path: '/CLI/Terminal/Input/Mouse',
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
    }
  },
  {
    path: '/CLI/Terminal/Output/Cursor',
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
    }
  },
  {
    path: '/CLI/Terminal/Output/Text',
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
    }
  },
  {
    path: '/CLI/Terminal/Output/Viewport',
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
    }
  },
  {
    path: '/CLI/Terminal/components/Alert',
    config: {
      icon: 'notification_important',
      status: 'empty',
      menu: {
        subheader: 'CLI.Terminal.components'
      },
      layouts: {
        footer: true
      },
      subpages: {
        showcase: false
      }
    }
  },
  {
    path: '/CLI/Terminal/components/Menu',
    config: {
      icon: 'menu',
      status: 'empty',
      menu: {},
      layouts: {
        footer: true
      },
      subpages: {
        showcase: false
      }
    }
  },
  {
    path: '/CLI/Terminal/components/Progress',
    config: {
      icon: 'downloading',
      status: 'empty',
      menu: {},
      layouts: {
        footer: true
      },
      subpages: {
        showcase: false
      }
    }
  },
  {
    path: '/CLI/Terminal/components/Table',
    config: {
      icon: 'table_chart',
      status: 'empty',
      menu: {},
      layouts: {
        footer: true
      },
      subpages: {
        showcase: false
      }
    }
  },
  // Web
  {
    path: '/Web/interfaces/TCP_Client',
    config: {
      icon: 'desktop_windows',
      status: 'empty',
      menu: {
        header: {
          icon: 'language',
          name: 'Web'
        },
        subheader: 'Web.interfaces'
      },
      layouts: {
        footer: true
      },
      subpages: {
        showcase: false
      }
    }
  },
  {
    path: '/Web/interfaces/TCP_Server',
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
    }
  },
  {
    path: '/Web/nodes/HTTP_Server',
    config: {
      icon: 'dns', // device_hub?
      status: 'empty',
      menu: {
        subheader: 'Web.nodes'
      },
      layouts: {
        footer: true
      },
      subpages: {
        showcase: false
      }
    }
  }
]
