
const routes = [
  /*
  {
    path: '/starting/introduction',
    component: () => import('layouts/default'),
    meta: {
      dir: '0-starting/1-introduction',
      icon: 'grade',
      status: 0,

      menu: {
        header: {
          icon: 'contact_support',
          name: 'starting'
        }
      },
      layouts: {},
      pages: {
        showcase: false
      }
    },

    children: [
      {
        path: '',
        component: () => import('pages/0-starting/1-introduction/'),
        meta: {
          status: 0
        }
      }
    ]
  },
  */

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
        component: () => import('pages/IndexPage'),
        meta: {
          icon: 'home',
          menu: 'home'
        }
      },
      {
        path: '/changelog',
        component: () => import('pages/ChangelogPage'),
        meta: {
          icon: 'assignment',
          menu: 'changelog'
        }
      },
      {
        path: '/sponsor',
        component: () => import('pages/SponsorPage'),
        meta: {
          icon: 'favorite',
          menu: 'sponsor'
        }
      },
      {
        path: '*',
        component: () => import('pages/404Page'),
        meta: {
          menu: '_404'
        }
      }
    ]
  }
]

export default routes
