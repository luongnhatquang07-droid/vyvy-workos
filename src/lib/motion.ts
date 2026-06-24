export const motion = {
  fast: 'var(--motion-fast)',
  base: 'var(--motion-base)',
  slow: 'var(--motion-slow)',
  easeOut: 'var(--ease-out)',
  easeInOut: 'var(--ease-in-out)',
} as const

export const transitions = {
  fast:    `var(--motion-fast) var(--ease-out)`,
  base:    `var(--motion-base) var(--ease-out)`,
  slow:    `var(--motion-slow) var(--ease-out)`,
} as const
