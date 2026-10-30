import { useRef, useState, type TouchEvent } from 'react'

const DECIDE_PX = 10 // movement before we know if it's a sideways swipe or a scroll
const SWIPE_PX = 60 // how far to drag before letting go counts as a swipe

/**
 * Sideways swipe, like flipping pages: swipe left for `onLeft`, right for `onRight`.
 * Up/down still scrolls the page (pair with `touch-action: pan-y`). Touches that start inside an
 * open sheet are ignored, since sheets live inside the screen that owns them.
 * `offset` follows the finger so the content can move with it; it's damped when that way is blocked.
 */
export function useSwipe({ onLeft, onRight, canLeft = true, canRight = true }: { onLeft: () => void; onRight: () => void; canLeft?: boolean; canRight?: boolean }) {
  const start = useRef<{ x: number; y: number; dir: 'h' | 'v' | null } | null>(null)
  const [offset, setOffset] = useState(0)

  const end = () => {
    start.current = null
    setOffset(0)
  }

  const handlers = {
    onTouchStart(e: TouchEvent) {
      const t = e.touches[0]
      if (e.touches.length > 1 || (e.target as Element).closest('[role="dialog"]')) return end()
      start.current = { x: t.clientX, y: t.clientY, dir: null }
    },
    onTouchMove(e: TouchEvent) {
      const s = start.current
      if (!s) return
      const dx = e.touches[0].clientX - s.x
      const dy = e.touches[0].clientY - s.y
      if (!s.dir) {
        if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return
        s.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
      if (s.dir !== 'h') return
      const blocked = (dx < 0 && !canLeft) || (dx > 0 && !canRight)
      setOffset(blocked ? dx / 6 : dx / 2.5)
    },
    onTouchEnd(e: TouchEvent) {
      const s = start.current
      end()
      if (!s || s.dir !== 'h') return
      const dx = e.changedTouches[0].clientX - s.x
      if (dx <= -SWIPE_PX && canLeft) onLeft()
      else if (dx >= SWIPE_PX && canRight) onRight()
    },
    onTouchCancel: end,
  }

  return { handlers, offset }
}
