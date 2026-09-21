export default {
  // About
  '/about': {
    config: null,
    data: {
      'en-US': {
        title: 'Cookbook'
      },
      'pt-BR': {
        title: 'Cookbook'
      }
    }
  },
  '/about/cookbook': {
    config: {
      icon: 'restaurant_menu',
      status: 'new',
      meta: {
        description: {
          'en-US': 'Real projects built step by step on each Bootgly platform — from an empty machine to a running app.',
          'pt-BR': 'Projetos reais construídos passo a passo em cada plataforma do Bootgly — de uma máquina vazia a um app rodando.'
        }
      },
      menu: {
        subheader: '.about'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'What is the Cookbook?'
      },
      'pt-BR': {
        title: 'O que é o Cookbook?'
      }
    }
  },

  // Console
  '/console': {
    config: null,
    data: {
      'en-US': {
        title: 'Cookbook - Console'
      },
      'pt-BR': {
        title: 'Cookbook - Console'
      }
    }
  },
  '/console/monitor': {
    config: {
      icon: 'monitor_heart',
      status: 'new',
      meta: {
        description: {
          'en-US': 'Build Monitor, a live system dashboard in the terminal: screens, keymaps, status bar and tables over /proc.',
          'pt-BR': 'Construa o Monitor, um dashboard de sistema ao vivo no terminal: telas, atalhos, barra de status e tabelas sobre o /proc.'
        }
      },
      menu: {
        subheader: '.console'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Monitor'
      },
      'pt-BR': {
        title: 'Monitor'
      }
    }
  },
  '/console/breakout': {
    config: {
      icon: 'sports_esports',
      status: 'new',
      meta: {
        description: {
          'en-US': 'Build Breakout, a terminal game: fixed-timestep loop, diff-rendered canvas, held keys, scenes and collisions.',
          'pt-BR': 'Construa o Breakout, um jogo de terminal: loop de passo fixo, canvas com diff, teclas seguradas, cenas e colisões.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Breakout'
      },
      'pt-BR': {
        title: 'Breakout'
      }
    }
  },

  // Web
  '/web': {
    config: null,
    data: {
      'en-US': {
        title: 'Cookbook - Web'
      },
      'pt-BR': {
        title: 'Cookbook - Web'
      }
    }
  },
  '/web/guestbook': {
    config: {
      icon: 'edit_note',
      status: 'new',
      meta: {
        description: {
          'en-US': 'Build Guestbook, an MVC web app: a form, a list, SQLite migrations, CSRF, a layout and static assets.',
          'pt-BR': 'Construa o Guestbook, um app web MVC: um formulário, uma lista, migrations SQLite, CSRF, um layout e assets estáticos.'
        }
      },
      menu: {
        subheader: '.web'
      },
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Guestbook'
      },
      'pt-BR': {
        title: 'Guestbook'
      }
    }
  },
  '/web/contacts': {
    config: {
      icon: 'contacts',
      status: 'new',
      meta: {
        description: {
          'en-US': 'Build Contacts, a REST API: JSON CRUD, validation, problem+json errors, pagination and SQLite.',
          'pt-BR': 'Construa o Contacts, uma API REST: CRUD em JSON, validação, erros problem+json, paginação e SQLite.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Contacts'
      },
      'pt-BR': {
        title: 'Contacts'
      }
    }
  }
}
