#!/usr/bin/env node
/**
 * Extracts the React component from DimaTradingOS.html and converts it
 * to a proper ES module for use in the Vite/Electron app.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, '..', '..', 'DimaTradingOS.html');
const OUT_FILE  = path.join(__dirname, '..', 'src', 'DimaTradingOS.jsx');

console.log('Reading:', HTML_FILE);
const html = fs.readFileSync(HTML_FILE, 'utf8');

// ── Extract script content ────────────────────────────────────────────────────
const scriptStart = html.indexOf('<script type="text/babel">');
const scriptEnd   = html.lastIndexOf('ReactDOM.createRoot');

if (scriptStart === -1 || scriptEnd === -1) {
  console.error('Could not find script boundaries!');
  process.exit(1);
}

// Content after <script type="text/babel">\n
let content = html.slice(scriptStart + '<script type="text/babel">'.length, scriptEnd).trim();

// ── Transformations ───────────────────────────────────────────────────────────

// 1. Remove CDN React destructuring line
content = content.replace(
  /^\s*const\s*\{\s*useState,\s*useEffect,\s*useRef,\s*useCallback,\s*Fragment\s*\}\s*=\s*React;\s*\n?/m,
  ''
);

// 2. Add proper imports at the very top
const imports = [
  "import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react';",
  "import Chart from 'chart.js/auto';",
  "",
].join('\n');

content = imports + '\n' + content;

// 3. Remove typeof Chart guard (Chart is now always imported)
content = content.replace(
  /if\s*\(typeof Chart\s*===\s*["']undefined["']\)\s*return;\s*\n?/g,
  ''
);

// 4. Add export default before function DimaTradingOS()
content = content.replace(
  /^function DimaTradingOS\(\)/m,
  'export default function DimaTradingOS()'
);

// 5. Update sendPrompt to work in proper React (toast is in index.html)
// sendPrompt is already defined and works with the #toast div in index.html
// No change needed.

// 6. Fix window.open calls — use electronAPI if in Electron
content = content.replace(
  /window\.open\(url,\s*'_blank',\s*'width=600,height=500'\)/g,
  "(window.electronAPI ? window.electronAPI.openExternal(url) : window.open(url, '_blank'))"
);

console.log('Converted component: ' + content.length + ' chars, ' + content.split('\n').length + ' lines');
console.log('Writing:', OUT_FILE);
fs.writeFileSync(OUT_FILE, content, 'utf8');
console.log('Done ✓');
