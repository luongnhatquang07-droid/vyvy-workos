import React from 'react'

interface CardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  padding?: string
  hoverable?: boolean
}

export function Card({ children, style, padding = 'var(--space-5)', hoverable }: CardProps) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onMouseEnter={() => hoverable && setHovered(true)}
      onMouseLeave={() => hoverable && setHovered(false)}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding,
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: `box-shadow var(--motion-base) var(--ease-out)`,
        ...style,
      }}>
      {children}
    </div>
  )
}
