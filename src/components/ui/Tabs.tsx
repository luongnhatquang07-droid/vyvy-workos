'use client'
import React from 'react'

interface Tab {
  key: string
  label: string
  content?: React.ReactNode
}

interface TabsProps {
  tabs: Tab[]
  defaultTab?: string
  onChange?: (key: string) => void
  children?: (activeKey: string) => React.ReactNode
}

export function Tabs({ tabs, defaultTab, onChange, children }: TabsProps) {
  const [active, setActive] = React.useState(defaultTab ?? tabs[0]?.key)

  const handleSelect = (key: string) => {
    setActive(key)
    onChange?.(key)
  }

  return (
    <div>
      <div role="tablist" style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1.5px solid var(--color-border)',
        marginBottom: 'var(--space-5)',
      }}>
        {tabs.map(tab => {
          const isActive = tab.key === active
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleSelect(tab.key)}
              style={{
                padding: '8px 16px',
                fontSize: 'var(--text-sm)',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--color-charcoal)' : '2px solid transparent',
                marginBottom: -1.5,
                cursor: 'pointer',
                transition: `color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out)`,
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {children ? children(active) : tabs.find(t => t.key === active)?.content}
    </div>
  )
}
