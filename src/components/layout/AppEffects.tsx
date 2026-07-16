'use client'

import React from 'react'
import { usePathname } from 'next/navigation'

const CARD_SELECTOR = 'main section, main article, [data-vyvy-card], [data-vyvy-tilt]'
const STAGGER_SELECTOR = 'main section:not([data-vyvy-no-stagger]), main table tbody tr, main [role="listitem"], main [data-vyvy-card]'
const RIPPLE_SELECTOR = 'button, a[role="button"]'
const CONFETTI_COLORS = ['#DADF21', '#4A8C5C', '#6B8A99', '#C47B2B', '#B84040']
const POINTER_EFFECT_DELAY_MS = 32
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function prefersReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

interface ConfettiPiece {
  id: string
  left: number
  top: number
  color: string
  size: number
  dx: number
  dy: number
  rotate: number
  delay: number
}

export function AppEffects() {
  const pathname = usePathname()
  const [radarPulse, setRadarPulse] = React.useState(0)
  const [radarVisible, setRadarVisible] = React.useState(false)
  const [confettiPieces, setConfettiPieces] = React.useState<ConfettiPiece[]>([])
  const spotlightRef = React.useRef<HTMLDivElement>(null)
  const effectTimersRef = React.useRef<Set<number>>(new Set())

  const scheduleEffectCleanup = React.useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      effectTimersRef.current.delete(timer)
      callback()
    }, delay)
    effectTimersRef.current.add(timer)
  }, [])

  React.useEffect(() => () => {
    effectTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    effectTimersRef.current.clear()
  }, [])

  const triggerRadar = React.useCallback(() => {
    if (prefersReducedMotion()) return
    setRadarPulse((value) => value + 1)
    setRadarVisible(true)
  }, [])

  const triggerConfetti = React.useCallback((x: number, y: number) => {
    if (prefersReducedMotion()) return
    const burstId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const nextPieces = Array.from({ length: 18 }, (_, index) => ({
      id: `${burstId}-${index}`,
      left: x,
      top: y,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      size: 8 + (index % 4),
      dx: (Math.random() - 0.5) * 180,
      dy: 90 + Math.random() * 120,
      rotate: (Math.random() - 0.5) * 520,
      delay: index * 12,
    }))
    setConfettiPieces((current) => [...current, ...nextPieces])
    scheduleEffectCleanup(() => {
      setConfettiPieces((current) => current.filter((piece) => !piece.id.startsWith(burstId)))
    }, 1350)
  }, [scheduleEffectCleanup])

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      document.querySelectorAll<HTMLElement>('[data-vyvy-type]').forEach((element) => {
        element.classList.remove('vyvy-type-caret')
      })
      return
    }

    const timers: number[] = []

    function typeElement(el: HTMLElement) {
      if (el.dataset.vyvyTyped === 'yes') return
      el.dataset.vyvyTyped = 'yes'
      const full = el.dataset.full ?? el.textContent ?? ''
      el.dataset.full = full
      if (!full) {
        el.textContent = full
        return
      }
      el.classList.add('vyvy-type-caret')
      el.textContent = ''
      let index = 0
      const speed = 30
      const tick = () => {
        if (index <= full.length) {
          el.textContent = full.slice(0, index)
          index += 1
          timers.push(window.setTimeout(tick, speed))
        } else {
          timers.push(window.setTimeout(() => el.classList.remove('vyvy-type-caret'), 600))
        }
      }
      tick()
    }

    function typeAll() {
      document.querySelectorAll<HTMLElement>('[data-vyvy-type]').forEach(typeElement)
    }

    // Type immediately, then keep watching briefly: the command center page
    // streams its content in after the loading.tsx skeleton, so the title may
    // only appear in the DOM well after this effect first runs.
    typeAll()
    const observer = new MutationObserver(typeAll)
    observer.observe(document.body, { childList: true, subtree: true })
    timers.push(window.setTimeout(() => observer.disconnect(), 2500))

    return () => {
      observer.disconnect()
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [pathname])

  // Lock-on radar sweep on every view change (matches the sample's enterScreen).
  React.useEffect(() => {
    if (prefersReducedMotion()) return
    const frame = window.requestAnimationFrame(() => {
      setRadarPulse((value) => value + 1)
      setRadarVisible(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pathname])

  React.useEffect(() => {
    if (prefersReducedMotion()) return
    // On a route change the elements are freshly mounted, so we can add the
    // stagger class straight away. Crucially we do NOT force a reflow per item
    // (the old `void item.offsetWidth` ran layout up to 40 times = the view-switch
    // lag). One write pass, no synchronous layout reads.
    const items = Array.from(document.querySelectorAll<HTMLElement>(STAGGER_SELECTOR)).slice(0, 40)
    items.forEach((item, index) => {
      item.style.animationDelay = `${Math.min(index, 16) * 26}ms`
      item.classList.add('vyvy-stagger-in')
    })

    return () => {
      items.forEach((item) => {
        item.classList.remove('vyvy-stagger-in')
        item.style.animationDelay = ''
      })
    }
  }, [pathname])

  React.useEffect(() => {
    function handleRadarEvent() {
      triggerRadar()
    }

    function handleConfettiEvent(event: Event) {
      const detail = (event as CustomEvent<{ x?: number; y?: number }>).detail
      triggerConfetti(detail?.x ?? window.innerWidth / 2, detail?.y ?? window.innerHeight / 2)
    }

    function processPointerMove(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (prefersReducedMotion()) return

      const rectCache = new Map<HTMLElement, DOMRect>()
      function getRect(element: HTMLElement) {
        const cached = rectCache.get(element)
        if (cached) return cached
        const rect = element.getBoundingClientRect()
        rectCache.set(element, rect)
        return rect
      }

      if (spotlightRef.current) {
        spotlightRef.current.style.transform = `translate(${event.clientX - 300}px, ${event.clientY - 300}px)`
        spotlightRef.current.style.opacity = '1'
      }

      const card = target.closest<HTMLElement>(CARD_SELECTOR)
      if (card) {
        const rect = getRect(card)
        card.style.setProperty('--mx', `${event.clientX - rect.left}px`)
        card.style.setProperty('--my', `${event.clientY - rect.top}px`)
      }

      const magnetic = target.closest<HTMLElement>('[data-vyvy-magnetic]')
      if (magnetic) {
        const rect = getRect(magnetic)
        const x = (event.clientX - rect.left - rect.width / 2) * 0.25
        const y = (event.clientY - rect.top - rect.height / 2) * 0.34
        magnetic.style.transform = `translate(${x}px, ${y}px)`
      }

      const tilt = target.closest<HTMLElement>('[data-vyvy-tilt]')
      if (tilt) {
        const rect = getRect(tilt)
        const px = (event.clientX - rect.left) / rect.width - 0.5
        const py = (event.clientY - rect.top) / rect.height - 0.5
        tilt.style.transition = 'none'
        tilt.style.transform = `perspective(650px) rotateX(${-py * 9}deg) rotateY(${px * 9}deg) translateY(-6px) scale(1.03)`
      }
    }

    function handlePointerLeave(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null

      const magnetic = target.closest<HTMLElement>('[data-vyvy-magnetic]')
      if (magnetic && (!nextTarget || !magnetic.contains(nextTarget))) magnetic.style.transform = ''

      const tilt = target.closest<HTMLElement>('[data-vyvy-tilt]')
      if (tilt && (!nextTarget || !tilt.contains(nextTarget))) {
        tilt.style.transition = 'transform 0.35s ease'
        tilt.style.transform = ''
      }
    }

    function handleClick(event: MouseEvent) {
      if (prefersReducedMotion()) return
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest<HTMLElement>(RIPPLE_SELECTOR)
      if (!button || button.getAttribute('aria-disabled') === 'true') return
      if (button instanceof HTMLButtonElement && button.disabled) return

      const rect = button.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height)
      const ripple = document.createElement('span')
      ripple.className = 'vyvy-ripple'
      ripple.style.width = `${size}px`
      ripple.style.height = `${size}px`
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`
      button.appendChild(ripple)
      scheduleEffectCleanup(() => ripple.remove(), 580)

      if (button.closest('[data-vyvy-radar]')) triggerRadar()
      if (button.closest('[data-vyvy-confetti]')) triggerConfetti(event.clientX, event.clientY)
    }

    // Decorative pointer effects do not need display-rate layout reads.
    let moveRaf = 0
    let moveTimer = 0
    let lastMoveEvent: PointerEvent | null = null
    function handlePointerMove(event: PointerEvent) {
      lastMoveEvent = event
      if (moveRaf || moveTimer) return
      moveTimer = window.setTimeout(() => {
        moveTimer = 0
        moveRaf = requestAnimationFrame(() => {
          moveRaf = 0
          if (lastMoveEvent) processPointerMove(lastMoveEvent)
        })
      }, POINTER_EFFECT_DELAY_MS)
    }

    document.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('pointerout', handlePointerLeave, { passive: true })
    document.addEventListener('click', handleClick)
    window.addEventListener('vyvy-radar', handleRadarEvent)
    window.addEventListener('vyvy-confetti', handleConfettiEvent)
    return () => {
      if (moveRaf) cancelAnimationFrame(moveRaf)
      if (moveTimer) window.clearTimeout(moveTimer)
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerout', handlePointerLeave)
      document.removeEventListener('click', handleClick)
      window.removeEventListener('vyvy-radar', handleRadarEvent)
      window.removeEventListener('vyvy-confetti', handleConfettiEvent)
    }
  }, [scheduleEffectCleanup, triggerConfetti, triggerRadar])

  return (
    <>
      <div
        ref={spotlightRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(218,223,33,0.07) 0%, rgba(218,223,33,0.02) 35%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
          opacity: 0,
          transition: 'opacity 0.6s ease',
          willChange: 'transform',
          mixBlendMode: 'screen',
        }}
      />

      {radarVisible ? (
        <div
          key={radarPulse}
          className="vyvy-radar vyvy-radar-go"
          onAnimationEnd={() => setRadarVisible(false)}
          aria-hidden="true"
        >
          <span className="vyvy-radar-line-h" />
          <span className="vyvy-radar-line-v" />
          <div className="vyvy-radar-reticle">
            <span className="vyvy-radar-ring-2" />
            <span className="vyvy-radar-ring" />
            <span className="vyvy-radar-dot" />
            <span className="vyvy-radar-br vyvy-radar-tl" />
            <span className="vyvy-radar-br vyvy-radar-tr" />
            <span className="vyvy-radar-br vyvy-radar-bl" />
            <span className="vyvy-radar-br vyvy-radar-brr" />
            <span className="vyvy-radar-label">DA KHOA MUC TIEU</span>
          </div>
        </div>
      ) : null}

      {confettiPieces.map((piece) => (
        <span
          key={piece.id}
          className="vyvy-confetti"
          style={
            {
              left: piece.left,
              top: piece.top,
              width: piece.size,
              height: Math.round(piece.size * 1.4),
              background: piece.color,
              animationDelay: `${piece.delay}ms`,
              ['--vyvy-confetti-x' as string]: `${piece.dx}px`,
              ['--vyvy-confetti-y' as string]: `${piece.dy}px`,
              ['--vyvy-confetti-r' as string]: `${piece.rotate}deg`,
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
      ))}
    </>
  )
}
