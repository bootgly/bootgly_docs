<template lang="pug">
q-tree(
  v-model:selected="selected"
  v-model:expanded="expanded"
  default-expand-all
  :class="stylize"
  :nodes="nodes"
  node-key="id"
)
  template(v-slot:default-header="props")
    b(v-if="props.node.label")
      | {{ props.node.label }}
    b(v-else)
      | {{ $t(`_.${$store.state.i18n.base}._`) }}
</template>

<script>
import Navigator from 'pages/bootables/navigator'

export default {
  name: 'DPageAnchor',

  mixins: [Navigator],

  computed: {
    nodes () {
      const nodes = this.$store.getters['page/nodes']
      return nodes
    },
    expanded () {
      const nodesExpanded = this.$store.getters['page/nodesExpanded']
      return nodesExpanded
    },
    selected: {
      get () {
        let anchor = this.$store.state.page.anchor

        if (this.$store.state.page.relative !== '' && anchor === 0) {
          anchor = anchor + 1
        }

        // console.log('Anchor: ', this.$store.state.page.relative, anchor)

        return anchor
      },
      set (value) {
        this.navigate(value)
      }
    },
    stylize () {
      if (this.$q.platform.is.mobile && !this.$q.screen.lt.lg) {
        return 'fixed'
      } else {
        return 'q-ma-xs'
      }
    }
  },

  // @ Methods
  methods: {
    getNodeLabel () {}
  },
  // @ Events
  mounted () {
    this.$store.commit('layout/setMetaToggle', true)

    setTimeout(() => {
      this.$store.commit('page/setScrolling', true)
    }, 1000)

    const id = this.$route.hash.replace(/^\D+/g, '')
    if (id === (Number(id) + '')) {
      setTimeout(() => {
        this.anchor(id)
      }, 500)
    }
  },

  beforeUnmount () {
    // console.log('DPageAnchor beforeUnmount!')

    this.$store.commit('layout/setMetaToggle', false)

    this.$store.commit('page/resetAnchor')
    this.$store.commit('page/resetAnchors')
    this.$store.commit('page/resetNodes')

    this.$store.commit('page/setScrolling', false)
  }
}
</script>

<style lang="sass">
#anchor
  .q-tree
    padding-top: 12px
    width: 100%
  .q-tree-node-header
    margin: 0
    border-radius: 0
  .q-tree__node--selected
    background-color: peachpuff

body.body--light
  #anchor
    b
      color: #1A496B
      font-size: 15px
body.body--dark
  #anchor
    b
      color: #0094ff
      font-size: 15px
</style>
