
const routes = [
  {
    path: '/about/introduction',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      dir: '01-about/01-introduction',
      icon: 'play_arrow',
      status: 'draft',
      menu: {
        header: {
          icon: 'contact_support',
          name: 'about'
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
        path: '',
        component: () => import('pages/sources/default/OverviewPage'),
        meta: {
          status: 0
        }
      }
    ]
  },
  {
    path: '/about/structure/directory',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      dir: '01-about/02-directory-structure',
      icon: 'account_tree',
      status: 'draft',
      menu: {
        subheader: 'about.structure'
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
        path: '',
        component: () => import('pages/sources/default/OverviewPage'),
        meta: {
          status: 0
        }
      }
    ]
  },

  {
    path: '/CLI/Terminal/Input',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      dir: '01-CLI/01-Terminal/01-Input',
      icon: 'input',
      status: 'empty',
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
        path: '',
        component: () => import('pages/sources/default/OverviewPage'),
        meta: {
          status: 0
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/Output',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      dir: '01-CLI/01-Terminal/01-Input',
      icon: 'output',
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
        path: '',
        component: () => import('pages/sources/default/OverviewPage'),
        meta: {
          status: 0
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/Output/Cursor',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      dir: '01-CLI/01-Terminal/02-Output/01-Cursor',
      icon: 'mouse',
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
        path: '',
        component: () => import('pages/sources/default/OverviewPage'),
        meta: {
          status: 0
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/Output/Text',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      dir: '01-CLI/01-Terminal/02-Output/02-Text',
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
        path: '',
        component: () => import('pages/sources/default/OverviewPage'),
        meta: {
          status: 0
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/Output/Viewport',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      dir: '01-CLI/01-Terminal/02-Output/03-Viewport',
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
        path: '',
        component: () => import('pages/sources/default/OverviewPage'),
        meta: {
          status: 0
        }
      }
    ]
  },

  {
    path: '/CLI/Terminal/components/Alert',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      dir: '01-CLI/01-Terminal/02-Output/11-components/Alert',
      icon: 'add_alert',
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
        path: '',
        component: () => import('pages/sources/default/OverviewPage'),
        meta: {
          status: 0
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/components/Progress',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      dir: '01-CLI/01-Terminal/02-Output/11-components/Progress',
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
        path: '',
        component: () => import('pages/sources/default/OverviewPage'),
        meta: {
          status: 0
        }
      }
    ]
  },
  {
    path: '/CLI/Terminal/components/Table',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      dir: '01-CLI/01-Terminal/02-Output/11-components/Table',
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
        path: '',
        component: () => import('pages/sources/default/OverviewPage'),
        meta: {
          status: 0
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
