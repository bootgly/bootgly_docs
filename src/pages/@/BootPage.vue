<template lang="pug">
q-page-container
  q-page.content
    .text-center.q-pa-xs.q-pt-md
      h1 Bootgly PHP Framework Documentation
        span.q-ml-sm.text-negative (WIP)

      p.caption.text-negative
        | {{ $t('_.home.texts[2]') }}
      p.caption
        | {{ $t('_.home.texts[0]') }}
        a(href="https://github.com/bootgly/bootgly-php-framework/" target="_blank") Bootgly PHP Framework
        | !
      p.caption
        | {{ $t('_.home.texts[1]') }}
        a(href="https://github.com/rodrigoslayertech/" target="_blank") Rodrigo Vieira
      hr

    q-carousel.content.col-12.text-center(
      v-model="slide", v-model:fullscreen="fullscreen"
      animated,
      swipeable,
      navigation, navigation-position="top"
      infinite,
      :autoplay="autoplay",
      control-type="push", control-color="primary"
      transition-prev="slide-right", transition-next="slide-left"
      :height="fullscreen ? '100vh' : ''"
      style="max-width: 735px; margin: auto; height: auto"
    )
      template(v-slot:navigation-icon="{ active, btnProps, onClick }")
        q-btn(v-if="active" size="md" icon="radio_button_checked" color="primary" flat round dense @click="onClick")
        q-btn(v-else size="sm" icon="radio_button_unchecked" flat round dense @click="onClick")

      template(v-slot:control)
        q-carousel-control(v-if="$q.platform.is.mobile" position="top-right", :offset="[18, 5]")
          q-btn(
            push, round, dense,
            color="white", text-color="primary", :icon="fullscreen ? 'fullscreen_exit' : 'fullscreen'",
            @click="fullscreen = !fullscreen"
          )

      q-carousel-slide(:name="0")
        q-img.col-12rounded-borders(width="644" height="770" :src="images[0].src")
        .carrousel-caption
          .text-h6 Bootgly Template Engine vs Laravel Blade
          .text-subtitle1 foreach in Bootgly is 9x faster than in Blade.
          .text-subtitle1
            | Source code coming soon to the Bootgly Benchmark repository on Github.
      q-carousel-slide(:name="1")
        .column.no-wrap.q-gutter-md
          .col-6
            q-img.rounded-borders(width="610" height="262" :src="images[1].src")
          .col-6
            q-media-player.bg-black(type="video", :sources="videos[0].sources" @playing="autoplay = false")
        .carrousel-caption
          .text-h6 Bootgly CLI - UI Progress component
          .text-subtitle1 Render ≈7x faster than Symfony / Laravel
          .text-subtitle1
            a.q-ml-xs.q-mr-xs(:href="links[0]" target="_blank") Try it yourself

      q-carousel-slide(:name="2")
        q-img.rounded-borders.col-12(width="734" height="543" :src="images[2].src")
        .carrousel-caption
          .text-h6 HTTP Server CLI started
          .text-subtitle1 Initial output

      q-carousel-slide(:name="3")
        q-img.rounded-borders.col-12(width="537" height="553" :src="images[3].src")
        .carrousel-caption
          .text-h6 Bootgly CLI - Table component
          .text-subtitle1 API with DataSet abstraction

      q-carousel-slide(:name="4")
        q-img.rounded-borders.col-12(width="588" height="231" :src="images[4].src")
        .carrousel-caption
          .text-h6 HTTP Server CLI - Benchmark
          .text-subtitle1 Benchmark results using Ryzen 9 3900X (24 CPUs) on WSL2 - Simple 'Hello World!'

      q-carousel-slide(:name="5")
        q-img.rounded-borders.col-12(width="682" height="1418" :src="images[5].src")
        .carrousel-caption
          .text-h6 Bootgly CLI - test command output
          .text-subtitle1 Using argument to filter the suite to be tested

      q-carousel-slide(:name="6")
        q-img.rounded-borders.col-12(width="831" height="578" :src="images[6].src")

        .carrousel-caption
          .text-h6 Bootgly Debugging - Exception reporting
          .text-subtitle1 With file content highlighted and stack trace
</template>

<script>
import { useQuasar } from 'quasar'

import { ref } from 'vue'

export default {
  setup () {
    const $q = useQuasar()

    // TODO make the Carrousel a custom component?

    return {
      $q,

      slide: ref(0),
      autoplay: ref(10000),
      fullscreen: ref(false),

      links: [
        'https://github.com/bootgly/bootgly_benchmarks/tree/main/Progress_Bar'
      ],
      images: [
        { // 1 - OK
          src: 'images/pages/@/1-Bootgly_Template_Engine-vs-Laravel_Blade.benchmark.jpg'
        },
        { // 2 - OK
          src: 'images/pages/@/2-Bootgly-CLI-UI-Progress_component.png'
        },
        { // 3 - OK
          src: 'images/pages/@/3-Bootgly-CLI.png'
        },
        { // 4 - OK
          src: 'images/pages/@/4-Bootgly_CLI-UI-Table_component.png'
        },
        { // 5 - OK
          src: 'images/pages/@/5-Server-CLI-HTTP-Benchmark-Ryzen-9-3900X-WSL2.png'
        },
        { // 6 - OK
          src: 'images/pages/@/6-Bootgly_test_command-Suite_filter_by_argument.png'
        },
        { // 7 - OK
          src: 'images/pages/@/7-Bootgly_Debugging-Exception_reporting_with_file_content_highlighted.png'
        }
      ],
      videos: [
        {
          sources: [
            {
              src: 'videos/pages/Bootgly_CLI_-_Progress_with_Bar_component_vs_Symfony_Console_-_ProgressBar_Helper.mp4',
              type: 'video/mp4'
            }
          ]
        }
      ]
    }
  }
}
</script>

<style lang="sass">
.q-carousel__navigation-inner
  padding-top: 7px
.q-carousel__slides-container
  height: 100%
  padding-top: 30px
.q-carousel__slide, .q-carousel .q-carousel--padding
  padding-bottom: 0

.q-carousel__navigation
  top: -5px
.carrousel-caption
  text-align: center
  margin-top: 8px
  margin-bottom: 8px

img.platform
  padding-top: 30px
  padding-bottom: 30px
</style>
