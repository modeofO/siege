import { defineConfig } from 'vocs'
import path from 'node:path'

export default defineConfig({
  title: 'Siege',
  description: 'Player guide to Siege — rules, mechanics, and glossary.',
  titleTemplate: '%s · Siege',
  theme: {
    colorScheme: 'dark',
    // With `colorScheme: 'dark'`, Vocs types accentColor as a plain string.
    // The `{ light, dark }` object form is only valid when colorScheme is
    // `'system'` or undefined.
    accentColor: '#daa520',
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
