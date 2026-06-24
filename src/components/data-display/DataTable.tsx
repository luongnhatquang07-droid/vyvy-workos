'use client'
import React from 'react'

export interface Column<T = Record<string, unknown>> {
  key: string
  header: string
  width?: number | string
  render?: (row: T, index: number) => React.ReactNode
  align?: 'left' | 'center' | 'right'
}

interface DataTableProps<T = Record<string, unknown>> {
  columns: Column<T>[]
  rows: T[]
  keyField?: string
  loading?: boolean
  emptyState?: React.ReactNode
  onRowClick?: (row: T) => void
  stickyHeader?: boolean
}

interface TableToolbarProps {
  children?: React.ReactNode
  title?: string
}

export function TableToolbar({ children, title }: TableToolbarProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: 'var(--space-3) var(--space-4)',
      borderBottom: '1px solid var(--color-border)',
      gap: 'var(--space-3)',
      flexWrap: 'wrap',
    }}>
      {title && <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{title}</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginLeft: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

export function DataTable<T = Record<string, unknown>>({ columns, rows, keyField = 'id', loading, emptyState, onRowClick, stickyHeader }: DataTableProps<T>) {
  const [hoveredRow, setHoveredRow] = React.useState<number | null>(null)

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)',
      }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '10px 12px',
                textAlign: col.align ?? 'left',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                background: 'var(--color-surface-2)',
                borderBottom: '1px solid var(--color-border)',
                whiteSpace: 'nowrap',
                width: col.width,
                position: stickyHeader ? 'sticky' : undefined,
                top: stickyHeader ? 0 : undefined,
                zIndex: stickyHeader ? 1 : undefined,
              }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!loading && rows.length === 0 ? (
            <tr><td colSpan={columns.length}>{emptyState}</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={(row as Record<string, unknown>)[keyField] as string ?? i}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={() => setHoveredRow(i)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  background: hoveredRow === i ? 'var(--color-surface-2)' : 'var(--color-surface)',
                  cursor: onRowClick ? 'pointer' : undefined,
                  transition: `background var(--motion-fast) var(--ease-out)`,
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                {columns.map(col => (
                  <td key={col.key} style={{
                    padding: '10px 12px',
                    textAlign: col.align ?? 'left',
                    color: 'var(--color-text)',
                    verticalAlign: 'middle',
                  }}>
                    {col.render ? col.render(row, i) : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
