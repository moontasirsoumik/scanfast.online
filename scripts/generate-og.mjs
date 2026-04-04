/**
 * Generate the square OG preview image (800x800) using project fonts.
 * Run: node scripts/generate-og.mjs
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Register project fonts (variable woff2)
GlobalFonts.registerFromPath(
  resolve(root, 'node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2'),
  'Outfit'
);
GlobalFonts.registerFromPath(
  resolve(root, 'node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2'),
  'PlusJakartaSans'
);

const SIZE = 800;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');

// --- Background: white ---
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, SIZE, SIZE);

// --- Logo icon (centered) ---
const iconSize = 140;
const iconX = (SIZE - iconSize) / 2;
const iconY = 80;
const iconR = 26;

// Rounded rect
ctx.beginPath();
ctx.moveTo(iconX + iconR, iconY);
ctx.lineTo(iconX + iconSize - iconR, iconY);
ctx.quadraticCurveTo(iconX + iconSize, iconY, iconX + iconSize, iconY + iconR);
ctx.lineTo(iconX + iconSize, iconY + iconSize - iconR);
ctx.quadraticCurveTo(iconX + iconSize, iconY + iconSize, iconX + iconSize - iconR, iconY + iconSize);
ctx.lineTo(iconX + iconR, iconY + iconSize);
ctx.quadraticCurveTo(iconX, iconY + iconSize, iconX, iconY + iconSize - iconR);
ctx.lineTo(iconX, iconY + iconR);
ctx.quadraticCurveTo(iconX, iconY, iconX + iconR, iconY);
ctx.closePath();
ctx.fillStyle = '#0f62fe'; // Carbon blue-60
ctx.fill();

// Document lines inside the icon
ctx.fillStyle = '#ffffff';
const lines = [
  { x: 50, w: 100, y: 38 },
  { x: 38, w: 124, y: 62 },
  { x: 50, w: 100, y: 86 },
  { x: 62, w: 76, y: 110 },
  { x: 74, w: 52, y: 134 },
];
for (const line of lines) {
  const lx = iconX + (line.x / 200) * iconSize;
  const ly = iconY + (line.y / 200) * iconSize;
  const lw = (line.w / 200) * iconSize;
  const lh = (12 / 200) * iconSize;
  ctx.fillRect(lx, ly, lw, lh);
}

// --- Title: "ScanFast.online" ---
const titleY = iconY + iconSize + 90;
ctx.textBaseline = 'alphabetic';

ctx.font = 'bold 96px Outfit';
ctx.fillStyle = '#161616'; // Carbon gray-100
const scanfastWidth = ctx.measureText('ScanFast').width;
ctx.font = 'bold 96px Outfit';
const dotOnlineWidth = ctx.measureText('.online').width;
const totalWidth = scanfastWidth + dotOnlineWidth;
const startX = (SIZE - totalWidth) / 2;

ctx.textAlign = 'left';
ctx.fillText('ScanFast', startX, titleY);

// ".online" in Carbon blue
ctx.fillStyle = '#0f62fe';
ctx.fillText('.online', startX + scanfastWidth, titleY);

// --- Tagline ---
ctx.textAlign = 'center';
ctx.font = '36px PlusJakartaSans';
ctx.fillStyle = '#525252'; // Carbon gray-70
ctx.fillText('Free Document Scanner & PDF Tools', SIZE / 2, titleY + 64);

// --- Pills ---
const pillY = titleY + 120;
const pillHeight = 46;
const pillRadius = pillHeight / 2;
const pillGap = 18;
const pillFontSize = 20;
ctx.font = `${pillFontSize}px PlusJakartaSans`;

const pills = [
  { label: 'Offline-capable', bg: '#e8daff', text: '#6929c4' },  // Carbon purple-20 / purple-70
  { label: 'No tracking',     bg: '#d0e2ff', text: '#0043ce' },  // Carbon blue-20 / blue-70
  { label: 'Open source',     bg: '#a7f0ba', text: '#0e6027' },  // Carbon green-20 / green-70
];

// Measure total pills width
const pillPadding = 28;
const pillWidths = pills.map(p => ctx.measureText(p.label).width + pillPadding * 2);
const totalPillsWidth = pillWidths.reduce((a, b) => a + b, 0) + pillGap * (pills.length - 1);
let pillStartX = (SIZE - totalPillsWidth) / 2;

for (let i = 0; i < pills.length; i++) {
  const p = pills[i];
  const pw = pillWidths[i];
  const px = pillStartX;
  const py = pillY;

  // Pill background
  ctx.beginPath();
  ctx.moveTo(px + pillRadius, py);
  ctx.lineTo(px + pw - pillRadius, py);
  ctx.quadraticCurveTo(px + pw, py, px + pw, py + pillRadius);
  ctx.lineTo(px + pw, py + pillHeight - pillRadius);
  ctx.quadraticCurveTo(px + pw, py + pillHeight, px + pw - pillRadius, py + pillHeight);
  ctx.lineTo(px + pillRadius, py + pillHeight);
  ctx.quadraticCurveTo(px, py + pillHeight, px, py + pillHeight - pillRadius);
  ctx.lineTo(px, py + pillRadius);
  ctx.quadraticCurveTo(px, py, px + pillRadius, py);
  ctx.closePath();
  ctx.fillStyle = p.bg;
  ctx.fill();

  // Pill text
  ctx.textAlign = 'center';
  ctx.fillStyle = p.text;
  ctx.fillText(p.label, px + pw / 2, py + pillHeight / 2 + pillFontSize * 0.35);

  pillStartX += pw + pillGap;
}

// --- Bottom URL ---
ctx.textAlign = 'center';
ctx.font = '22px PlusJakartaSans';
ctx.fillStyle = '#a8a8a8'; // Carbon gray-40
ctx.fillText('scanfast.online', SIZE / 2, SIZE - 50);

// --- Write PNG ---
const pngBuffer = canvas.toBuffer('image/png');
writeFileSync(resolve(root, 'static/og-square.png'), pngBuffer);
console.log(`Generated og-square.png (${SIZE}x${SIZE}, ${(pngBuffer.length / 1024).toFixed(1)} KB)`);
