#!/usr/bin/env node
/**
 * build_installer.js — Build the Windows installer
 *
 * Usage:
 *   node scripts/build_installer.js           → personal build (keeps your data)
 *   node scripts/build_installer.js --clean   → customer build (empty data, fresh start)
 */
'use strict';
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const isClean = process.argv.includes('--clean');
const ROOT    = path.join(__dirname, '..');

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║   DIMA TRADING OS — Windows Installer Builder    ║');
console.log(`║   Mode: ${isClean ? 'CUSTOMER (clean data)' : 'PERSONAL (your data)  '}     ║`);
console.log('╚══════════════════════════════════════════════════╝\n');

// ── Step 1: Build Vite app ────────────────────────────────────────────────────
console.log('[1/4] Building React frontend...');
execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });

// ── Step 2: If clean build, temporarily patch the source to remove personal data ─
let patchApplied = false;
const srcFile = path.join(ROOT, 'src', 'DimaTradingOS.jsx');
let srcBackup  = null;

if (isClean) {
  console.log('[2/4] Applying clean build patch (removing personal data)...');
  srcBackup = fs.readFileSync(srcFile, 'utf8');

  let patched = srcBackup;
  // Empty the TRADES array
  patched = patched.replace(
    /const TRADES = \[[\s\S]*?\];(\s*\/\/ ── OPEN POSITIONS)/,
    'const TRADES = [];  // Customer build — no demo trades\n$1'
  );
  // Empty DEFAULT_POS
  patched = patched.replace(
    /const DEFAULT_POS = \[[\s\S]*?\];(\s*\/\/ Sum of)/,
    'const DEFAULT_POS = [];  // Customer build — fresh start\n$1'
  );
  // Reset ACCOUNT to 0
  patched = patched.replace(
    /const ACCOUNT = \d+;.*\/\/ IBI/,
    'const ACCOUNT = 0;   // Set your account value in the app'
  );
  // Reset data version to force fresh state
  patched = patched.replace(
    /const DATA_VERSION = "[^"]+";/,
    `const DATA_VERSION = "customer-${new Date().toISOString().slice(0,10)}";`
  );

  fs.writeFileSync(srcFile, patched, 'utf8');
  patchApplied = true;

  // Rebuild with clean data
  console.log('[2/4] Rebuilding with clean data...');
  execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });
}

// ── Step 3: Build installer (disable signing to avoid symlink issue) ──────────
console.log('[3/4] Building Windows installer...');
const env = {
  ...process.env,
  WIN_CSC_LINK: '',                     // no code signing cert
  CSC_IDENTITY_AUTO_DISCOVERY: 'false', // don't auto-detect signing
  ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true',
};

try {
  execSync('npx electron-builder --win --publish never', {
    cwd: ROOT, stdio: 'inherit', env,
  });
} finally {
  // ── Step 4: Restore original source if patched ────────────────────────────
  if (patchApplied && srcBackup) {
    fs.writeFileSync(srcFile, srcBackup, 'utf8');
    console.log('[4/4] Source restored to personal build.');
  }
}

// ── Copy README into release folder alongside the installer ──────────────────
const readmeSrc = path.join(ROOT, 'README.txt');
const readmeDst = path.join(ROOT, 'release', 'README.txt');
if (fs.existsSync(readmeSrc)) {
  fs.copyFileSync(readmeSrc, readmeDst);
  console.log('📄 README.txt copied to release folder');
}

// ── Summary ───────────────────────────────────────────────────────────────────
const relDir = path.join(ROOT, 'release');
if (fs.existsSync(relDir)) {
  const files = fs.readdirSync(relDir).filter(f => f.endsWith('.exe'));
  console.log('\n✅ Build complete!');
  files.forEach(f => {
    const size = (fs.statSync(path.join(relDir, f)).size / 1024 / 1024).toFixed(1);
    console.log(`   📦 ${f} (${size} MB)`);
    console.log(`   📍 ${path.join(relDir, f)}`);
  });
  console.log('\nInstall notes:');
  console.log('  - Run the .exe as Administrator OR enable Windows Developer Mode first');
  console.log('  - Settings → Privacy & Security → For Developers → Developer Mode: ON');
}
