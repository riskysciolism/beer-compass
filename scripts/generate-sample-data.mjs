#!/usr/bin/env node
/**
 * Generates the sample data under public/data/ including embedded base64 images.
 * Usage: npm run data:generate
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'public/data')

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Small colorfield thumbnail with gradient and arc. */
function makeThumb(index, size = 96) {
  const palettes = [
    [
      [64, 32, 8],
      [244, 178, 62],
    ],
    [
      [26, 42, 58],
      [122, 196, 214],
    ],
    [
      [46, 20, 40],
      [226, 128, 178],
    ],
    [
      [24, 48, 28],
      [148, 210, 108],
    ],
    [
      [58, 40, 10],
      [238, 220, 120],
    ],
    [
      [40, 24, 14],
      [206, 156, 118],
    ],
  ]
  const [dark, light] = palettes[index % palettes.length]
  const rgba = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = y / (size - 1)
      const cx = (x / (size - 1)) * 2 - 1
      const cy = (y / (size - 1)) * 2 - 1
      const ring = Math.abs(Math.hypot(cx, cy) - 0.55) < 0.06 ? 1 : 0
      const i = (y * size + x) * 4
      const base = [
        dark[0] + (light[0] - dark[0]) * t,
        dark[1] + (light[1] - dark[1]) * t,
        dark[2] + (light[2] - dark[2]) * t,
      ]
      rgba[i] = Math.round(ring ? 253 : base[0])
      rgba[i + 1] = Math.round(ring ? 246 : base[1])
      rgba[i + 2] = Math.round(ring ? 232 : base[2])
      rgba[i + 3] = 255
    }
  }
  return `data:image/png;base64,${encodePng(size, size, rgba).toString('base64')}`
}

const SEEDS = [
  ['Brouwerij de Regionaal', 'Planteraan 33, 3611 AA Uithoorn', 'Amber Ale'],
  ['Brouwerij ’t IJ', 'Bantammerdijk 1, 3621 EA Vreeland'],
  ['Brouwerij de Molen', 'Molenpad 2, 3621 AA Vreeland'],
  ['Brouwerij Ommegang', 'Kruisstraat 22, 3771 CC Barneveld'],
  ['Brouwerij ' + "'t" + ' Vaartje', 'Molenstraat 9, 3621 AV Vreeland'],
  ['Brouwerij Maaienbroek', 'Kerkstraat 14, 3621 BA Vreeland'],
  ['Brouwerij de Bonte Koe', 'Molendijk 5, 3621 BB Vreeland'],
  ['Brouwerij Schouten', 'Stationsweg 3, 3621 BC Vreeland'],
  ['Brouwerij De Korenaar', 'Langerakdijk 8, 3621 EK Vreeland'],
  ['Brouwerij ’t Vaartje', 'Vaartweg 7, 3621 EV Vreeland'],
  ['Brouwerij de Gooyer', 'Korte Dijk 11, 3621 EA Vreeland'],
  ['Brouwerij Rieker', 'Waldijk 1, 3621 KW Vreeland'],
  ['Brouwerij Puijekker', 'Lindelaan 21, 3621 EV Vreeland'],
  ['Brouwerij De Tuin', 'Rijnlaan 4, 3621 EV Vreeland'],
  ['Brouwerij Hopman', 'Weerkade 6, 3621 EZ Vreeland'],
  ['Brouwerij Korte Boot', 'Zuiderweg 12, 3621 ET Vreeland'],
  ['Brouwerij de Witte', 'Dorpsstraat 30, 3621 EH Vreeland'],
  ['Brouwerij Zilver', 'Havenkade 2, 3621 EC Vreeland'],
  ['Brouwerij de Onderneming', 'Kerkplein 2, 3621 EV Vreeland'],
  ['Brouwerij Amberlied', 'Kanaalweg 18, 3621 EK Vreeland'],
  ['Brouwerij Nachtwacht', 'Binnenweg 9, 3621 EB Vreeland'],
  ['Brouwerij Vaartzicht', 'Vaartzicht 15, 3621 EV Vreeland'],
  ['Brouwerij de Bruine', 'Oudegracht 44, 3611 CS Utrecht'],
  ['Brouwerij Rivierenland', 'Rivierweg 2, 3621 EV Vreeland'],
  ['Brouwerij de Blauwe Huis', 'Oostzijde 88, 3611 LS Utrecht'],
  ['Brouwerij Zeil', 'Rijksweg 210, 3621 CD Vreeland'],
  ['Brouwerij Kalender', 'Kalenderstraat 5, 3621 CV Vreeland'],
  ['Brouwerij Zomerhof', 'Zomerhofweg 3, 3621 GP Vreeland'],
]

const STYLES = [
  'Klassisches helles Ale, mild und hopfig. Schankt frisch vom Fass.',
  'Dunkles Doppelbock, unfiltriert, 7,5 % vol. Im Fass bestellen.',
  'Kräftiges Pale Ale mit Orangenschalen und Zitrusnoten, 6,2 % vol.',
  'Saison mit Pfeffer und Estragon, Referenz auf das alte Brauhaus.',
  'Geröstetes Porter, 5,4 % vol. Passt zu geräuchertem Käse.',
  'Weißbier mit Hefe und Koriander, 5,0 % vol. Erfrischend im Sommer.',
]

const items = SEEDS.map(([name, address], index) => {
  // Spread deterministically around Breukelen (52.2011, 4.8796).
  const longitude = Number((4.8796 + Math.sin(index * 1.7) * 0.09 + index * 0.004).toFixed(6))
  const latitude = Number((52.2011 + Math.cos(index * 1.3) * 0.055).toFixed(6))
  return {
    position: { longitude, latitude },
    address,
    image: makeThumb(index),
    name,
    description: `${STYLES[index % STYLES.length]} Schanktisch vorhanden, Aufenthalt gern erlaubt.`,
  }
})

const data = {
  version: 1,
  updatedAt: '2026-01-15T10:00:00.000Z',
  items,
}
const version = {
  version: data.version,
  updatedAt: data.updatedAt,
  count: items.length,
  schema: 1,
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(resolve(OUT_DIR, 'data.json'), `${JSON.stringify(items, null, 2)}\n`)
writeFileSync(resolve(OUT_DIR, 'version.json'), `${JSON.stringify(version, null, 2)}\n`)

process.stdout.write(
  `data.json: ${items.length} Einträge, ${(JSON.stringify(items).length / 1024).toFixed(1)} kB\n`,
)
process.stdout.write('version.json: Version 1\n')
