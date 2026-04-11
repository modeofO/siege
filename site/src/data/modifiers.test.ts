import { describe, it, expect } from 'vitest'
import { MODIFIERS } from './modifiers'

describe('MODIFIERS', () => {
  it('contains exactly 5 gate modifiers', () => {
    expect(MODIFIERS).toHaveLength(5)
  })

  it('probabilities sum to 100', () => {
    const total = MODIFIERS.reduce((acc, m) => acc + m.probability, 0)
    expect(total).toBe(100)
  })

  it('includes all 5 named modifiers', () => {
    const names = MODIFIERS.map(m => m.name).sort()
    expect(names).toEqual([
      'Deadlock', 'Mirror Gate', 'Narrow Pass', 'Normal', 'Reflection',
    ])
  })

  it('has unique slugs', () => {
    const slugs = MODIFIERS.map(m => m.slug)
    expect(new Set(slugs).size).toBe(MODIFIERS.length)
  })

  it('every modifier has non-empty flavor and effect', () => {
    for (const m of MODIFIERS) {
      expect(m.flavor.length).toBeGreaterThan(0)
      expect(m.effect.length).toBeGreaterThan(0)
    }
  })
})
