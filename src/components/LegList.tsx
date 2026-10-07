import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { focusOpenLeg } from '../lib/layout'
import { LEGS, TOTALS, fmtDate, fmtDuration, fmtKm, gmapsUrl, legNo, type TripLeg } from '../lib/legs'

type Hover = { hoveredId: number | null; onHover: (id: number | null) => void }
type Select = { selectedId: number | null; onSelect: (id: number | null) => void }

const mouseOnly = (fn: () => void) => (e: React.PointerEvent) => { if (e.pointerType === 'mouse') fn() }

export function TripHeader({ hoveredId, onHover, onReset }: Hover & { onReset?: () => void }) {
  const hours = Math.round(TOTALS.min / 60)
  return (
    <header>
      <h1 className="font-display text-3xl leading-none font-semibold tracking-tight md:text-[2.5rem]">New Year 2027</h1>
      <p className="mt-2 hidden text-[15px] text-muted md:block">A winter road trip from Kyiv across Central Europe, and home again.</p>
      <p className="mt-3 font-display text-base leading-snug md:mt-4 md:text-xl">
        {fmtKm(TOTALS.km)} through {TOTALS.cities} cities in {TOTALS.countries} countries, about {hours} hours at the wheel, in {TOTALS.legs} legs.
      </p>
      <div className="mt-1 flex items-center justify-between gap-3 md:min-h-8">
        <p className="text-sm text-muted">{TOTALS.datesPending && 'Dates to be confirmed.'}</p>
        {onReset && (
          <button type="button" onClick={() => { focusOpenLeg(); onReset() }} className="rounded-full border border-white/15 px-3 py-1 text-sm hover:border-white/30">
            Whole trip
          </button>
        )}
      </div>
      {/* The trip in one line: each segment is a leg, sized by distance, in its map colour. */}
      <div className="mt-2 flex h-1.5 gap-0.5" aria-hidden="true">
        {LEGS.map(l => (
          <span
            key={l.id}
            className="rounded-full transition-opacity duration-200"
            style={{ flexGrow: l.km, background: l.color, opacity: hoveredId === null || hoveredId === l.id ? 1 : 0.3 }}
            onPointerEnter={mouseOnly(() => onHover(l.id))}
            onPointerLeave={mouseOnly(() => onHover(null))}
          />
        ))}
      </div>
    </header>
  )
}

const Arrow = () => (
  <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M6 3h7v7M13 3 4 12" />
  </svg>
)

export function MapsLink({ leg, className = '' }: { leg: TripLeg; className?: string }) {
  return (
    <a
      href={gmapsUrl(leg)}
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center gap-2 rounded-full bg-frost px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-white ${className}`}
    >
      Open in Google Maps
      <Arrow />
    </a>
  )
}

const queue = (leg: TripLeg) => leg.borders.some(b => b.external)
const borderWait = (leg: TripLeg) => queue(leg) && <span className="text-muted"> + border wait</span>

export function LegDetails({ leg }: { leg: TripLeg }) {
  const date = fmtDate(leg.date)
  return (
    <div className="pb-5 pl-9 pr-1">
      <p className="font-display text-3xl leading-tight">{fmtKm(leg.km)}</p>
      <p className="text-sm tabular-nums">{fmtDuration(leg.min)} of driving{borderWait(leg)}</p>
      <dl className="mt-3 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        {date && (<><dt className="text-muted">Date</dt><dd>{date}</dd></>)}
        <dt className="text-muted">Border{leg.borders.length > 1 && 's'}</dt>
        <dd>
          {leg.borders.length ? (
            leg.borders.map(b => (
              <span key={b.name} className="block">
                {b.name}, {b.from} → {b.to}
                {b.external && <span className="block text-gold">EU external border, expect a queue</span>}
                {b.queueUrl && (
                  <a href={b.queueUrl} target="_blank" rel="noopener" className="mt-0.5 inline-flex items-center gap-1.5 text-ice underline-offset-2 hover:underline">
                    Check the live queue
                    <Arrow />
                  </a>
                )}
              </span>
            ))
          ) : (
            <span className="text-muted">None, {leg.fromCity.country} only</span>
          )}
        </dd>
        {leg.via.length > 0 && (<><dt className="text-muted">Via</dt><dd>{leg.via.map(v => v.name.split(',')[0]).join(', ')}</dd></>)}
      </dl>
      <MapsLink leg={leg} className="mt-4" />
    </div>
  )
}

export function LegList({ hoveredId, onHover, selectedId, onSelect }: Hover & Select) {
  const items = useRef(new Map<number, HTMLLIElement>())

  // Keep the hovered (from the map) or selected leg visible in the list.
  useEffect(() => {
    const id = selectedId ?? hoveredId
    if (id !== null) items.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [hoveredId, selectedId])

  return (
    <ol aria-label="Legs" className="flex flex-col">
      {LEGS.map(leg => {
        const selected = leg.id === selectedId
        const lit = selected || leg.id === hoveredId
        const date = fmtDate(leg.date)
        return (
          <li
            key={leg.id}
            ref={el => { if (el) items.current.set(leg.id, el); else items.current.delete(leg.id) }}
            onPointerEnter={mouseOnly(() => onHover(leg.id))}
            onPointerLeave={mouseOnly(() => onHover(null))}
            className={`rounded-xl transition-colors ${lit ? 'bg-white/[0.06]' : ''}`}
          >
            <button
              type="button"
              aria-expanded={selected}
              onClick={() => onSelect(selected ? null : leg.id)}
              className="grid w-full grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-3 rounded-xl px-2 py-3 text-left"
            >
              <span className="text-xs font-medium tabular-nums text-muted">{legNo(leg.id)}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  <span className="h-1 w-4 shrink-0 rounded-full" style={{ background: leg.color }} />
                  <span className="truncate">
                    {leg.fromCity.name} <span aria-hidden="true">→</span><span className="sr-only">to</span> {leg.toCity.name}
                  </span>
                </span>
                {(date || queue(leg)) && (
                  <span className="mt-0.5 block pl-6 text-xs text-muted">
                    {date}{date && queue(leg) && ', '}{queue(leg) && 'plus a border queue'}
                  </span>
                )}
              </span>
              <span className="text-right text-sm tabular-nums">
                {fmtKm(leg.km)}
                <span className="block text-xs text-muted">{fmtDuration(leg.min)}</span>
              </span>
            </button>
            <AnimatePresence initial={false}>
              {selected && (
                <motion.div
                  key="details"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  onAnimationComplete={() => items.current.get(leg.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
                  className="overflow-hidden"
                >
                  <LegDetails leg={leg} />
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        )
      })}
    </ol>
  )
}

/** Compact summary for the mobile sheet's collapsed state. */
export function LegPeek({ leg, onClose }: { leg: TripLeg; onClose: () => void }) {
  const date = fmtDate(leg.date)
  return (
    <div data-peek>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted tabular-nums">
            Leg {legNo(leg.id)} of {LEGS.length}{date && `, ${date}`}
          </p>
          <p className="truncate font-display text-xl">
            {leg.fromCity.name} <span aria-hidden="true">→</span><span className="sr-only">to</span> {leg.toCity.name}
          </p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-sm">
          Whole trip
        </button>
      </div>
      <p className="mt-1 text-sm tabular-nums">
        {fmtKm(leg.km)}, {fmtDuration(leg.min)}{borderWait(leg)}
        {leg.borders.length > 0 && <span className="text-muted">, via {leg.borders.map(b => b.name).join(' and ')}</span>}
      </p>
      <MapsLink leg={leg} className="mt-3" />
    </div>
  )
}

export function Footer({ still, onToggleStill }: { still: boolean; onToggleStill: () => void }) {
  return (
    <footer className="flex items-end justify-between gap-4 text-xs text-muted">
      <p>Drive times are OpenStreetMap routing estimates and leave out border queues.</p>
      <button
        type="button"
        aria-pressed={!still}
        onClick={onToggleStill}
        className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-frost aria-pressed:border-ice/60 aria-pressed:text-ice"
      >
        Snow
      </button>
    </footer>
  )
}
