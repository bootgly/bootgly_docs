
const routes = [
  {
    path: '/about/introduction',
    component: () => import('layouts/DefaultLayout'),
    meta: {
      dir: '0-about/1-introduction',
      icon: 'grade',
      status: 'empty',

      menu: {
        header: {
          icon: 'contact_support',
          name: 'about'
        }
      },
      layouts: {
        footer: true
      },
      pages: {
        samples: true
      }
    },

    children: [
      {
        path: '',
        component: () => import('pages/sources/default/OverviewPage'),
        meta: {
          status: 0,
          anchors: [
            {
              id: 0
              /*
              children: [
                {
                  id: 1
                },
                {
                  id: 2
                }
              ]
              */
            }
          ]
        }
      },

      {
        path: 'samples',
        component: () => import('pages/sources/default/SamplesPage'),
        meta: {
          status: 0,
          anchors: [
            {
              id: 0
              /*
              children: [
                {
                  id: 1
                },
                {
                  id: 2
                }
              ]
              */
            }
          ]
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
      },

      {
        path: '*',
        component: () => import('pages/sources/404Page'),
        meta: {
          menu: '_404'
        }
      }
    ]
  }
]

export default routes
