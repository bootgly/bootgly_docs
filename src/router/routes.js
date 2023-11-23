import pages from 'pages'

const pagesRoutes = []
for (const [path, page] of Object.entries(pages)) {
  const config = page.config
  if (config === null) {
    continue
  }

  const topPage = config.type ?? 'manual'

  // @ Construct children
  const children = [
    {
      path: 'overview',
      component: () => import('components/DSubpage'),
      meta: {
        status: config.status
      }
    }
  ]
  if (config?.subpages?.showcase === true) {
    children.push({
      path: 'showcase',
      component: () => import('components/DSubpage'),
      meta: {
        status: config.status
      }
    })
  }
  if (config?.subpages?.vs === true) {
    children.push({
      path: 'vs',
      component: () => import('components/DSubpage'),
      meta: {
        status: config.status
      }
    })
  }

  // @ Push route to pageRoutes
  pagesRoutes.push({
    path: '/' + topPage + path,
    component: () => import('layouts/DefaultLayout'),
    meta: {
      ...config,
      type: topPage
    },
    children
  })
}

const routes = [
  ...pagesRoutes,

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
        component: () => import('pages/@/BootPage'),
        meta: {
          icon: 'home',
          menu: 'home'
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
        component: () => import('pages/@/404Page')
      }
    ]
  }
]

export default routes
