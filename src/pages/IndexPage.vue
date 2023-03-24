<template lang="pug">
q-page-container
  q-page#content.q-pa-lg(style="padding-bottom: 0")
    .text-center
      h1 Bootgly PHP Framework Documentation
        span.q-ml-sm.text-negative (WIP)
      p.caption
        span
          | {{ $t('_.home.texts[0]') }}
        a(href="https://github.com/bootgly/bootgly-php-framework/" target="_blank") Bootgly PHP Framework
        | !
      p.caption
        span
        | {{ $t('_.home.texts[1]') }}
        a(href="https://github.com/rodrigoslayertech/" target="_blank") @rodrigoslayertech
      hr

    div.row.no-wrap.justify-center.items-center.content-center(style="max-width: 735px; margin: auto;")
      q-carousel.col-12.text-center(
        v-model="slide", v-model:fullscreen="fullscreen"
        animated,
        swipeable,
        arrows,
        navigation, navigation-position="bottom"
        infinite,
        :autoplay="autoplay",
        control-type="push", control-color="black"
        height="68vh"
        transition-prev="slide-right", transition-next="slide-left"
      )
        template(v-slot:control)
          q-carousel-control(position="bottom-right", :offset="[24, 105]")
            q-btn(push, round, dense, color="white", text-color="primary", :icon="fullscreen ? 'fullscreen_exit' : 'fullscreen'", @click="fullscreen = !fullscreen")

        q-carousel-slide(
          :name="1",
        )
          div.carrousel-container
            q-scroll-area.fit(dark)
              q-img.rounded-borders.col-12.full-height(
                width="735"
                height="1302"
                src="https://github.com/bootgly/.github/raw/main/screenshots/bootgly-php-framework/Bootgly-HTTP-Server-Test-Suite5.png"
              )
          div.custom-caption.text-center.q-mt-sm
            div.text-h5 HTTP Server CLI - test cmd
            div.text-subtitle1 Test Suites
        q-carousel-slide(
          :name="2",
        )
          div.carrousel-container
            q-scroll-area.fit
              q-img.rounded-borders.col-12(
                width="820"
                height="355"
                src="https://raw.githubusercontent.com/bootgly/.github/main/screenshots/bootgly-php-framework/Server-CLI-HTTP-started.png"
              )
            div.custom-caption.text-center.q-mt-sm
              div.text-h5 HTTP Server CLI started
              div.text-subtitle1 Initial output
        q-carousel-slide(
          :name="3",
        )
          div.carrousel-container
            q-scroll-area.fit
              q-img.rounded-borders.col-12(
                width="647"
                height="204"
                src="https://github.com/bootgly/.github/raw/main/screenshots/bootgly-php-framework/Server-CLI-HTTP-Benchmark-Ryzen-9-3900X-WSL2.png"
              )
          div.custom-caption.text-center.q-mt-sm
            div.text-h5 HTTP Server CLI - Benchmark
            div.text-subtitle1 My Benchmark results using Ryzen 9 3900X (24 CPUs) on WSL2 - Simple 'Hello World!'
</template>

<script>
import { ref } from 'vue'

export default {
  setup () {
    return {
      slide: ref(1),
      autoplay: ref(false),
      fullscreen: ref(false)
    }
  }
}
</script>

<style lang="sass">
.carrousel-container
  height: calc(100% - 80px)

.q-carousel__navigation--bottom
  bottom: 95px

img.platform
  padding-top: 30px
  padding-bottom: 30px
</style>
