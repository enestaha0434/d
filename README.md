# Illumina Browser

Modern, secure, and customizable web browser built on Electron.

## Features
- Picture-in-Picture & Split View
- Tab Grouping & Sleeping
- Embedded AdBlocker (Easylist/Easyprivacy optimized via chunks)
- AES-256 Storage Encryption
- Full Incognito Mode & Proxy Support
- Focus Mode & Reader Mode
- Deep customization (Fonts, Layout, Themes)

## Security
- Strict CSP `script-src 'self'` implemented.
- Sandbox enabled for `webview` (`webPrefs.sandbox=true`).
- `unsafe-eval` completely removed from browser shell architecture.
- Full protocol and parameter validation for `webview-preload` execution.

## Developer Guide
To build and run:
```bash
npm install
npm run start
```

## Extensions
Supports Unpacked Chrome extensions (Manifest V2). Note that isolated world implementation ensures security without relying on unsafe bindings.
