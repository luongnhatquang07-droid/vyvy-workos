'use client'

import React from 'react'

import { readJsonResponse } from '@/lib/api/readJsonResponse'
import type { PlanTreeResponse, ProjectPlanTreeDto } from '@/lib/documents/types'

interface ProjectPlanContextValue {
  data: ProjectPlanTreeDto | null
  loading: boolean
  error: string
  schemaReady: boolean
  refresh: () => Promise<void>
}

const ProjectPlanContext = React.createContext<ProjectPlanContextValue>({
  data: null,
  loading: false,
  error: '',
  schemaReady: true,
  refresh: async () => {},
})

export function ProjectPlanProvider({
  projectId,
  children,
}: {
  projectId: string | null | undefined
  children: React.ReactNode
}) {
  const [data, setData] = React.useState<ProjectPlanTreeDto | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [schemaReady, setSchemaReady] = React.useState(true)

  const refresh = React.useCallback(async () => {
    if (!projectId) {
      setData(null)
      setError('')
      setSchemaReady(true)
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/documents?projectId=${encodeURIComponent(projectId)}`, {
        cache: 'no-store',
      })
      const payload = await readJsonResponse<PlanTreeResponse>(response, 'Không tải được kế hoạch.')
      if (!response.ok || !payload.ok || !payload.data) {
        setSchemaReady(payload.code !== 'DOCUMENT_SCHEMA_NOT_READY')
        throw new Error(payload.error || 'Không tải được kế hoạch.')
      }
      setData(payload.data)
      setError('')
      setSchemaReady(true)
    } catch (requestError) {
      setData(null)
      setError(requestError instanceof Error ? requestError.message : 'Không tải được kế hoạch.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh())
    return () => window.cancelAnimationFrame(frame)
  }, [refresh])

  const value = React.useMemo(
    () => ({ data, loading, error, schemaReady, refresh }),
    [data, error, loading, refresh, schemaReady],
  )

  return <ProjectPlanContext.Provider value={value}>{children}</ProjectPlanContext.Provider>
}

export function useProjectPlanDocuments() {
  return React.useContext(ProjectPlanContext)
}
