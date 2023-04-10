import { scroll } from 'quasar'

const { getScrollTarget, setVerticalScrollPosition } = scroll

export default {
  methods: {
    anchor (id, select = true) {
      this.$store.commit('page/setScrolling', false)

      // Convert to string
      id = '' + id

      const Anchor = document.getElementById(id)

      if (Anchor !== null && typeof Anchor === 'object') {
        const target = getScrollTarget(Anchor)
        const offset = Anchor.offsetTop - 40
        const duration = 300

        setVerticalScrollPosition(target, offset + 33, duration)

        setTimeout(() => {
          this.$store.commit('page/setScrolling', true)
        }, 600)
      }

      if (select) {
        this.select(id)
      }
    },
    select (id) {
      this.$store.commit('page/setAnchor', Number(id))
    },
    scrolling (scroll) {
      const scrolling = this.$store.state.page.scrolling

      if (!scrolling) {
        return
      }

      const position = scroll.position.top

      const anchors = this.$store.state.page.anchors
      const nodes = this.$store.state.page.nodes

      for (let i = 0; i < anchors.length; i++) {
        const children = nodes[0].children[i - 1]
        const id = (i > 0 && children !== undefined) ? (children.id) : (0)

        if (position >= anchors[i]) {
          this.select(id)
          this.push(id, false)
        }
      }
    },

    push (value, anchor = true) {
      if (anchor) {
        if (('#' + value) === this.$route.hash) {
          this.anchor(value)
          return
        } else if (value === null) {
          this.anchor(this.selected, false)
          return
        }
      }

      this.$router.push(this.$route.path + '#' + value)
      // TODO Prevent moving to the top on mobile devices by changing routes

      if (anchor) {
        if (this.$q.platform.is.desktop) {
          this.anchor(value)
        } else {
          setTimeout(() => {
            this.anchor(value)
          }, 600)
        }
      }
    }
  }
}
