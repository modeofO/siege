import { describe, it, expect } from 'vitest'
import { RESOURCES, type ResourceToken } from './resources'

describe('RESOURCES', () => {
  const tokens: ResourceToken[] = [
    'iron', 'linen', 'stone', 'wood', 'ember', 'seeds',
  ]

  it('has an entry for every resource token', () => {
    for (const t of tokens) {
      expect(RESOURCES[t]).toBeDefined()
    }
  })

  it('each resource has name, node, pair, and label', () => {
    for (const t of tokens) {
      const r = RESOURCES[t]
      expect(r.name.length).toBeGreaterThan(0)
      expect(['forge', 'quarry', 'grove']).toContain(r.node)
      expect(tokens).toContain(r.pair)
      expect(r.label.length).toBeGreaterThan(0)
    }
  })

  it('each node has exactly two resources that pair with each other', () => {
    const byNode: Record<string, ResourceToken[]> = {}
    for (const t of tokens) {
      const r = RESOURCES[t]
      byNode[r.node] = byNode[r.node] || []
      byNode[r.node].push(t)
    }
    expect(byNode.forge).toHaveLength(2)
    expect(byNode.quarry).toHaveLength(2)
    expect(byNode.grove).toHaveLength(2)

    // Pairs must be mutual
    for (const t of tokens) {
      const r = RESOURCES[t]
      expect(RESOURCES[r.pair].pair).toBe(t)
    }
  })
})
