#!/usr/bin/env node
/**
 * build_installer.js — Build the Windows installer
 *
 * Usage:
 *   node scripts/build_installer.js                        → personal build
 *   node scripts/build_installer.js --clean                → customer build (auto-bumps patch)
 *   node scripts/build_installer.js --clean --ver 1.2.0   → customer build with specific version
 */
'use strict';
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const isClean = process.argv.includes('--clean');
const verIdx  = process.argv.indexOf('--ver');
const ROOT    = path.join(__dirname, '..');

// ── Read current version from package.json ────────────────────────────────────
const pkgFile = path.join(ROOT, 'package.json');
const pkg     = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const oldVer  = pkg.version || '1.0.0';

// ── Determine new version ─────────────────────────────────────────────────────
function bumpPatch(v) {
  const parts = v.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join('.');
}

let newVer = oldVer;
if (isClean) {
  // Customer build: use --ver if provided, otherwise auto-bump patch
  newVer = verIdx !== -1 && process.argv[verIdx + 1]
    ? process.argv[verIdx + 1]
    : bumpPatch(oldVer);
}

// ── Header ────────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║        DIMA TRADING OS — Windows Installer Builder       ║');
console.log(`║   Mode:    ${isClean ? 'CUSTOMER BUILD (clean data)     ' : 'PERSONAL BUILD (your data)     '}  ║`);
console.log(`║   Version: ${oldVer.padEnd(10)} → ${isClean ? newVer.padEnd(10) : oldVer.padEnd(10)}                   ║`);
console.log('╚══════════════════════════════════════════════════════════╝\n');

// ── Bump version in package.json for customer build ───────────────────────────
if (isClean && newVer !== oldVer) {
  pkg.version = newVer;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`[0] Version bumped: ${oldVer} → ${newVer}`);
}

// ── Step 0a: Generate installer wizard BMP assets ─────────────────────────────
console.log('[0/5] Generating installer wizard graphics...');
execSync('node scripts/generate-installer-assets.js', { cwd: ROOT, stdio: 'inherit' });

// ── Step 0b: Install backend production dependencies ──────────────────────────
// Ensures backend/node_modules has only production packages before bundling.
const backendDir = path.join(ROOT, '..', 'backend');
if (fs.existsSync(backendDir)) {
  console.log('[0/5] Installing backend production dependencies...');
  execSync('npm install --production --prefer-offline', {
    cwd: backendDir, stdio: 'inherit',
  });
}

// ── Step 1: Build Vite app ────────────────────────────────────────────────────
console.log('[1/5] Building React frontend...');
execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });

// ── Step 2: If clean build, patch source to remove personal data ──────────────
let patchApplied = false;
const srcFile = path.join(ROOT, 'src', 'DimaTradingOS.jsx');
let srcBackup  = null;

if (isClean) {
  console.log('[2/5] Applying clean patch (removing personal data)...');
  srcBackup = fs.readFileSync(srcFile, 'utf8');
  let patched = srcBackup;

  patched = patched.replace(
    /const TRADES = \[[\s\S]*?\];(\s*\/\/ ── OPEN POSITIONS)/,
    'const TRADES = [];  // Customer build — no demo trades\n$1'
  );
  patched = patched.replace(
    /const DEFAULT_POS = \[[\s\S]*?\];(\s*\/\/ Sum of)/,
    'const DEFAULT_POS = [];  // Customer build — fresh start\n$1'
  );
  patched = patched.replace(
    /const ACCOUNT = \d+;.*\/\/ IBI/,
    'const ACCOUNT = 0;   // Set your account value in the app'
  );
  patched = patched.replace(
    /const DATA_VERSION = "[^"]+";/,
    `const DATA_VERSION = "customer-${new Date().toISOString().slice(0,10)}";`
  );

  fs.writeFileSync(srcFile, patched, 'utf8');
  patchApplied = true;

  console.log('[2/5] Rebuilding with clean data...');
  execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });
}

// ── Step 3: Build installer ───────────────────────────────────────────────────
console.log('[3/5] Building Windows installer...');
const env = {
  ...process.env,
  WIN_CSC_LINK: '',
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true',
};

try {
  execSync('npx electron-builder --win --publish never', {
    cwd: ROOT, stdio: 'inherit', env,
  });
} finally {
  // ── Step 4: Restore original source ──────────────────────────────────────
  if (patchApplied && srcBackup) {
    fs.writeFileSync(srcFile, srcBackup, 'utf8');
    // Restore original version in package.json for personal use
    pkg.version = isClean ? newVer : oldVer; // keep new version after customer build
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log('[4/5] Source restored.');
  }
}

// ── Copy README into release folder ──────────────────────────────────────────
const readmeSrc = path.join(ROOT, 'README.txt');
const readmeDst = path.join(ROOT, 'release', 'README.txt');
if (fs.existsSync(readmeSrc)) {
  fs.copyFileSync(readmeSrc, readmeDst);
}

// ── For customer builds: create CUSTOMER_BUILD\ folder ───────────────────────
if (isClean) {
  const customerDir = path.join(ROOT, 'CUSTOMER_BUILD');
  const versionDir  = path.join(customerDir, `v${newVer}`);
  fs.mkdirSync(versionDir, { recursive: true });

  // Copy installer
  const relDir  = path.join(ROOT, 'release');
  const exeFile = fs.readdirSync(relDir).find(f => f.endsWith('.exe'));
  if (exeFile) {
    fs.copyFileSync(path.join(relDir, exeFile), path.join(versionDir, exeFile));
    console.log(`\n📦 Installer → CUSTOMER_BUILD\\v${newVer}\\${exeFile}`);
  }

  // Copy README
  if (fs.existsSync(readmeSrc)) {
    fs.copyFileSync(readmeSrc, path.join(versionDir, 'README.txt'));
    console.log(`📄 README    → CUSTOMER_BUILD\\v${newVer}\\README.txt`);
  }

  // Write/update CHANGELOG
  const changelogPath = path.join(customerDir, 'CHANGELOG.txt');
  const entry = `v${newVer} — ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}\n  Built: ${new Date().toISOString()}\n\n`;
  const existing = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
  fs.writeFileSync(changelogPath, entry + existing, 'utf8');
  console.log(`📋 Changelog → CUSTOMER_BUILD\\CHANGELOG.txt`);

  console.log(`\n✅ Customer build v${newVer} ready in: CUSTOMER_BUILD\\v${newVer}\\`);
  console.log('   Share the entire v' + newVer + ' folder with your customer.');

} else {
  // Personal build summary
  const relDir = path.join(ROOT, 'release');
  if (fs.existsSync(relDir)) {
    const files = fs.readdirSync(relDir).filter(f => f.endsWith('.exe'));
    console.log('\n✅ Personal build complete!');
    files.forEach(f => {
      const size = (fs.statSync(path.join(relDir, f)).size / 1024 / 1024).toFixed(1);
      console.log(`   📦 ${f} (${size} MB) → release\\`);
    });
  }
}

console.log('\nInstall note: Enable Windows Developer Mode before running .exe');
console.log('  Settings → Privacy & Security → For Developers → Developer Mode: ON\n');
