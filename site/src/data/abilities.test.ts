import { describe, it, expect } from 'vitest'
import { ABILITIES, type Ability } from './abilities'

describe('ABILITIES', () => {
  it('contains exactly 10 abilities (5 T1 + 5 T2)', () => {
    expect(ABILITIES).toHaveLength(10)
    expect(ABILITIES.filter(a => a.tier === 1)).toHaveLength(5)
    expect(ABILITIES.filter(a => a.tier === 2)).toHaveLength(5)
  })

  it('has unique IDs matching on-chain token IDs 1..10', () => {
    const ids = ABILITIES.map(a => a.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('has unique URL slugs', () => {
    const slugs = ABILITIES.map(a => a.slug)
    expect(new Set(slugs).size).toBe(ABILITIES.length)
  })

  it('includes all 5 type names at each tier', () => {
    const expected = [
      'Ember Blast', 'Fortify', 'Hex', 'Siege Sword', 'Stone Cloak',
    ]
    const t1 = ABILITIES.filter(a => a.tier === 1).map(a => a.name).sort()
    const t2 = ABILITIES.filter(a => a.tier === 2).map(a => a.name).sort()
    expect(t1).toEqual(expected)
    expect(t2).toEqual(expected)
  })

  it('id ↔ type/tier relationship matches the on-chain helpers', () => {
    // ability_type(id) = ((id - 1) % 5) + 1     → 1..5
    // ability_tier(id) = Math.floor((id - 1) / 5) + 1   → 1 or 2
    for (const a of ABILITIES) {
      expect(((a.id - 1) % 5) + 1).toBe(a.type)
      expect(Math.floor((a.id - 1) / 5) + 1).toBe(a.tier)
    }
  })

  it('T1 never requires burning a T1; T2 always does', () => {
    for (const a of ABILITIES) {
      expect(a.requiresT1).toBe(a.tier === 2)
    }
  })

  it('every ability has non-empty flavor, effect, and at least one cost', () => {
    for (const a of ABILITIES as Ability[]) {
      expect(a.flavor.length).toBeGreaterThan(0)
      expect(a.effect.length).toBeGreaterThan(0)
      expect(a.cost.length).toBeGreaterThan(0)
      for (const c of a.cost) {
        expect(c.amount).toBeGreaterThan(0)
      }
    }
  })
})
