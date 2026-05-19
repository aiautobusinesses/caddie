import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "..", "public", "icons")

const sizes = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]

function iconSvg(size) {
  const center = size / 2
  const radius = size * 0.42
  const fontSize = Math.round(size * 0.44)

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#ffffff"/>
  <circle cx="${center}" cy="${center}" r="${radius}" fill="#111827"/>
  <text x="${center}" y="${center}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">C</text>
</svg>`
}

fs.mkdirSync(outDir, { recursive: true })

for (const [filename, size] of sizes) {
  const buffer = await sharp(Buffer.from(iconSvg(size))).png().toBuffer()
  const target = path.join(outDir, filename)
  fs.writeFileSync(target, buffer)
  console.log(`Wrote ${target}`)
}
