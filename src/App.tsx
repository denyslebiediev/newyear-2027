import { useEffect, useState } from 'react'
import TripMap from './components/TripMap'
import Panel from './components/Panel'
import { focusOpenLeg, reducedMotion } from './lib/layout'

export default function App() {
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // "still" = no snow, no pulsing, no intro. Starts from the OS reduced-motion setting; the Snow button flips it.
  const [still, setStill] = useState(reducedMotion)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key !== 'Escape') return
      // The focused control may unmount with the selection; move focus somewhere that stays.
      const a = document.activeElement
      if (a?.closest('ol, header')) focusOpenLeg()
      else if (a?.closest('[data-peek]')) document.querySelector<HTMLElement>('[aria-controls="sheet-body"]')?.focus()
      setSelectedId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className={`fixed inset-0 overflow-hidden bg-navy ${still ? 'still' : ''}`}>
      <TripMap hoveredId={hoveredId} selectedId={selectedId} still={still} onHover={setHoveredId} onSelect={setSelectedId} />
      {!still && (
        <div aria-hidden="true">
          <span className="snow snow-a" />
          <span className="snow snow-b" />
          <span className="snow snow-c" />
        </div>
      )}
      <Panel
        hoveredId={hoveredId}
        selectedId={selectedId}
        still={still}
        onHover={setHoveredId}
        onSelect={setSelectedId}
        onToggleStill={() => setStill(s => !s)}
      />
    </main>
  )
}
