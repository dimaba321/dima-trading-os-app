'use strict';
const { app, dialog } = require('electron');
const https = require('https');

// Check GitHub releases for newer version
const RELEASES_API = 'https://api.github.com/repos/dimaba321/dima-trading-os-app/releases/latest';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'DimaTradingOS-Updater',
        'Accept': 'application/vnd.github.v3+json',
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function semverGt(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

async function checkForUpdates(silent = false) {
  try {
    const release = await fetchJSON(RELEASES_API);
    if (!release || !release.tag_name) {
      if (!silent) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Up to date',
          message: 'You are running the latest version.',
        });
      }
      return null;
    }

    const latestVer  = release.tag_name.replace(/^v/, '');
    const currentVer = app.getVersion();

    if (semverGt(latestVer, currentVer)) {
      // Find .exe asset
      const asset       = (release.assets || []).find(a => a.name.endsWith('.exe'));
      const downloadUrl = asset?.browser_download_url || release.html_url;
      return {
        version:    latestVer,
        downloadUrl,
        releaseUrl: release.html_url,
        notes:      release.body || '',
      };
    } else {
      if (!silent) {
        dialog.showMessageBox({
          type:    'info',
          title:   'Up to date',
          message: `You are running the latest version (v${currentVer}).`,
        });
      }
      return null;
    }
  } catch (e) {
    if (!silent) {
      dialog.showMessageBox({
        type:    'warning',
        title:   'Update check failed',
        message: 'Could not check for updates. Check your internet connection.',
      });
    }
    return null;
  }
}

module.exports = { checkForUpdates };
