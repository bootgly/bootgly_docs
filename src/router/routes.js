
const routes = [
  {
    path: '/Bootgly',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'play_arrow',
      status: 'draft',
      menu: {
        header: {
          icon: 'contact_support',
          name: 'Bootgly'
        }
      },
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'draft'
        }
      }
    ]
  },
  {
    path: '/Bootgly/structure/directory',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'account_tree',
      status: 'draft',
      menu: {
        subheader: 'Bootgly.structure'
      },
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'draft'
        }
      }
    ]
  },

  {
    path: '/CLI/Terminal/Input',
    component: () => import('layouts/DefaultLayout'),
    meta: {
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
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'draft'
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/Output',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'output',
      status: 'draft',
      menu: {
        separator: true
      },
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'draft'
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/Input/Mouse',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'mouse',
      status: 'empty',
      menu: {
        subheader: 'CLI.Terminal.Input'
      },
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'empty'
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/Output/Cursor',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'fas fa-i-cursor',
      status: 'empty',
      menu: {
        subheader: 'CLI.Terminal.Output'
      },
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'empty'
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/Output/Text',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'text_fields',
      status: 'empty',
      menu: {},
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'empty'
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/Output/Viewport',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'wysiwyg',
      status: 'empty',
      menu: {
        separator: true
      },
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'empty'
        }
      }
    ]
  },

  {
    path: '/CLI/Terminal/components/Alert',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'notification_important',
      status: 'empty',
      menu: {
        subheader: 'CLI.Terminal.components'
      },
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'empty'
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/components/Menu',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'menu',
      status: 'empty',
      menu: {},
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'empty'
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/components/Progress',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'downloading',
      status: 'empty',
      menu: {},
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'empty'
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/components/Table',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'table_chart',
      status: 'empty',
      menu: {},
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'empty'
        }
      }
    ]
  },
  {
    path: '/Web/interfaces/TCP_Client',
    component: () => import('layouts/DefaultLayout'),
    meta: {
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
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'empty'
        }
      }
    ]
  },
  {
    path: '/Web/interfaces/TCP_Server',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'dns',
      status: 'empty',
      menu: {},
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'empty'
        }
      }
    ]
  },
  {
    path: '/Web/nodes/HTTP_Server',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      icon: 'dns', // device_hub?
      status: 'empty',
      menu: {
        subheader: 'Web.nodes'
      },
      layouts: {
        footer: true
      },
      subpages: {
        samples: false
      }
    },
    children: [
      {
        path: 'overview',
        component: () => import('pages/components/OverviewPage'),
        meta: {
          status: 'empty'
        }
      }
    ]
  },

  {
    path: '/',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      layouts: {
        footer: false,
        submenu: false
      },
      pages: {}
    },
    children: [
      {
        path: '',
        component: () => import('pages/sources/BootPage'),
        meta: {
          icon: 'home',
          menu: 'home'
        }
      },
      {
        path: '/changelog',
        component: () => import('pages/sources/ChangelogPage'),
        meta: {
          icon: 'assignment',
          menu: 'changelog'
        }
      },
      {
        path: '/sponsor',
        component: () => import('pages/sources/SponsorPage'),
        meta: {
          icon: 'favorite',
          menu: 'sponsor'
        }
      }
    ]
  },

  {
    path: '/(.*)*',
    component: () => import('layouts/SystemLayout'),
    meta: {
      menu: {}
    },
    children: [
      {
        path: '',
        component: () => import('pages/sources/404Page')
      }
    ]
  }
]

export default routes
