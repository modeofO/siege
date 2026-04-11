import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModifierCard } from './ModifierCard'
import { MODIFIERS } from '@/data/modifiers'

describe('ModifierCard', () => {
  const narrowPass = MODIFIERS.find(m => m.slug === 'narrow-pass')!

  it('renders the modifier name', () => {
    render(<ModifierCard modifier={narrowPass} />)
    expect(screen.getByText('Narrow Pass')).toBeInTheDocument()
  })

  it('renders the probability as a percentage', () => {
    render(<ModifierCard modifier={narrowPass} />)
    expect(screen.getByText(/10%/)).toBeInTheDocument()
  })

  it('renders the flavor text', () => {
    render(<ModifierCard modifier={narrowPass} />)
    expect(screen.getByText(/choked with rubble/i)).toBeInTheDocument()
  })

  it('renders the effect text', () => {
    render(<ModifierCard modifier={narrowPass} />)
    expect(screen.getByText(/capped at 3/i)).toBeInTheDocument()
  })
})
