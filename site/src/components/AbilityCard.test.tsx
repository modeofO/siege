import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AbilityCard } from './AbilityCard'
import { ABILITIES } from '@/data/abilities'

describe('AbilityCard', () => {
  const siegeSwordT1 = ABILITIES.find(a => a.slug === 'siege-sword')!
  const siegeSwordT2 = ABILITIES.find(a => a.slug === 'siege-sword-t2')!

  describe('rendering a T1 ability', () => {
    it('renders the ability name', () => {
      render(<AbilityCard ability={siegeSwordT1} />)
      expect(screen.getByText('Siege Sword')).toBeInTheDocument()
    })

    it('renders the ability effect text', () => {
      render(<AbilityCard ability={siegeSwordT1} />)
      expect(screen.getByText(/sets your attack/i)).toBeInTheDocument()
    })

    it('renders the flavor text', () => {
      render(<AbilityCard ability={siegeSwordT1} />)
      expect(screen.getByText(/find the crack/i)).toBeInTheDocument()
    })

    it('renders each cost entry with amount and label', () => {
      render(<AbilityCard ability={siegeSwordT1} />)
      // Siege Sword T1: 3 iron + 2 wood
      expect(screen.getByText(/3\s*×\s*IRON/i)).toBeInTheDocument()
      expect(screen.getByText(/2\s*×\s*WOOD/i)).toBeInTheDocument()
    })

    it('renders the ability icon with alt text', () => {
      render(<AbilityCard ability={siegeSwordT1} />)
      const img = screen.getByRole('img', { name: /siege sword/i })
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', '/sprites/abilities/siege-sword.svg')
    })

    it('renders a T1 tier pill', () => {
      render(<AbilityCard ability={siegeSwordT1} />)
      expect(screen.getByText(/^T1$/i)).toBeInTheDocument()
    })

    it('does NOT show a "burn T1" requirement for T1 abilities', () => {
      render(<AbilityCard ability={siegeSwordT1} />)
      expect(screen.queryByText(/burn.*t1|requires.*t1|1\s*×\s*t1/i)).not.toBeInTheDocument()
    })
  })

  describe('rendering a T2 ability', () => {
    it('renders a T2 tier pill', () => {
      render(<AbilityCard ability={siegeSwordT2} />)
      expect(screen.getByText(/^T2$/i)).toBeInTheDocument()
    })

    it('renders the T2 cost values', () => {
      render(<AbilityCard ability={siegeSwordT2} />)
      // Siege Sword T2: 30 iron + 20 wood + 10 ember
      expect(screen.getByText(/30\s*×\s*IRON/i)).toBeInTheDocument()
      expect(screen.getByText(/20\s*×\s*WOOD/i)).toBeInTheDocument()
      expect(screen.getByText(/10\s*×\s*EMBER/i)).toBeInTheDocument()
    })

    it('indicates a T1 burn requirement', () => {
      render(<AbilityCard ability={siegeSwordT2} />)
      // The card must surface that T2 crafting burns a T1 of the same type.
      // Accept any of: "burn T1", "+ 1 × T1", "requires T1", "1× T1 Siege Sword", etc.
      expect(screen.getByText(/t1/i)).toBeInTheDocument()
    })
  })
})
