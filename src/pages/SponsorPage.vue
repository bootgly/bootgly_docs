<template lang="pug">
q-page-container
  q-page.content.q-pa-lg
    h1 Support Bootgly Development
    p Are you tired of juggling multiple tools and solutions for your Web and CLI development projects? Look no further! We are excited to announce the development of a versatile PHP Full-Stack framework that will simplify and streamline the development process for both web and command-line interface (CLI) applications.
    p With its user-friendly interface and powerful features, this framework will help you create dynamic, high-performing applications in a fraction of the time. It is adaptable and scalable, making it an ideal choice for projects of any size or complexity.
    p Support this project and be a part of revolutionizing the way developers approach web and CLI development. Your sponsorship will provide significant benefits to the PHP development community and help bring this cutting-edge technology to life.
    p Don't miss this opportunity to support a project that has the potential to change the game for PHP developers everywhere. Get involved today and help shape the future direction of this exciting framework.
    q-btn-group(push)
      q-btn(push label="Github Sponsor" icon="card_giftcard" @click="goGithubSponsor")
    br
    br

    p Join us and help ensure that Bootgly survives and evolves!
</template>

<script>
export default {
  methods: {
    goGithubSponsor () {
      window.open('https://github.com/sponsors/bootgly/', '_blank')
    }
  }
}
</script>

<style lang="sass">
img
  &.qr-code
    width: 180px
    height: 180px
    margin: auto
  &.platform
    padding-top: 30px
    padding-bottom: 30px
</style>
