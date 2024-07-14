<template lang="pug">
//- Menu Separator - Header
//- q-item-section.label.header.sticky(v-if="subitem.meta.menu.header" :style="getMenuItemHeaderBackground()" role="listitem")
//-   q-item-label(header)
//-     q-icon(:name="subitem.meta.menu.header.icon" size="1.5rem")
//-     | {{ getMenuItemHeaderLabel(subitem.meta) }}
//-   q-separator.separator.partial(role="separator")

//- Menu Separator - Subheader
q-item-section(v-if="subitem.meta.menu.subheader")
  q-item-label.label.subheader(header)
    | {{ getMenuItemSubheader(subitem.meta) }}

q-item(
  :to="subitem.path + '/overview'"
  :active="subitem.path + subpage === $route.path"
  v-show="founds[subitem.path] || !founds"
)
  q-item-section(side)
    q-icon(v-if="subitem.meta.icon" :name="subitem.meta.icon")
  q-item-section
    | {{ getMenuItemLabel(subitem, subindex) }}
  q-item-section.page-status(v-if="subitem.meta.status !== 'done'" side)
    q-badge(
      :text-color="getPageStatusTextColor(subitem.meta.status)"
      :color="getPageStatusColor(subitem.meta.status)"
      :label="getPageStatusText(subitem.meta.status)"
    )
    q-tooltip(:hide-delay="3") {{ getPageStatusTooltip(subitem.meta.status) }}

//- Menu Separator
li(v-if="subitem.meta.menu.separator" role="listitem")
  q-separator(
    :class="'separator' + (subitem.meta.menu.separator === true ? '' : subitem.meta.menu.separator)"
    role="separator"
  )
</template>

<script>
export default {
  name: 'DMenuItem',

  props: {
    items: {
      type: Number,
      required: true
    },
    subitem: {
      type: Object,
      required: true
    },
    subindex: {
      type: Number,
      required: true
    },

    subpage: {
      type: String,
      required: true
    },

    founds: {
      type: [Boolean, Array],
      required: true
    }
  },
  data () {
    return {}
  },
  computed: {},

  methods: {
    getMenuItemHeaderBackground () {
      return this.$q.dark.isActive ? 'background-color: #1D1D1D !important' : 'background-color: #f5f5f5 !important'
    },
    getMenuItemLabel (item, index) {
      // if (this.loaded) return

      if (index === this.items - 1) {
        this.loaded = true
      }

      const path = `_${item.path.replace(/_$/, '').replace(/\//g, '.')}._`
      // console.log(path)
      // TODO fix re-render at menu scrolling?! Lol
      if (this.$te(path)) {
        return this.$t(path)
      } else {
        return this.$t(path, 'en-US')
      }
    },
    getMenuItemSubheader (meta) {
      const subheader = meta.menu.subheader
      const path = `_.${meta.type}${subheader}._`

      if (this.$te(path)) {
        return this.$t(path)
      } else {
        return this.$t(path, 'en-US')
      }
    },

    getPageStatusText (status) {
      if (status === 'draft') {
        return this.$t('menu.status.draft._')
      } else {
        return this.$t('menu.status.empty._')
      }
    },
    getPageStatusTextColor (status) {
      if (status === 'draft') {
        return 'dark'
      } else {
        return 'white'
      }
    },
    getPageStatusColor (status) {
      if (status === 'draft') {
        return 'orange'
      } else {
        return 'red'
      }
    },
    getPageStatusTooltip (status) {
      if (status === 'draft') {
        return this.$t('menu.status.draft.tooltip')
      } else {
        return this.$t('menu.status.empty.tooltip')
      }
    },
  }
}
</script>
