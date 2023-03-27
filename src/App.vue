<template lang="pug">
router-view
q-dialog(v-model="toogleDialog" :maximized="$q.platform.is.mobile ? true : false")
  q-layout.bg-white(view="Lhh lpR fff" container)
    q-header.bg-primary(elevated)
      q-toolbar.q-pr-none
        q-icon(name="settings" style="font-size: 1.5rem")
        q-toolbar-title {{ $t('menu.settings') }}
        q-btn.filled(v-close-popup text-color="white" icon="close")
    q-page-container
      q-page
        q-list
          q-item
            q-item-section
              q-item-label(header) {{ $t('settings.general._') }}
          q-item
            q-item-section(avatar)
              q-icon(name="language")
            q-item-section
              q-select(
                emit-value map-options
                v-model="settings.general.language.default" :label="$t('settings.general.language._')" :options="settings.general.language.options"
                @update:model-value="setLanguage")
                  template(v-slot:option="scope")
                    q-item(v-bind="scope.itemProps")
                      q-item-section(avatar)
                        q-avatar
                          q-img(:src="scope.opt.image" width="16px" height="16px")
                      q-item-section
                        q-item-label {{ scope.opt.label }}
                        //-q-item-label(caption) {{ scope.opt.description }}
                  template(v-slot:selected-item="scope")
                    q-item(dense @remove="scope.removeAtIndex(scope.index)" :tabindex="scope.tabindex")
                      q-item-section(avatar)
                        q-avatar
                          q-img(:src="scope.opt.image" width="16px" height="16px")
                      q-item-section
                        q-item-label {{ scope.opt.label }}
          q-separator
</template>

<script>
export default {
  name: 'App',

  data () {
    return {
      settings: {
        general: {
          language: {
            default: this.$q.localStorage.getItem('setting.language'),
            options: [
              {
                image: '/flags/united-states-of-america.png',
                label: 'English (US)',
                value: 'en-US'
              },
              {
                image: '/flags/brazil.png',
                label: 'Português (BR)',
                value: 'pt-BR'
              }
            ]
          }
        }
      }
    }
  },
  computed: {
    toogleDialog: {
      get () {
        return this.$store.getters['settings/dialog']
      },
      set (value) {
        return this.$store.commit('settings/dialog', value)
      }
    }
  },

  methods: {
    // Settings
    setLanguage (language) {
      this.$q.localStorage.set('setting.language', language)
      this.$i18n.locale = language
    }
  },

  mounted () {
    let locale = this.$q.localStorage.getItem('setting.language')

    if (locale === null) {
      locale = 'en-US'
      this.$q.localStorage.set('setting.language', locale)
    }

    this.$i18n.locale = locale
  }
}
</script>
