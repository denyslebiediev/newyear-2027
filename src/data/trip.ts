// Hand-edited trip data. Imports nothing: tools/build-routes.ts imports this file directly.

export type LngLat = [number, number]

export type City = { name: string; country: string; lngLat: LngLat }

export type Leg = {
  id: number
  from: CityId
  to: CityId
  /** 'YYYY-MM-DD' once the schedule is known */
  date: string | null
  /** Forced route points. Keep them ON the through road, never on a city centre: centroids make OSRM do U-turns and spurs. */
  via: { name: string; lngLat: LngLat }[]
  /** In crossing order. lngLat is on the road at the border; build-routes.ts checks the route passes within 1 km. */
  borders: { name: string; from: string; to: string; lngLat: LngLat; external: boolean }[]
}

export const CITIES = {
  kyiv: { name: 'Kyiv', country: 'Ukraine', lngLat: [30.52406, 50.45024] },
  chernivtsi: { name: 'Chernivtsi', country: 'Ukraine', lngLat: [25.93765, 48.28647] },
  suceava: { name: 'Suceava', country: 'Romania', lngLat: [26.25226, 47.647] },
  clujNapoca: { name: 'Cluj-Napoca', country: 'Romania', lngLat: [23.58995, 46.76938] },
  budapest: { name: 'Budapest', country: 'Hungary', lngLat: [19.04024, 47.49788] },
  vienna: { name: 'Vienna', country: 'Austria', lngLat: [16.37204, 48.20846] },
  prague: { name: 'Prague', country: 'Czechia', lngLat: [14.42097, 50.08745] },
  wroclaw: { name: 'Wrocław', country: 'Poland', lngLat: [17.03068, 51.11005] },
} satisfies Record<string, City>

export type CityId = keyof typeof CITIES

const CLUJ = { name: 'Cluj-Napoca, Romania', lngLat: [23.5728, 46.7632] } satisfies Leg['via'][number] // DN1, west side
const ORADEA = { name: 'Oradea, Romania', lngLat: [21.8929, 47.0481] } satisfies Leg['via'][number] // DN1Y towards the A3
const KRALOVEC: LngLat = [15.98346, 50.68654] // CZ 16 → PL Sudecka

const B = {
  porubne: { name: 'Porubne–Siret', lngLat: [26.0613, 47.9878], external: true },
  bors: { name: 'Borș II – Nagykereki', lngLat: [21.859, 47.197], external: false },
  hegyeshalom: { name: 'Hegyeshalom–Nickelsdorf', lngLat: [17.111, 47.9246], external: false },
  mikulov: { name: 'Mikulov–Drasenhofen', lngLat: [16.6385, 48.7858], external: false },
  kralovec: { name: 'Královec–Lubawka', lngLat: KRALOVEC, external: false },
  lanzhot: { name: 'Lanžhot–Brodské', lngLat: [16.98714, 48.68670], external: false }, // D2 over the Morava
  cunovo: { name: 'Čunovo–Rajka', lngLat: [17.17552, 48.01292], external: false }, // SK D2 → HU M15
} satisfies Record<string, Omit<Leg['borders'][number], 'from' | 'to'>>

export const LEGS: Leg[] = [
  { id: 1, from: 'kyiv', to: 'chernivtsi', date: '2026-12-19', via: [], borders: [] },
  { id: 2, from: 'chernivtsi', to: 'suceava', date: '2026-12-20', via: [], borders: [{ ...B.porubne, from: 'UA', to: 'RO' }] },
  { id: 3, from: 'suceava', to: 'clujNapoca', date: '2026-12-20', via: [], borders: [] },
  { id: 4, from: 'clujNapoca', to: 'budapest', date: null, via: [ORADEA], borders: [{ ...B.bors, from: 'RO', to: 'HU' }] },
  { id: 5, from: 'budapest', to: 'vienna', date: '2026-12-23', via: [], borders: [{ ...B.hegyeshalom, from: 'HU', to: 'AT' }] },
  { id: 6, from: 'vienna', to: 'prague', date: '2026-12-28', via: [], borders: [{ ...B.mikulov, from: 'AT', to: 'CZ' }] },
  { id: 7, from: 'prague', to: 'wroclaw', date: '2027-01-02', via: [], borders: [{ ...B.kralovec, from: 'CZ', to: 'PL' }] },
  { id: 8, from: 'wroclaw', to: 'prague', date: null, via: [], borders: [{ ...B.kralovec, from: 'PL', to: 'CZ' }] },
  { id: 9, from: 'prague', to: 'budapest', date: null, via: [], borders: [{ ...B.lanzhot, from: 'CZ', to: 'SK' }, { ...B.cunovo, from: 'SK', to: 'HU' }] },
  { id: 10, from: 'budapest', to: 'suceava', date: null, via: [ORADEA, CLUJ], borders: [{ ...B.bors, from: 'HU', to: 'RO' }] },
  { id: 11, from: 'suceava', to: 'chernivtsi', date: '2027-01-08', via: [], borders: [{ ...B.porubne, from: 'RO', to: 'UA' }] },
  { id: 12, from: 'chernivtsi', to: 'kyiv', date: '2027-01-08', via: [], borders: [] },
]
