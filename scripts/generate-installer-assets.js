#!/usr/bin/env node
/**
 * generate-installer-assets.js
 * Generates BMP images for the NSIS installer wizard.
 *
 * Outputs:
 *   build-resources/installer-sidebar.bmp  (164 × 314 px)
 *   build-resources/installer-header.bmp   (150 × 57 px)
 */
'use strict';
const { Jimp, loadFont, rgbaToInt, JimpMime, HorizontalAlign, VerticalAlign, BlendMode } = require('jimp');
const path = require('path');
const fs   = require('fs');

const ROOT     = path.join(__dirname, '..');
const OUTDIR   = path.join(ROOT, 'build-resources');
const LOGOPATH = path.join(ROOT, 'public', 'dima_trading_os_icon_256.png');

fs.mkdirSync(OUTDIR, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// ── colour helpers ────────────────────────────────────────────────────────────
const C = {
  bg:      rgbaToInt(13,  17,  23,  255),  // #0d1117
  panel:   rgbaToInt(22,  27,  34,  255),  // #161b22
  green:   rgbaToInt(63,  185, 80,  255),  // #3fb950
  green2:  rgbaToInt(35,  134, 54,  255),  // #238636
  line:    rgbaToInt(33,  38,  45,  255),  // #21262d
  white:   rgbaToInt(255, 255, 255, 255),
  grey:    rgbaToInt(139, 148, 158, 255),  // #8b949e
  transp:  rgbaToInt(0,   0,   0,   0),
};

function fillRect(img, x1, y1, x2, y2, colour) {
  for (let y = y1; y < y2; y++)
    for (let x = x1; x < x2; x++)
      img.setPixelColor(colour, x, y);
}

function hLine(img, x1, x2, y, colour) {
  for (let x = x1; x < x2; x++) img.setPixelColor(colour, x, y);
}

function vLine(img, x, y1, y2, colour) {
  for (let y = y1; y < y2; y++) img.setPixelColor(colour, x, y);
}

function circle(img, cx, cy, r, colour) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx*dx + dy*dy <= r*r)
        img.setPixelColor(colour, cx+dx, cy+dy);
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR  164 × 314 px
// ─────────────────────────────────────────────────────────────────────────────
async function makeSidebar() {
  const W = 164, H = 314;
  const img = new Jimp({ width: W, height: H, color: C.bg });

  // -- left green accent stripe (4px wide)
  fillRect(img, 0, 0, 4, H, C.green);

  // -- top subtle lighter band
  for (let y = 0; y < 60; y++) {
    const a = Math.floor((60 - y) / 60 * 15);
    const c = rgbaToInt(255, 255, 255, a);
    fillRect(img, 4, y, W, y+1, c);
  }

  // -- logo
  try {
    const logo = await Jimp.fromBuffer(fs.readFileSync(LOGOPATH));
    logo.resize({ w: 72, h: 72 });
    const lx = Math.floor((W - 72) / 2);
    img.composite(logo, lx, 22);
  } catch (e) { console.warn('Logo load failed:', e.message); }

  // -- separator under logo
  hLine(img, 16, W-16, 107, C.line);
  hLine(img, 16, W-16, 108, C.green2);

  // -- brand text block (using pixel art approach for letters)
  // Load built-in font
  try {
    const font = await loadFont('https://cdn.jsdelivr.net/npm/@jimp/plugin-print@0.22.10/fonts/open-sans/open-sans-16-white.fnt').catch(() => null);
    // Fonts from URL won't work offline — skip, use pixel rects
  } catch {}

  // Draw "DIMA" as thick pixel rectangles (manual pixel font fallback)
  // Use a simple approach: draw coloured bars to represent text visually
  // Green bar for "DIMA"
  fillRect(img, 20, 118, W-20, 122, C.green);

  // Write version text at the very bottom using simple pixel bar
  fillRect(img, 20, 285, W-20, 287, C.green2);

  // -- feature bullet dots with lines
  const featureY = [152, 168, 184, 200, 216];
  featureY.forEach(fy => {
    circle(img, 18, fy + 4, 3, C.green);
    hLine(img, 26, W - 12, fy + 4, C.line);
    hLine(img, 26, W - 12, fy + 5, C.line);
  });

  // -- bottom decorative circles
  [W/2 - 18, W/2, W/2 + 18].forEach(cx => {
    circle(img, Math.round(cx), 268, 4, C.green2);
    circle(img, Math.round(cx), 268, 2, C.green);
  });

  // -- bottom border line
  hLine(img, 4, W, H-8, C.line);
  hLine(img, 4, W, H-7, C.green2);

  const out = path.join(OUTDIR, 'installer-sidebar.bmp');
  await img.write(out);
  console.log(`✓ installer-sidebar.bmp (${W}×${H})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HEADER BANNER  150 × 57 px  (inner wizard pages)
// ─────────────────────────────────────────────────────────────────────────────
async function makeHeader() {
  const W = 150, H = 57;
  const img = new Jimp({ width: W, height: H, color: C.bg });

  // right half slightly lighter
  fillRect(img, W/2, 0, W, H, C.panel);

  // left green accent bar
  fillRect(img, 0, 0, 3, H, C.green);

  // logo small
  try {
    const logo = await Jimp.fromBuffer(fs.readFileSync(LOGOPATH));
    logo.resize({ w: 36, h: 36 });
    img.composite(logo, 8, Math.floor((H-36)/2));
  } catch {}

  // decorative lines suggesting "DIMA TRADING OS" text
  const tx = 52;
  fillRect(img, tx, 10, tx + 70, 13, C.green);          // "DIMA" bar
  fillRect(img, tx, 22, tx + 58, 24, C.grey);            // subtitle bar
  fillRect(img, tx, 30, tx + 45, 31, rgbaToInt(139,148,158,120)); // smaller bar

  // bottom separator
  hLine(img, 0, W, H-2, C.line);
  hLine(img, 0, W, H-1, C.green2);

  const out = path.join(OUTDIR, 'installer-header.bmp');
  await img.write(out);
  console.log(`✓ installer-header.bmp (${W}×${H})`);
}

(async () => {
  console.log('\nGenerating installer wizard assets...');
  await makeSidebar();
  await makeHeader();
  console.log(`Done — saved to build-resources/  (v${pkg.version})\n`);
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
