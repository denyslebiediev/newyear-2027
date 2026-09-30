// Shared layout numbers: the map pads its camera so legs are never hidden under the panel.
export const PANEL_W = 400 // desktop sidebar width, px
export const PEEK = 184 // mobile sheet height when collapsed, px

export const isDesktop = () => matchMedia('(min-width: 768px)').matches
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export const mapPadding = () =>
  isDesktop()
    ? { top: 72, bottom: 72, left: PANEL_W + 110, right: 90 }
    : { top: 80, bottom: PEEK + 24, left: 72, right: 72 }

/** The expanded leg's button; focus goes back to it before its details (and whatever had focus in them) unmount. */
export const focusOpenLeg = () => document.querySelector<HTMLElement>('ol [aria-expanded="true"]')?.focus()
