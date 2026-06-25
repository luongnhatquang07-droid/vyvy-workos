'use client'
import React from 'react'
import type { CommandCenterData, FilterView } from '../types'
import {
  PEOPLE, PROJECTS, MEETINGS, TASKS, DELIVERABLES, DELIVERABLE_CHECKS,
  REMINDERS, CHASE_ITEMS, COMMITMENTS, APPROVALS, CEO_REQUESTS, ACTIVITY_LOG,
} from '../data/mock-data'
import { computeKPI, buildPriorityList, buildCOOSummary, buildSummaryBanner, filterPriorityItems } from '../utils'

type LoadState = 'loading'|'success'|'error'

interface UseCommandCenterResult {
  data: CommandCenterData | null
  loadState: LoadState
  filter: FilterView
  setFilter: (f: FilterView) => void
  retry: () => void
  filteredPriorityItems: CommandCenterData['priorityItems']
}

function loadMockData(): Promise<CommandCenterData> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        const kpi = computeKPI(MEETINGS, TASKS, APPROVALS, CEO_REQUESTS, REMINDERS)
        const priorityItems = buildPriorityList(TASKS, MEETINGS, APPROVALS, CEO_REQUESTS, PEOPLE, PROJECTS)
        const cooSummary = buildCOOSummary(TASKS, CEO_REQUESTS, APPROVALS, REMINDERS, MEETINGS)
        const summaryBanner = buildSummaryBanner(kpi, CHASE_ITEMS, CEO_REQUESTS)
        resolve({
          people: PEOPLE, projects: PROJECTS, meetings: MEETINGS, tasks: TASKS,
          deliverables: DELIVERABLES, deliverableChecks: DELIVERABLE_CHECKS,
          reminders: REMINDERS, chaseItems: CHASE_ITEMS, commitments: COMMITMENTS,
          approvals: APPROVALS, ceoRequests: CEO_REQUESTS, activityLog: ACTIVITY_LOG,
          kpi, priorityItems, cooSummary, summaryBanner,
        })
      } catch (e) {
        reject(e)
      }
    }, 800)
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
