import { defineConfig } from 'vocs'
import path from 'node:path'

export default defineConfig({
  title: 'Siege',
  description: 'Player guide to Siege — rules, mechanics, and glossary.',
  titleTemplate: '%s · Siege',
  theme: {
    colorScheme: 'dark',
    // Vocs v1.4.1 requires both `light` and `dark` values; the site is locked
    // to dark mode via `colorScheme`, so we mirror the same gold on both.
    accentColor: { light: '#daa520', dark: '#daa520' },
  },
  // Cinzel: display serif matching the game client (frontend loads it via next/font).
  // Vocs' native `font` field takes a Google Font name and injects the stylesheet
  // for us — simpler than emitting raw <link> tags in `head`.
  font: { google: 'Cinzel' },
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  },
})
