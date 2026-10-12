<template>
  <div class="about">
    <h1>This is an about page</h1>
    <div class="click-me">
      <p>This is a simple example of a Vue.js application with TypeScript.</p>
    <p>You can add more content to this page by editing the <code>AboutView.vue</code> file.</p>
    <p>You can also add more pages to this application by creating new <code>.vue</code> files in the <code>views</code>
      folder.</p>
    <p>For more information about Vue.js, visit the <a href="https://vuejs.org" target="_blank">Vue.js website</a>.</p>
    <p>For more information about TypeScript, visit the <a href="https://www.typescriptlang.org"
        target="_blank">TypeScript website</a>.</p>
    <p>For more information about Vue Router, visit the <a href="https://router.vuejs.org" target="_blank">Vue Router
        website</a>.</p>
    <p>For more information about Vuex, visit the <a href="https://vuex.vuejs.org" target="_blank">Vuex website</a>.</p>
    </div>
    <div class="click-me-button">
      <button @click="handleClick">Click me</button>
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
// import axios from 'axios';

onMounted(() => {
  console.log('About page mounted');
});

function handleClick() {
  console.log('About page clicked');

}

</script>

<style>
@media (min-width: 1024px) {
  .about {
    min-height: 100vh;
    /* display: flex; */
    align-items: center;
  }
}
</style>
