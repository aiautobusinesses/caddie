import sharp from "sharp"

function makeSvg(size) {
  const cx = size / 2
  const fontSize = Math.round(size * 0.27)
  // letter-spacing roughly 0.04em in SVG units
  const letterSpacing = Math.round(size * 0.01)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <circle cx="${cx}" cy="${cx}" r="${cx}" fill="#16181c"/>
  <text
    x="${cx}" y="${cx}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${fontSize}"
    font-weight="bold"
    fill="#ffffff"
    text-anchor="middle"
    dominant-baseline="central"
    letter-spacing="${letterSpacing}"
  >GYST</text>
</svg>`
}

async function makeIcon(size, outPath) {
  const svg = Buffer.from(makeSvg(size))
  await sharp(svg).png().toFile(outPath)
  console.log("wrote", outPath)
}

await makeIcon(192, "public/icons/icon-192.png")
await makeIcon(512, "public/icons/icon-512.png")
await makeIcon(180, "public/icons/apple-touch-icon.png")
