'use client'

import React from 'react'
import { readJsonResponse } from '@/lib/api/readJsonResponse'
import type { CommandCenterVisibilitySummary, RawCommandCenterData } from '@/lib/database.types'

export type CommandCenterApiData = RawCommandCenterData & {
  workspaceId: string
  visibilitySummary?: CommandCenterVisibilitySummary
  currentUser?: {
    personId: string | null
    role: string | null
    canApproveOnBehalf: boolean
  }
}

interface UseCommandDataResult {
  data: CommandCenterApiData | null
  loading: boolean
  error: string
  refresh: (options?: { silent?: boolean }) => Promise<void>
}

const CommandDataContext = React.createContext<UseCommandDataResult | null>(null)
const COMMAND_DATA_TIMEOUT_MS = 15000

export function CommandDataProvider({
  children,
  enabled = true,
}: {
  children: React.ReactNode
  enabled?: boolean
}) {
  const value = useCommandDataState(enabled)
  return <CommandDataContext.Provider value={value}>{children}</CommandDataContext.Provider>
}

export function useCommandData(): UseCommandDataResult {
  const context = React.useContext(CommandDataContext)
  return (
    context ?? {
      data: commandDataCache.data,
      loading: false,
      error: commandDataCache.error,
      refresh: async () => undefined,
    }
  )
}

function useCommandDataState(enabled: boolean): UseCommandDataResult {
  const [data, setData] = React.useState<CommandCenterApiData | null>(() => commandDataCache.data)
  const [loading, setLoading] = React.useState(() => enabled && !commandDataCache.data)
  const [error, setError] = React.useState(() => commandDataCache.error)

  const load = React.useCallback(async (force = false, options: { silent?: boolean } = {}) => {
    if (!enabled) {
      setLoading(false)
      return
    }
    const showLoading = !options.silent || !commandDataCache.data
    if (commandDataCache.promise && !force) {
      if (showLoading) setLoading(true)
      try {
        const payload = await commandDataCache.promise
        commandDataCache.data = payload
        setData(payload)
        setError('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
      } finally {
        if (showLoading) setLoading(false)
      }
      return
    }

    if (showLoading) setLoading(true)
    setError('')

    const promise = fetchCommandCenterData()

    commandDataCache.promise = promise

    try {
      const payload = await promise
      commandDataCache.data = payload
      commandDataCache.error = ''
      setData(payload)
      setError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể tải dữ liệu'
      commandDataCache.error = message
      setError(message)
    } finally {
      commandDataCache.promise = null
      if (showLoading) setLoading(false)
    }
  }, [enabled])

  React.useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => setLoading(false))
      return
    }
    if (commandDataCache.data) return
    queueMicrotask(() => {
      void load()
    })
  }, [enabled, load])

  const refresh = React.useCallback(async (options: { silent?: boolean } = {}) => {
    commandDataCache.error = ''
    await load(true, { silent: options.silent ?? Boolean(commandDataCache.data) })
  }, [load])

  return React.useMemo(
    () => ({ data, loading, error, refresh }),
    [data, error, loading, refresh],
  )
}

async function fetchCommandCenterData() {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), COMMAND_DATA_TIMEOUT_MS)

  try {
    const response = await fetch('/api/command-center', {
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await readJsonResponse<CommandCenterApiData | { error?: string }>(
      response,
      'Không tải được dữ liệu điều hành.',
    )

    if (!response.ok) {
      throw new Error('error' in payload && payload.error ? payload.error : 'Không tải được dữ liệu điều hành.')
    }

    return payload as CommandCenterApiData
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Tải dữ liệu quá lâu. Hãy thử lại.')
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

const commandDataCache: {
  data: CommandCenterApiData | null
  error: string
  promise: Promise<CommandCenterApiData> | null
} = {
  data: null,
  error: '',
  promise: null,
}
