import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion, useDragControls, useMotionValue } from 'motion/react'
import { LEGS } from '../lib/legs'
import { PANEL_W, PEEK, isDesktop, reducedMotion } from '../lib/layout'
import { Footer, LegList, LegPeek, TripHeader } from './LegList'

type Props = {
  hoveredId: number | null
  selectedId: number | null
  still: boolean
  onHover: (id: number | null) => void
  onSelect: (id: number | null) => void
  onToggleStill: () => void
}

const GLASS = 'bg-navy/75 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)]'

function useDesktop() {
  const [desktop, setDesktop] = useState(isDesktop)
  useEffect(() => {
    const mq = matchMedia('(min-width: 768px)')
    const on = () => setDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desktop
}

export default function Panel(props: Props) {
  const { hoveredId, selectedId, onHover, onSelect } = props
  const desktop = useDesktop()
  const list = <LegList hoveredId={hoveredId} onHover={onHover} selectedId={selectedId} onSelect={onSelect} />
  const footer = <Footer still={props.still} onToggleStill={props.onToggleStill} />

  if (desktop) {
    return (
      <aside className={`absolute top-4 bottom-4 left-4 flex flex-col overflow-y-auto rounded-2xl ${GLASS}`} style={{ width: PANEL_W }}>
        <div className="px-6 pt-6 pb-4">
          <TripHeader hoveredId={hoveredId} onHover={onHover} onReset={selectedId !== null ? () => onSelect(null) : undefined} />
        </div>
        <div className="relative min-h-48 flex-1 overflow-y-auto overscroll-contain border-t border-white/10 px-3 py-2">{list}</div>
        <div className="border-t border-white/10 px-6 py-4">{footer}</div>
      </aside>
    )
  }
  return <Sheet {...props} list={list} footer={footer} />
}

/** Mobile bottom sheet: dragged only by its handle row, so the list scrolls natively. */
function Sheet({ selectedId, hoveredId, onHover, onSelect, list, footer }: Props & { list: ReactNode; footer: ReactNode }) {
  const [height, setHeight] = useState(() => window.innerHeight - 56)
  const peekY = height - PEEK
  const y = useMotionValue(peekY)
  const [open, setOpen] = useState(false)
  const controls = useDragControls()
  const dragged = useRef(false)
  const grabber = useRef<HTMLButtonElement>(null)
  const leg = LEGS.find(l => l.id === selectedId)

  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight - 56)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const spring = () => (reducedMotion() ? { duration: 0 } : { type: 'spring' as const, stiffness: 380, damping: 38 })
  const snap = (toOpen: boolean) => {
    setOpen(toOpen)
    animate(y, toOpen ? 0 : peekY, spring()) // also when `open` is unchanged, e.g. a half drag that springs back
  }
  // Picking a leg collapses the sheet so the map can show it; the peek then carries the leg summary.
  const [prevSelected, setPrevSelected] = useState(selectedId)
  if (selectedId !== prevSelected) {
    setPrevSelected(selectedId)
    if (selectedId !== null) setOpen(false)
  }
  useEffect(() => { animate(y, open ? 0 : peekY, spring()) }, [open, peekY, y])
  // The list goes inert when the sheet collapses; don't leave keyboard focus stranded inside it.
  useLayoutEffect(() => {
    if (!open && document.getElementById('sheet-body')?.contains(document.activeElement)) grabber.current?.focus()
  }, [open])

  return (
    <motion.section
      aria-label="Trip"
      className={`fixed inset-x-0 bottom-0 flex flex-col rounded-t-3xl ${GLASS}`}
      style={{ height, y }}
      drag="y"
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ top: 0, bottom: peekY }}
      dragElastic={0.08}
      dragMomentum={false}
      onDragStart={() => { dragged.current = true }}
      onDragEnd={(_, info) => snap(y.get() + info.velocity.y * 0.2 < peekY / 2)}
    >
      <div
        className="touch-none px-5 pt-2 pb-4"
        onPointerDown={e => { dragged.current = false; controls.start(e) }}
      >
        <button
          ref={grabber}
          type="button"
          aria-expanded={open}
          aria-controls="sheet-body"
          aria-label={open ? 'Collapse the leg list' : 'Show all legs'}
          onClick={e => { if (e.detail === 0 || !dragged.current) snap(!open) }} // detail 0 = keyboard, never the end of a drag
          className="mx-auto mb-3 block h-5 w-16"
        >
          <span className="mx-auto block h-1.5 w-10 rounded-full bg-white/40" />
        </button>
        {leg && !open ? <LegPeek leg={leg} onClose={() => { grabber.current?.focus(); onSelect(null) }} /> : <TripHeader hoveredId={hoveredId} onHover={onHover} />}
      </div>
      <div id="sheet-body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/10 px-3 py-2" inert={!open}>
        {list}
        <div className="px-2 py-4">{footer}</div>
      </div>
    </motion.section>
  )
}
