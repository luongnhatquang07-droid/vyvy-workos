import React from 'react'
import Link from 'next/link'

interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="breadcrumb">
      <ol style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', listStyle: 'none', flexWrap: 'wrap' }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {i > 0 && <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>/</span>}
            {item.href && i < items.length - 1
              ? <Link href={item.href} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'}
                >{item.label}</Link>
              : <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', fontWeight: 500 }}>{item.label}</span>
            }
          </li>
        ))}
      </ol>
    </nav>
  )
}
