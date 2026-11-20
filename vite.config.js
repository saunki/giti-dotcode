import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // relative asset URLs: the build can be served from any folder or sub-path
  base: './',
  build: {
    rollupOptions: {
      // index.html: the scroll-driven tire website; playground.html: the physics playground
      input: { site: 'index.html', playground: 'playground.html' },
    },
  },
})
