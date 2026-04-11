import type { Modifier } from '@/data/modifiers'

type Props = {
  modifier: Modifier
}

export function ModifierCard({ modifier }: Props) {
  return (
    <div
      className="panel-medieval"
      style={{
        marginBottom: '0.75rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        <h4 style={{ margin: 0, color: 'var(--vocs-color_textAccent)' }}>
          {modifier.name}
        </h4>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '2px 8px',
            borderRadius: '3px',
            border: '1px solid var(--vocs-color_border)',
            color: 'var(--siege-color-friendly)',
            letterSpacing: '0.05em',
          }}
        >
          {modifier.probability}%
        </span>
      </div>

      <p
        style={{
          margin: '0 0 0.5rem 0',
          fontStyle: 'italic',
          color: 'var(--vocs-color_text2)',
          fontSize: '0.9rem',
        }}
      >
        {modifier.flavor}
      </p>

      <p style={{ margin: 0, color: 'var(--vocs-color_text)' }}>
        {modifier.effect}
      </p>
    </div>
  )
}
