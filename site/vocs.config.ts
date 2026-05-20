import { defineConfig } from 'vocs'
import path from 'node:path'

export default defineConfig({
  title: 'Siege - docs',
  description: 'Player guide to Siege — rules, mechanics, and glossary.',
  titleTemplate: '%s · Siege - docs',
  iconUrl: '/sprites/abilities/siege-sword.svg',
  theme: {
    colorScheme: 'dark',
    // With `colorScheme: 'dark'`, Vocs types accentColor as a plain string.
    // The `{ light, dark }` object form is only valid when colorScheme is
    // `'system'` or undefined.
    accentColor: '#daa520',
  },
  sidebar: [
    {
      text: 'Getting Started',
      items: [
        { text: 'Welcome', link: '/getting-started/welcome' },
        { text: 'Connect your wallet', link: '/getting-started/connect-wallet' },
        { text: 'Your first match', link: '/getting-started/first-match' },
      ],
    },
    {
      text: 'Rules',
      items: [
        { text: 'Goal & win condition', link: '/rules/goal' },
        { text: 'The round loop', link: '/rules/round-loop' },
        { text: 'Budget allocation', link: '/rules/budget' },
        { text: 'Commit & reveal', link: '/rules/commit-reveal' },
        { text: 'Scoring & damage', link: '/rules/scoring' },
      ],
    },
    {
      text: 'Mechanics',
      items: [
        { text: 'Gates', link: '/mechanics/gates' },
        { text: 'Gate modifiers', link: '/mechanics/modifiers' },
        { text: 'Resource nodes', link: '/mechanics/nodes' },
        { text: 'Traps', link: '/mechanics/traps' },
        { text: 'Vault & repair', link: '/mechanics/vault' },
        { text: 'Resources', link: '/mechanics/resources' },
        { text: 'Abilities', link: '/mechanics/abilities' },
      ],
    },
    {
      text: 'The Marches',
      items: [
        { text: 'Overview', link: '/world/overview' },
        { text: 'Your Hold', link: '/world/holds' },
        { text: 'Kingdom tiers', link: '/world/tiers' },
        { text: 'Staked matches', link: '/world/staked-matches' },
        { text: 'Conquest', link: '/world/conquest' },
        { text: 'Pillaging', link: '/world/pillaging' },
        { text: 'Reputation', link: '/world/reputation' },
        { text: 'Factions', link: '/world/factions' },
      ],
    },
    {
      text: 'Glossary',
      link: '/glossary',
    },
  ],
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
