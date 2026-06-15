// Compiles the bundled main process into V8 bytecode (.jsc) so the packaged
// app does not ship readable JavaScript for the anti-cheat logic.
//
// IMPORTANT: must run under Electron (so the bytecode matches Electron's V8),
// NOT plain Node — see the "bytecode" npm script. Re-run after every Electron
// upgrade, because .jsc is tied to the exact V8 version.
//
// For each target it:
//   1. compiles  index.js  ->  index.jsc
//   2. overwrites index.js with a tiny loader that requires the .jsc
// The package `main` entry keeps pointing at index.js (the loader).

const electron = require('electron')
// Under ELECTRON_RUN_AS_NODE=1 (used on headless CI), require('electron') is just
// the binary path string and there is no `app` — run directly as Node instead.
// It still runs Electron's V8, so the produced .jsc stays compatible.
const app = typeof electron === 'object' && electron ? electron.app : undefined
const bytenode = require('bytenode')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

// Only the main process for now. To also protect the preload, add:
//   path.join(ROOT, 'dist-electron', 'preload', 'index.js')
// (preload is built as CJS and sandbox is disabled, so it can require bytenode,
//  but test it before relying on it.)
const TARGETS = [path.join(ROOT, 'dist-electron', 'main', 'index.js')]

async function run() {
  for (const file of TARGETS) {
    if (!fs.existsSync(file)) {
      console.error('[bytecode] skip (missing):', path.relative(ROOT, file))
      continue
    }

    const jsc = file.replace(/\.js$/, '.jsc')
    await bytenode.compileFile({ filename: file, output: jsc, compileAsModule: true })

    const loaderTarget = './' + path.basename(jsc)
    fs.writeFileSync(
      file,
      `'use strict';\nrequire('bytenode');\nmodule.exports = require(${JSON.stringify(loaderTarget)});\n`
    )

    console.log('[bytecode] compiled ->', path.relative(ROOT, jsc))
  }
}

if (app) {
  app.whenReady().then(async () => {
    try {
      await run()
      app.exit(0)
    } catch (err) {
      console.error('[bytecode] failed:', err)
      app.exit(1)
    }
  })
} else {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[bytecode] failed:', err)
      process.exit(1)
    })
}
