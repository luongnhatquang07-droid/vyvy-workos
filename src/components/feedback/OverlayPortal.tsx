'use client'

import React from 'react'
import { createPortal } from 'react-dom'

interface OverlayPortalProps {
  children: React.ReactNode
  isOpen: boolean
}

interface InlineStyleValue {
  value: string
  priority: string
}

interface LockedElementState {
  element: HTMLElement
  overflowX: InlineStyleValue
  overflowY: InlineStyleValue
  paddingRight: InlineStyleValue
  scrollLeft: number
  scrollTop: number
}

let activeScrollLocks = 0
let lockedElements: LockedElementState[] = []

const subscribeToClient = () => () => undefined
const getClientSnapshot = () => true
const getServerSnapshot = () => false

function captureInlineStyle(element: HTMLElement, property: string): InlineStyleValue {
  return {
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  }
}

function captureElementState(element: HTMLElement): LockedElementState {
  return {
    element,
    overflowX: captureInlineStyle(element, 'overflow-x'),
    overflowY: captureInlineStyle(element, 'overflow-y'),
    paddingRight: captureInlineStyle(element, 'padding-right'),
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
  }
}

function getElementScrollbarWidth(element: HTMLElement) {
  const computedStyle = window.getComputedStyle(element)
  const borderWidth = (Number.parseFloat(computedStyle.borderLeftWidth) || 0)
    + (Number.parseFloat(computedStyle.borderRightWidth) || 0)

  return Math.max(0, element.offsetWidth - element.clientWidth - borderWidth)
}

function lockElement(state: LockedElementState, scrollbarWidth: number) {
  const { element } = state
  const computedPaddingRight = Number.parseFloat(window.getComputedStyle(element).paddingRight) || 0

  element.style.setProperty('overflow-x', 'hidden', 'important')
  element.style.setProperty('overflow-y', 'hidden', 'important')

  if (scrollbarWidth > 0) {
    element.style.setProperty('padding-right', `${computedPaddingRight + scrollbarWidth}px`, 'important')
  }
}

function restoreInlineStyle(element: HTMLElement, property: string, style: InlineStyleValue) {
  if (style.value) {
    element.style.setProperty(property, style.value, style.priority)
  } else {
    element.style.removeProperty(property)
  }
}

function acquireScrollLock() {
  if (activeScrollLocks === 0) {
    const root = document.documentElement
    const body = document.body
    const mainContent = document.getElementById('main-content')
    const documentScrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth)
    const mainScrollbarWidth = mainContent ? getElementScrollbarWidth(mainContent) : 0

    lockedElements = [root, body, ...(mainContent ? [mainContent] : [])].map(captureElementState)

    lockElement(lockedElements[0], 0)
    lockElement(lockedElements[1], documentScrollbarWidth)
    if (lockedElements[2]) lockElement(lockedElements[2], mainScrollbarWidth)
  }

  activeScrollLocks += 1
  let released = false

  return () => {
    if (released) return
    released = true
    activeScrollLocks = Math.max(0, activeScrollLocks - 1)

    if (activeScrollLocks > 0) return

    lockedElements.forEach((state) => {
      restoreInlineStyle(state.element, 'overflow-x', state.overflowX)
      restoreInlineStyle(state.element, 'overflow-y', state.overflowY)
      restoreInlineStyle(state.element, 'padding-right', state.paddingRight)
      state.element.scrollLeft = state.scrollLeft
      state.element.scrollTop = state.scrollTop
    })
    lockedElements = []
  }
}

export function OverlayPortal({ children, isOpen }: OverlayPortalProps) {
  const isClient = React.useSyncExternalStore(
    subscribeToClient,
    getClientSnapshot,
    getServerSnapshot,
  )

  React.useEffect(() => {
    if (!isClient || !isOpen || typeof window === 'undefined' || typeof document === 'undefined') return
    return acquireScrollLock()
  }, [isClient, isOpen])

  if (!isClient || !isOpen || typeof window === 'undefined' || typeof document === 'undefined') {
    return null
  }

  return createPortal(children, document.body)
}
