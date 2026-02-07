<template>
  <q-page-container>
    <q-page class="content">
      <div class="text-center q-pa-xs q-pt-md">
        <h1>
          Bootgly Framework Documentation
          <span class="q-ml-sm text-negative">(WIP)</span>
        </h1>

        <p class="caption text-negative">
          {{ $t('_.home.texts[2]') }}
        </p>
        <p class="caption">
          {{ $t('_.home.texts[0]') }}
          <a href="https://github.com/bootgly/bootgly-php-framework/" target="_blank">Bootgly PHP Framework</a>!
        </p>
        <p class="caption">
          {{ $t('_.home.texts[1]') }}
          <a href="https://github.com/rodrigoslayertech/" target="_blank">Rodrigo Vieira</a>
        </p>
        <hr>
      </div>

      <q-carousel
        v-model="slide"
        v-model:fullscreen="fullscreen"
        class="content col-12 text-center"
        animated
        swipeable
        navigation
        navigation-position="top"
        infinite
        :autoplay="autoplay"
        control-type="push"
        control-color="primary"
        transition-prev="slide-right"
        transition-next="slide-left"
        :height="fullscreen ? '100vh' : ''"
        style="max-width: 735px; margin: auto; height: auto"
      >
        <template #navigation-icon="{ active, btnProps, onClick }">
          <q-btn
            v-if="active"
            size="md"
            icon="radio_button_checked"
            color="primary"
            flat
            round
            dense
            @click="onClick"
          />
          <q-btn
            v-else
            size="sm"
            icon="radio_button_unchecked"
            flat
            round
            dense
            @click="onClick"
          />
        </template>

        <template #control>
          <q-carousel-control position="top-left" :offset="[18, 5]">
            <q-btn
              push
              round
              dense
              color="white"
              text-color="primary"
              :icon="autoplay === 0 ? 'play_circle' : 'pause_circle'"
              @click="autoplay === 0 ? autoplay = 1000 : autoplay = 0"
            />
          </q-carousel-control>
          <q-carousel-control
            v-if="$q.platform.is.mobile"
            position="top-right"
            :offset="[18, 5]"
          >
            <q-btn
              push
              round
              dense
              color="white"
              text-color="primary"
              :icon="fullscreen ? 'fullscreen_exit' : 'fullscreen'"
              @click="fullscreen = !fullscreen"
            />
          </q-carousel-control>
        </template>

        <q-carousel-slide :name="0">
          <q-img
            class="col-12 rounded-borders"
            width="644"
            height="770"
            :src="images[0].src"
          />
          <div class="carrousel-caption">
            <div class="text-h6">Bootgly Template Engine vs Laravel Blade</div>
            <div class="text-subtitle1">foreach in Bootgly is 9x faster than in Blade.</div>
            <div class="text-subtitle1">
              <a class="q-ml-xs q-mr-xs" :href="links[0]" target="_blank">Compare yourself</a>
            </div>
          </div>
        </q-carousel-slide>

        <q-carousel-slide :name="1">
          <div class="column no-wrap q-gutter-md">
            <div class="col-6">
              <q-img class="rounded-borders" width="610" height="262" :src="images[1].src" />
            </div>
            <div class="col-6">
              <video
                class="bg-black rounded-borders"
                style="width: 100%"
                controls
                preload="metadata"
                @play="autoplay = 0"
              >
                <source :src="videos[0].sources[0].src" :type="videos[0].sources[0].type" />
              </video>
            </div>
          </div>
          <div class="carrousel-caption">
            <div class="text-h6">Bootgly CLI - UI Progress component</div>
            <div class="text-subtitle1">Render ≈7x faster than Symfony / Laravel</div>
            <div class="text-subtitle1">
              <a class="q-ml-xs q-mr-xs" :href="links[1]" target="_blank">Compare yourself</a>
            </div>
          </div>
        </q-carousel-slide>

        <q-carousel-slide :name="2">
          <q-img class="rounded-borders col-12" width="834" height="829" :src="images[2].src" />
          <div class="carrousel-caption">
            <div class="text-h6">HTTP Server CLI started</div>
            <div class="text-subtitle1">Initial output</div>
          </div>
        </q-carousel-slide>

        <q-carousel-slide :name="3">
          <q-img class="rounded-borders col-12" width="537" height="553" :src="images[3].src" />
          <div class="carrousel-caption">
            <div class="text-h6">Bootgly CLI - Table component</div>
            <div class="text-subtitle1">API with DataSet abstraction</div>
          </div>
        </q-carousel-slide>

        <q-carousel-slide :name="4">
          <q-img class="rounded-borders col-12" width="588" height="231" :src="images[4].src" />
          <div class="carrousel-caption">
            <div class="text-h6">HTTP Server CLI - Benchmark</div>
            <div class="text-subtitle1">Benchmark results using Ryzen 9 3900X (24 CPUs) on WSL2 - Simple 'Hello World!'</div>
          </div>
        </q-carousel-slide>

        <q-carousel-slide :name="5">
          <q-img class="rounded-borders col-12" width="682" height="1418" :src="images[5].src" />
          <div class="carrousel-caption">
            <div class="text-h6">Bootgly CLI - test command output</div>
            <div class="text-subtitle1">Using argument to filter the suite to be tested</div>
          </div>
        </q-carousel-slide>

        <q-carousel-slide :name="6">
          <q-img class="rounded-borders col-12" width="831" height="578" :src="images[6].src" />
          <div class="carrousel-caption">
            <div class="text-h6">Bootgly Debugging - Exception reporting</div>
            <div class="text-subtitle1">With file content highlighted and stack trace</div>
          </div>
        </q-carousel-slide>
      </q-carousel>
      <hr>
      <div class="q-pa-md" style="max-width: 700px; margin: 0 auto;">
        <h3 class="text-center q-mb-md">Quick Links</h3>

        <q-list bordered separator class="rounded-borders">
          <q-item clickable to="/guide/getting-started/overview">
            <q-item-section avatar>
              <q-icon name="flag" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Getting Started</q-item-label>
              <q-item-label caption>Installation, setup, and first steps</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>

          <q-item clickable to="/manual/Bootgly/basic/architecture/overview">
            <q-item-section avatar>
              <q-icon name="developer_board" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Architecture</q-item-label>
              <q-item-label caption>Interfaces, layers, and modular design</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>

          <q-item clickable to="/manual/CLI/overview">
            <q-item-section avatar>
              <q-icon name="terminal" color="secondary" />
            </q-item-section>
            <q-item-section>
              <q-item-label>CLI</q-item-label>
              <q-item-label caption>Commands, Scripts, Terminal I/O, UI Components</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>

          <q-item clickable to="/manual/WPI/overview">
            <q-item-section avatar>
              <q-icon name="language" color="secondary" />
            </q-item-section>
            <q-item-section>
              <q-item-label>WPI</q-item-label>
              <q-item-label caption>HTTP Server, Router, TCP Client/Server</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>

          <q-item clickable to="/manual/Bootgly/essential/testing/overview">
            <q-item-section avatar>
              <q-icon name="science" color="accent" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Testing</q-item-label>
              <q-item-label caption>Built-in test framework and test command</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>

          <q-item clickable to="/manual/Bootgly/essential/templating/overview">
            <q-item-section avatar>
              <q-icon name="alternate_email" color="deep-orange" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Templating</q-item-label>
              <q-item-label caption>High-performance template engine</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>
        </q-list>
      </div>
    </q-page>
  </q-page-container>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useQuasar } from 'quasar'

defineOptions({ name: 'BootPage' })

const $q = useQuasar()

const slide = ref(0)
const autoplay = ref(10000)
const fullscreen = ref(false)

// Workaround for Quasar v2 QCarousel bug: panelIndex (non-reactive) is set inside
// a Transition callback deferred after navigation renders, so all dots start inactive.
// Force a model change after mount to trigger the watch that correctly sets panelIndex.
onMounted(() => {
  nextTick(() => {
    slide.value = -1
    nextTick(() => {
      slide.value = 0
    })
  })
})

const links = [
  'https://github.com/bootgly/bootgly_benchmarks/blob/main/Template_Engine/README.md',
  'https://github.com/bootgly/bootgly_benchmarks/blob/main/Progress_Bar/README.md'
]

const images = [
  { src: 'images/pages/@/1-Bootgly_Template_Engine-vs-Laravel_Blade.benchmark.jpg' },
  { src: 'images/pages/@/2-Bootgly-CLI-UI-Progress_component.png' },
  { src: 'images/pages/@/3-Bootgly-WPI-Nodes-HTTP-Server-CLI.png' },
  { src: 'images/pages/@/4-Bootgly_CLI-UI-Table_component.png' },
  { src: 'images/pages/@/5-Server-CLI-HTTP-Benchmark-Ryzen-9-3900X-WSL2.png' },
  { src: 'images/pages/@/6-Bootgly_test_command-Suite_filter_by_argument.png' },
  { src: 'images/pages/@/7-Bootgly_Debugging-Exception_reporting_with_file_content_highlighted.png' }
]

const videos = [
  {
    sources: [
      {
        src: 'videos/pages/Bootgly_CLI_-_Progress_with_Bar_component_vs_Symfony_Console_-_ProgressBar_Helper.mp4',
        type: 'video/mp4'
      }
    ]
  }
]
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
