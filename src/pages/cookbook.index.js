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
        title: 'Build a Console App'
      },
      'pt-BR': {
        title: 'Construa um Console App'
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
        title: 'Build a Console Game'
      },
      'pt-BR': {
        title: 'Construa um Console Game'
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
        title: 'Build a Web App on SQLite'
      },
      'pt-BR': {
        title: 'Construa um Web App em SQLite'
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
        title: 'Build a Web REST API'
      },
      'pt-BR': {
        title: 'Construa uma Web REST API'
      }
    }
  },
  '/web/shop': {
    config: {
      icon: 'storefront',
      status: 'new',
      meta: {
        description: {
          'en-US': 'Build Shop, a store on MySQL: catalogue with pagination, a session cart, a checkout in one transaction with row locks, ORM relations.',
          'pt-BR': 'Construa o Shop, uma loja em MySQL: catálogo com paginação, carrinho na sessão, checkout em uma transação com bloqueio de linhas, relações do ORM.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Build a Web App on MySQL'
      },
      'pt-BR': {
        title: 'Construa um Web App em MySQL'
      }
    }
  },
  '/web/polls': {
    config: {
      icon: 'how_to_vote',
      status: 'new',
      meta: {
        description: {
          'en-US': 'Build Polls, a voting app on PostgreSQL: one vote per visitor by upsert, RETURNING in a transaction, TIMESTAMPTZ, ORM relations.',
          'pt-BR': 'Construa o Polls, um app de votação em PostgreSQL: um voto por visitante via upsert, RETURNING em uma transação, TIMESTAMPTZ, relações do ORM.'
        }
      },
      menu: {},
      subpages: {
        showcase: false
      }
    },
    data: {
      'en-US': {
        title: 'Build a Web App on PostgreSQL'
      },
      'pt-BR': {
        title: 'Construa um Web App em PostgreSQL'
      }
    }
  }
}
