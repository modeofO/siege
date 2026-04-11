import type { Ability } from '@/data/abilities'
import { RESOURCES } from '@/data/resources'

type Props = {
  ability: Ability
}

export function AbilityCard({ ability }: Props) {
  return (
    <div
      className="panel-medieval"
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr',
        gap: '1rem',
        marginBottom: '0.75rem',
      }}
    >
      <img
        src={ability.iconPath}
        alt={ability.name}
        style={{
          width: '72px',
          height: '72px',
          objectFit: 'contain',
          alignSelf: 'start',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* Name + tier pill */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <h4 style={{ margin: 0, color: 'var(--vocs-color_textAccent)' }}>
            {ability.name}
          </h4>
          <span
            style={{
              fontSize: '0.7rem',
              padding: '2px 6px',
              borderRadius: '3px',
              border: '1px solid var(--vocs-color_border)',
              color: 'var(--siege-color-friendly)',
              letterSpacing: '0.1em',
            }}
          >
            T{ability.tier}
          </span>
        </div>

        {/* Flavor (italic, dim) */}
        <p
          style={{
            margin: 0,
            fontStyle: 'italic',
            color: 'var(--vocs-color_text2)',
            fontSize: '0.9rem',
          }}
        >
          {ability.flavor}
        </p>

        {/* Effect */}
        <p style={{ margin: 0, color: 'var(--vocs-color_text)' }}>
          {ability.effect}
        </p>

        {/* Cost row */}
        <ul
          style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            listStyle: 'none',
            padding: 0,
            margin: 0,
            fontSize: '0.85rem',
          }}
        >
          {ability.cost.map(c => (
            <li
              key={c.token}
              style={{
                color: 'var(--siege-color-gold)',
                letterSpacing: '0.05em',
              }}
            >
              {c.amount} × {RESOURCES[c.token].label}
            </li>
          ))}
          {ability.requiresT1 && (
            <li
              style={{
                color: 'var(--siege-color-friendly)',
                letterSpacing: '0.05em',
                fontStyle: 'italic',
              }}
            >
              + 1 × T1 {ability.name}
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
