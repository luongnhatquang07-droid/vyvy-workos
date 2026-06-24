'use client'
import React from 'react'
import type { CommandCenterData, FilterView } from '../types'
import {
  PEOPLE, PROJECTS, MEETINGS, TASK_DRAFTS, TASKS,
  DELIVERABLES, REMINDERS, APPROVALS, CEO_REQUESTS,
} from '../data/mock-data'
import { computeKPI, buildPriorityList, buildCOOSummary, filterPriorityItems } from '../utils'

type LoadState = 'loading' | 'success' | 'error'

interface UseCommandCenterResult {
  data: CommandCenterData | null
  loadState: LoadState
  filter: FilterView
  setFilter: (f: FilterView) => void
  retry: () => void
  filteredPriorityItems: CommandCenterData['priorityItems']
}

let _forceError = false
let _forceLoading = false

// Debug toggles — not exposed in UI
export function _debugForceError(v: boolean) { _forceError = v }
export function _debugForceLoading(v: boolean) { _forceLoading = v }

function loadMockData(): Promise<CommandCenterData> {
  return new Promise((resolve, reject) => {
    const delay = _forceLoading ? 99999 : 900
    setTimeout(() => {
      if (_forceError) { reject(new Error('Simulated load error')); return }

      const priorityItems = buildPriorityList(
        TASKS, MEETINGS, DELIVERABLES, REMINDERS, APPROVALS, CEO_REQUESTS, PEOPLE, PROJECTS,
      )
      const kpi = computeKPI(MEETINGS, TASK_DRAFTS, TASKS, DELIVERABLES, REMINDERS, APPROVALS, CEO_REQUESTS)
      const cooSummary = buildCOOSummary(TASKS, CEO_REQUESTS, APPROVALS, REMINDERS, MEETINGS)

      resolve({
        people: PEOPLE,
        projects: PROJECTS,
        meetings: MEETINGS,
        taskDrafts: TASK_DRAFTS,
        tasks: TASKS,
        deliverables: DELIVERABLES,
        reminders: REMINDERS,
        approvals: APPROVALS,
        ceoRequests: CEO_REQUESTS,
        kpi,
        priorityItems,
        cooSummary,
      })
    }, delay)
  })
}

export function useCommandCenterData(): UseCommandCenterResult {
  const [data, setData] = React.useState<CommandCenterData | null>(null)
  const [loadState, setLoadState] = React.useState<LoadState>('loading')
  const [filter, setFilter] = React.useState<FilterView>('all')
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    function onSuccess(d: CommandCenterData) { setData(d); setLoadState('success') }
    function onError() { setLoadState('error') }
    function startLoad() { setLoadState('loading'); setData(null) }
    startLoad()
    loadMockData().then(onSuccess).catch(onError)
  }, [attempt])

  const retry = React.useCallback(() => setAttempt(a => a + 1), [])

  const filteredPriorityItems = React.useMemo(() => {
    if (!data) return []
    return filterPriorityItems(data.priorityItems, filter)
  }, [data, filter])

  return { data, loadState, filter, setFilter, retry, filteredPriorityItems }
}
