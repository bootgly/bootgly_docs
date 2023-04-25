import { scroll } from 'quasar'

const { getScrollTarget, setVerticalScrollPosition } = scroll

export default {
  methods: {
    // @ Boot
    register () {
      // console.log('anchor.register(id): ', this.id)

      this.$store.commit('page/pushAnchors', this.id)
    },
    index (child = false) {
      // console.log('index: ', this.id)

      this.$store.commit('page/pushNodes', {
        id: this.id,
        label: this.value,
        child,
        children: []
      })
    },

    anchor (id, select = true) {
      this.$store.commit('page/setScrolling', false)

      // Convert to string
      id = '' + id

      const Anchor = document.getElementById(id)

      if (Anchor !== null && typeof Anchor === 'object') {
        const ScrollTarget = getScrollTarget(Anchor)
        const AnchorOffsetTop = Anchor.offsetTop - 40

        setVerticalScrollPosition(ScrollTarget, AnchorOffsetTop, 300)

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
      this.$store.commit('page/pushNodesExpanded', Number(id))
    },
    scrolling (scroll) {
      const scrolling = this.$store.state.page.scrolling

      if (!scrolling) {
        return
      }

      const scrollPositionTop = scroll.position.top + 50

      const anchors = this.$store.state.page.anchors

      for (let i = 0; i < anchors.length; i++) {
        const anchorId = anchors[i]

        const Anchor = document.getElementById(anchorId)
        let AnchorOffsetTop = 20
        if (Anchor !== null && typeof Anchor === 'object') {
          AnchorOffsetTop = Anchor.offsetTop
        }

        if (scrollPositionTop >= AnchorOffsetTop) {
          this.select(anchorId)
          this.navigate(anchorId, false)
        }
      }
    },

    navigate (value, anchor = true) {
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
