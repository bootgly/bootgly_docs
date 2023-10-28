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
        .column.no-wrap.q-gutter-md
          .col-12
            q-img.rounded-borders(
              width="644"
              height="770"
              src="images/pages/Bootgly_Template_Engine-vs-Laravel_Blade.benchmark.jpg"
            )

        .carrousel-caption
          .text-h6 Bootgly Template Engine vs Laravel Blade
          .text-subtitle1 foreach in Bootgly is 9x faster than in Blade.
          .text-subtitle1
            | Source code coming soon to the Bootgly Benchmark repository on Github.
      q-carousel-slide(:name="1")
        .column.no-wrap.q-gutter-md
          .col-6
            q-img.rounded-borders(
              width="722"
              height="339"
              src="images/pages/Bootgly-Progress-Bar-component.png"
            )
          .col-6
            q-media-player.bg-black(type="video", :sources="videos[0].sources" @playing="autoplay = false")

        .carrousel-caption
          .text-h6 Bootgly CLI - Progress component
          .text-subtitle1 Render ≈7x faster than Symfony / Laravel
          .text-subtitle1
            a.q-ml-xs.q-mr-xs(:href="links[0]" target="_blank") Try it yourself

      q-carousel-slide(:name="2")
        q-img.rounded-borders.col-12(
          width="831"
          height="670"
          src="images/pages/Bootgly_WPI_-_HTTP_Server_CLI.png"
        )

        .carrousel-caption
          .text-h6 HTTP Server CLI started
          .text-subtitle1 Initial output

      q-carousel-slide(:name="3")
        q-img.rounded-borders.col-12(
          width="700"
          height="530"
          src="images/pages/Bootgly_CLI-Table_component.png"
        )

        .carrousel-caption
          .text-h6 Bootgly CLI - Table component
          .text-subtitle1 API with DataSet abstraction

      q-carousel-slide(:name="4")
        q-img.rounded-borders.col-12(
          width="647"
          height="204"
          src="images/pages/Server-CLI-HTTP-Benchmark-Ryzen-9-3900X-WSL2.png"
        )

        .carrousel-caption
          .text-h6 HTTP Server CLI - Benchmark
          .text-subtitle1 Benchmark results using Ryzen 9 3900X (24 CPUs) on WSL2 - Simple 'Hello World!'

      q-carousel-slide(:name="5")
        q-img.rounded-borders.col-12.full-height(
          width="760"
          height="1440"
          src="images/pages/Bootgly_test_command-Suite_filter_by_argument.png"
        )

        .carrousel-caption
          .text-h6 Bootgly CLI - test command output
          .text-subtitle1 Using argument to filter the suite to be tested

      q-carousel-slide(:name="6")
        q-img.rounded-borders.col-12.full-height(
          width="1118"
          height="456"
          src="images/pages/Bootgly_Debugging-Exception_reporting_with_file_content_highlighted.png"
        )

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
        'https://github.com/bootgly/bootgly_benchmarks/tree/main/progress_bar'
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
