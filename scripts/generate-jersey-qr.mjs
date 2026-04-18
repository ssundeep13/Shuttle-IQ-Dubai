// Generates a high-resolution branded QR PNG for the jersey print.
// Output: attached_assets/jersey-qr.png
//
// Approach: render the QR as an SVG (for crisp scaling and easy overlay
// of corner brackets), then rasterize via sharp into a 1500x1500 PNG.
import QRCode from 'qrcode';
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const URL = 'https://shuttleiq.org/welcome';
const SIZE = 1500;
const PADDING = 90;          // outer white margin
const BRACKET_LEN = 220;     // corner bracket arm length
const BRACKET_W = 26;        // corner bracket stroke width
const BRACKET_GAP = 30;      // gap between QR edge and brackets
const TEAL = '#00BFA5';

async function main() {
  // 1. Generate the raw QR SVG (no quiet zone — we control padding ourselves).
  const qrSvg = await QRCode.toString(URL, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 0,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  // QRCode SVG uses viewBox="0 0 N N". Extract N (modules count incl. anything internal).
  const viewBoxMatch = qrSvg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!viewBoxMatch) throw new Error('Could not parse QR SVG viewBox');
  const qrModules = Number(viewBoxMatch[1]);

  // Strip the wrapping <svg> so we can re-embed the inner content scaled.
  const innerQr = qrSvg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');

  // 2. Compose final SVG: white background, scaled QR, four teal corner brackets.
  const qrAreaSize = SIZE - PADDING * 2;
  const scale = qrAreaSize / qrModules;
  const qrX = PADDING;
  const qrY = PADDING;

  // Bracket positions (outer corners).
  const bx1 = qrX - BRACKET_GAP;                 // left x of brackets
  const by1 = qrY - BRACKET_GAP;                 // top y of brackets
  const bx2 = qrX + qrAreaSize + BRACKET_GAP;    // right x
  const by2 = qrY + qrAreaSize + BRACKET_GAP;    // bottom y

  const stroke = `stroke="${TEAL}" stroke-width="${BRACKET_W}" stroke-linecap="square" fill="none"`;

  const brackets = [
    // Top-left: horizontal then vertical
    `<line x1="${bx1}" y1="${by1}" x2="${bx1 + BRACKET_LEN}" y2="${by1}" ${stroke} />`,
    `<line x1="${bx1}" y1="${by1}" x2="${bx1}" y2="${by1 + BRACKET_LEN}" ${stroke} />`,
    // Top-right
    `<line x1="${bx2}" y1="${by1}" x2="${bx2 - BRACKET_LEN}" y2="${by1}" ${stroke} />`,
    `<line x1="${bx2}" y1="${by1}" x2="${bx2}" y2="${by1 + BRACKET_LEN}" ${stroke} />`,
    // Bottom-left
    `<line x1="${bx1}" y1="${by2}" x2="${bx1 + BRACKET_LEN}" y2="${by2}" ${stroke} />`,
    `<line x1="${bx1}" y1="${by2}" x2="${bx1}" y2="${by2 - BRACKET_LEN}" ${stroke} />`,
    // Bottom-right
    `<line x1="${bx2}" y1="${by2}" x2="${bx2 - BRACKET_LEN}" y2="${by2}" ${stroke} />`,
    `<line x1="${bx2}" y1="${by2}" x2="${bx2}" y2="${by2 - BRACKET_LEN}" ${stroke} />`,
  ].join('\n');

  const finalSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="#FFFFFF" />
  <g transform="translate(${qrX} ${qrY}) scale(${scale})">
    ${innerQr}
  </g>
  ${brackets}
</svg>`;

  const outPath = resolve('attached_assets/jersey-qr.png');
  await sharp(Buffer.from(finalSvg))
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  // Also write the SVG alongside for print houses that prefer vector.
  writeFileSync(resolve('attached_assets/jersey-qr.svg'), finalSvg);

  console.log(`Wrote ${outPath} (${SIZE}x${SIZE}) encoding ${URL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
