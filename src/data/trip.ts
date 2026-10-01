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
  lviv: { name: 'Lviv', country: 'Ukraine', lngLat: [24.03159, 49.84195] },
  vinnytsia: { name: 'Vinnytsia', country: 'Ukraine', lngLat: [28.46798, 49.23202] },
  suceava: { name: 'Suceava', country: 'Romania', lngLat: [26.25226, 47.647] },
  clujNapoca: { name: 'Cluj-Napoca', country: 'Romania', lngLat: [23.58995, 46.76938] },
  budapest: { name: 'Budapest', country: 'Hungary', lngLat: [19.04024, 47.49788] },
  vienna: { name: 'Vienna', country: 'Austria', lngLat: [16.37204, 48.20846] },
  prague: { name: 'Prague', country: 'Czechia', lngLat: [14.42097, 50.08745] },
  wroclaw: { name: 'Wrocław', country: 'Poland', lngLat: [17.03068, 51.11005] },
} satisfies Record<string, City>

export type CityId = keyof typeof CITIES

const ORADEA = { name: 'Oradea, Romania', lngLat: [21.8929, 47.0481] } satisfies Leg['via'][number] // DN1Y towards the A3
const KRALOVEC: LngLat = [15.98346, 50.68654] // CZ 16 → PL Sudecka

const B = {
  porubne: { name: 'Porubne–Siret', lngLat: [26.0613, 47.9878], external: true },
  luzhanka: { name: 'Luzhanka–Beregsurány', lngLat: [22.5732, 48.165], external: true }, // near Berehove
  bors: { name: 'Borș II – Nagykereki', lngLat: [21.859, 47.197], external: false },
  hegyeshalom: { name: 'Hegyeshalom–Nickelsdorf', lngLat: [17.111, 47.9246], external: false },
  mikulov: { name: 'Mikulov–Drasenhofen', lngLat: [16.6385, 48.7858], external: false },
  kralovec: { name: 'Královec–Lubawka', lngLat: KRALOVEC, external: false },
  gorzyczki: { name: 'Gorzyczki–Věřňovice', lngLat: [18.4069, 49.9363], external: false }, // PL A1 → CZ D1
  lanzhot: { name: 'Lanžhot–Brodské', lngLat: [16.98714, 48.68670], external: false }, // D2 over the Morava
  cunovo: { name: 'Čunovo–Rajka', lngLat: [17.17552, 48.01292], external: false }, // SK D2 → HU M15
} satisfies Record<string, Omit<Leg['borders'][number], 'from' | 'to'>>

export const LEGS: Leg[] = [
  { id: 1, from: 'kyiv', to: 'lviv', date: '2026-12-19', via: [], borders: [] },
  { id: 2, from: 'lviv', to: 'budapest', date: '2026-12-21', via: [], borders: [{ ...B.luzhanka, from: 'UA', to: 'HU' }] },
  { id: 3, from: 'budapest', to: 'vienna', date: '2026-12-26', via: [], borders: [{ ...B.hegyeshalom, from: 'HU', to: 'AT' }] },
  { id: 4, from: 'vienna', to: 'prague', date: '2026-12-30', via: [], borders: [{ ...B.mikulov, from: 'AT', to: 'CZ' }] },
  { id: 5, from: 'prague', to: 'wroclaw', date: '2027-01-02', via: [], borders: [{ ...B.kralovec, from: 'CZ', to: 'PL' }] },
  { id: 6, from: 'wroclaw', to: 'budapest', date: '2027-01-05', via: [], borders: [{ ...B.gorzyczki, from: 'PL', to: 'CZ' }, { ...B.lanzhot, from: 'CZ', to: 'SK' }, { ...B.cunovo, from: 'SK', to: 'HU' }] },
  { id: 7, from: 'budapest', to: 'clujNapoca', date: '2027-01-07', via: [ORADEA], borders: [{ ...B.bors, from: 'HU', to: 'RO' }] },
  { id: 8, from: 'clujNapoca', to: 'suceava', date: '2027-01-08', via: [], borders: [] },
  // The via keeps the leg out of Moldova: without it OSRM cuts through it past Chernivtsi (two extra border queues).
  { id: 9, from: 'suceava', to: 'vinnytsia', date: '2027-01-09', via: [{ name: 'Khmelnytskyi, Ukraine', lngLat: [27.25159, 49.38515] }], borders: [{ ...B.porubne, from: 'RO', to: 'UA' }] }, // М-30 east of the city
  { id: 10, from: 'vinnytsia', to: 'kyiv', date: '2027-01-10', via: [], borders: [] },
]
