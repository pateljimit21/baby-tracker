// Makes the app icons: `npx @vite-pwa/assets-generator`.
// The rounded favicon.svg is for browsers; icon-square.svg fills the whole tile,
// because iPhone and Android round the corners themselves.
import { defineConfig } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']], padding: 0 },
    maskable: { sizes: [512], padding: 0 },
    apple: { sizes: [180], padding: 0 },
  },
  images: ['public/icon-square.svg'],
})
