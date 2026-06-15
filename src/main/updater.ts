import { app, BrowserWindow } from 'electron'
// electron-updater is CommonJS with named exports and NO default export (it sets
// __esModule=true). A default import resolves to `undefined` at runtime, so the
// main bundle must use a named import — esbuild turns this into a direct property
// access on require('electron-updater').
import { autoUpdater } from 'electron-updater'

import { applyUpdateChannel } from './updater-channel'
import { APP_ICON } from './app-icon'

// Force-update gate shown BEFORE the exam loads.
//
// Flow: show a branded "checking / downloading / installing" screen in the main
// window, ask the update server (GCS, via the generated app-update.yml) whether a
// newer build exists, and:
//   - update found     -> download, show progress, then quitAndInstall (relaunch).
//                         The student can never enter a stale build.
//   - no update        -> navigate to the exam.
//   - error / timeout  -> navigate to the exam anyway. A flaky/down update server
//                         must NEVER lock a student out of their exam.
//
// The UI is a self-contained data: URL (same pattern as crash-recovery.ts) loaded
// into the main window — no extra window/preload, so the kiosk/lockdown logic in
// index.ts is left untouched. Progress is pushed in via executeJavaScript().

// Never keep a student waiting on the update server longer than this before
// falling through to the exam.
const GATE_TIMEOUT_MS = 25_000

const UPDATER_HTML =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}
      html,body{height:100%;margin:0}
      body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
        background:radial-gradient(800px 480px at 50% -6%,#eaf2ff 0%,#f6f9fc 60%,#f4f7fb 100%);
        color:#0f172a;display:flex;align-items:center;justify-content:center;
        user-select:none;-webkit-user-select:none}
      .card{width:600px;max-width:92vw;background:#fff;border:1px solid #eef1f6;border-radius:30px;
        box-shadow:0 34px 90px rgba(15,23,42,.13);padding:58px 64px 42px;text-align:center}
      .icon{width:88px;height:88px;display:block;margin:0 auto 22px;border-radius:22px;
        box-shadow:0 16px 34px rgba(0,113,249,.22);animation:pulse 2.6s ease-in-out infinite}
      @keyframes pulse{0%,100%{box-shadow:0 16px 34px rgba(0,113,249,.22),0 0 0 0 rgba(0,113,249,.14)}
        50%{box-shadow:0 16px 34px rgba(0,113,249,.22),0 0 0 16px rgba(0,113,249,0)}}
      h1{font-size:18px;font-weight:650;margin:0;letter-spacing:-.01em}
      .ver{font-size:13.5px;color:#64748b;margin:7px 0 0;min-height:18px}
      .dl{margin-top:26px}
      .track{height:8px;border-radius:99px;background:#eef2f7;overflow:hidden;position:relative}
      .fill{height:100%;width:0%;border-radius:99px;position:relative;
        background:linear-gradient(90deg,#0071F9,#5aa6ff);transition:width .3s cubic-bezier(.4,0,.2,1)}
      .fill::after{content:'';position:absolute;inset:0;
        background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);
        animation:shine 1.5s linear infinite}
      @keyframes shine{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
      .track.indet .fill{width:40%!important;animation:indet 1.2s ease-in-out infinite}
      @keyframes indet{0%{margin-left:-42%}100%{margin-left:102%}}
      .meta{display:flex;justify-content:space-between;align-items:center;margin-top:12px;min-height:18px}
      .pct{font-size:14px;font-weight:600;color:#0f172a;font-variant-numeric:tabular-nums}
      .info{font-size:12.5px;color:#94a3b8;font-variant-numeric:tabular-nums}
      .spin{display:none;width:30px;height:30px;border:3px solid #e2e8f0;border-top-color:#0071F9;
        border-radius:50%;animation:spin .7s linear infinite;margin:10px auto 0}
      @keyframes spin{to{transform:rotate(360deg)}}
      .note{display:none;font-size:13px;color:#64748b;margin:16px 0 0;line-height:1.5}
      body.installing .dl{display:none}
      body.installing .spin,body.installing .note{display:block}
      body.checking .pct{display:none}
      .foot{margin-top:30px;font-size:10.5px;color:#c2cbd8;letter-spacing:.08em;text-transform:uppercase}
    </style></head>
    <body class="checking">
      <div class="card">
        <img class="icon" src="${APP_ICON}" alt="" />
        <h1 id="title">Checking for updates…</h1>
        <p class="ver" id="ver"></p>
        <div class="dl">
          <div class="track indet" id="track"><div class="fill" id="fill"></div></div>
          <div class="meta"><span class="pct" id="pct">0%</span><span class="info" id="info"></span></div>
        </div>
        <div class="spin"></div>
        <p class="note">The app will restart automatically. Please do not turn off your device.</p>
        <div class="foot">PrepEdu Exam Platform</div>
      </div>
      <script>
        var S={state:'checking',percent:0,version:'',bps:0,tr:0,tot:0};
        function spd(b){if(!b||b<=0)return '';
          if(b>=1048576)return (b/1048576).toFixed(1)+' MB/s';return Math.max(1,Math.round(b/1024))+' KB/s';}
        function mb(b){return (b/1048576).toFixed(1);}
        function render(){
          var t=document.getElementById('title'),v=document.getElementById('ver'),
              tr=document.getElementById('track'),f=document.getElementById('fill'),
              p=document.getElementById('pct'),inf=document.getElementById('info');
          if(!t)return;
          document.body.className=S.state;
          v.textContent=S.version?'Version '+S.version:'';
          if(S.state==='checking'){
            t.textContent='Checking for updates…';
            tr.classList.add('indet');inf.textContent='';
          }else if(S.state==='downloading'){
            t.textContent='Downloading update';
            tr.classList.remove('indet');
            var pc=Math.max(0,Math.min(100,S.percent||0));
            f.style.width=pc.toFixed(0)+'%';p.textContent=pc.toFixed(0)+'%';
            var parts=[];var sp=spd(S.bps);if(sp)parts.push(sp);
            if(S.tot>0)parts.push(mb(S.tr)+' / '+mb(S.tot)+' MB');
            inf.textContent=parts.join('   •   ');
          }else if(S.state==='installing'){
            t.textContent='Installing update';
          }
        }
        window.upd={
          status:function(st,v){S.state=st;if(v)S.version=v;render();},
          progress:function(pc,b,tr,tot){S.state='downloading';S.percent=pc||0;S.bps=b||0;
            S.tr=tr||0;S.tot=tot||0;render();}
        };
        document.addEventListener('DOMContentLoaded',render);render();
      </script>
    </body></html>`
  )

// Dev-only: preview the updater progress screen WITHOUT a real update.
// Run with PREVIEW_UPDATER=1 (e.g. `PREVIEW_UPDATER=1 pnpm dev` or `pnpm dev:updater`).
// Loops checking -> downloading 0..100% -> installing so the UI can be inspected.
const previewUpdaterUI = (win: BrowserWindow): void => {
  const ui = (expr: string): void => {
    if (!win.isDestroyed()) win.webContents.executeJavaScript(expr).catch(() => {})
  }
  win.loadURL(UPDATER_HTML)
  win.webContents.once('did-finish-load', () => {
    const total = 58 * 1024 * 1024
    const runOnce = (): void => {
      ui(`window.upd&&window.upd.status('checking')`)
      setTimeout(() => ui(`window.upd&&window.upd.status('downloading','1.0.9')`), 900)
      let pct = 0
      const iv = setInterval(() => {
        pct = Math.min(100, pct + 3)
        const transferred = Math.round((total * pct) / 100)
        ui(`window.upd&&window.upd.progress(${pct},${Math.round(3.2 * 1024 * 1024)},${transferred},${total})`)
        if (pct >= 100) {
          clearInterval(iv)
          setTimeout(() => ui(`window.upd&&window.upd.status('installing')`), 600)
          setTimeout(runOnce, 3500)
        }
      }, 200)
    }
    setTimeout(runOnce, 500)
  })
}

export const runUpdateGate = (win: BrowserWindow, onProceed: () => void): void => {
  // Dev preview of the updater UI (no real update). See previewUpdaterUI above.
  if (process.env.PREVIEW_UPDATER === '1') {
    previewUpdaterUI(win)
    return
  }
  // electron-updater only works in a packaged app. In dev, go straight in —
  // unless TEST_UPDATER=1, which forces the gate to run against a local
  // dev-app-update.yml so the flow/UI can be exercised without packaging.
  const isTest = process.env.TEST_UPDATER === '1'
  if (!app.isPackaged && !isTest) {
    onProceed()
    return
  }
  if (isTest) autoUpdater.forceDevUpdateConfig = true

  let settled = false
  const proceed = (): void => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    onProceed()
  }

  // Backstop: a slow or unreachable update server must not strand the student.
  const timer = setTimeout(() => {
    console.warn('[Updater] gate timed out — entering exam')
    proceed()
  }, GATE_TIMEOUT_MS)

  const ui = (expr: string): void => {
    if (!win.isDestroyed()) win.webContents.executeJavaScript(expr).catch(() => {})
  }

  autoUpdater.autoDownload = true
  // We install in-gate (quitAndInstall) — don't also defer to app quit.
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = console
  applyUpdateChannel()

  autoUpdater.removeAllListeners()

  // Silent check: while checking we show NOTHING (window stays hidden). The
  // updater screen is loaded ONLY when an update actually exists — so a normal
  // launch with no update never flashes the update screen.
  autoUpdater.on('update-available', (info) => {
    // An update exists -> now show the updater screen and let it download.
    // Cancel the "server too slow" backstop: it only guards the checking phase.
    clearTimeout(timer)
    const version = String(info?.version || '')
    win.loadURL(UPDATER_HTML)
    win.webContents.once('did-finish-load', () => {
      ui(`window.upd&&window.upd.status('downloading',${JSON.stringify(version)})`)
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.warn('[Updater] no update — entering exam')
    proceed()
  })

  autoUpdater.on('download-progress', (p) => {
    const pct = Number(p?.percent) || 0
    const bps = Number(p?.bytesPerSecond) || 0
    const transferred = Number(p?.transferred) || 0
    const total = Number(p?.total) || 0
    ui(`window.upd&&window.upd.progress(${pct},${bps},${transferred},${total})`)
  })

  autoUpdater.on('update-downloaded', () => {
    clearTimeout(timer)
    // Safety net: if the gate already fell through to the exam (e.g. an error
    // raced the download, or some edge let the timer fire first), the student is
    // now IN the app — never relaunch under them. Defer the install to the next
    // natural app quit instead.
    if (settled) {
      console.warn('[Updater] downloaded after gate settled — deferring install to app quit')
      autoUpdater.autoInstallOnAppQuit = true
      return
    }
    ui(`window.upd&&window.upd.status('installing')`)
    // Brief pause so the student sees the "installing" state before the relaunch.
    setTimeout(() => {
      try {
        // isSilent=true, isForceRunAfter=true → reinstall and reopen automatically.
        autoUpdater.quitAndInstall(true, true)
      } catch (err) {
        console.error('[Updater] quitAndInstall failed — entering exam:', err)
        proceed()
      }
    }, 1500)
  })

  autoUpdater.on('error', (err) => {
    console.error('[Updater] error — entering exam:', err?.message || err)
    proceed()
  })

  // Check silently in the background — no UI yet. The window stays hidden until
  // either an update is found (updater screen loads) or we proceed to the exam.
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[Updater] checkForUpdates failed — entering exam:', err)
    proceed()
  })
}
