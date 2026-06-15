import { app, BrowserWindow } from 'electron'
// electron-updater is CommonJS with named exports and NO default export (it sets
// __esModule=true). A default import resolves to `undefined` at runtime, so the
// main bundle must use a named import — esbuild turns this into a direct property
// access on require('electron-updater').
import { autoUpdater } from 'electron-updater'

import { applyUpdateChannel } from './updater-channel'

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
      body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
        background:radial-gradient(1200px 600px at 50% -10%,#eaf2ff 0%,#f7f9fc 45%,#f7f9fc 100%);
        color:#0f172a;display:flex;align-items:center;justify-content:center;
        user-select:none;-webkit-user-select:none}
      .card{width:440px;max-width:88vw;background:#fff;border:1px solid #eef1f6;border-radius:20px;
        box-shadow:0 20px 60px rgba(15,23,42,.08);padding:40px 36px;text-align:center}
      .logo{width:64px;height:64px;margin:0 auto 22px;border-radius:18px;
        background:linear-gradient(135deg,#0071F9,#3f96ff);display:flex;align-items:center;
        justify-content:center;box-shadow:0 10px 24px rgba(0,113,249,.35)}
      .logo svg{width:34px;height:34px;fill:#fff}
      h1{font-size:19px;font-weight:650;margin:0 0 8px;letter-spacing:-.01em}
      .sub{font-size:13.5px;color:#64748b;margin:0 0 26px;line-height:1.5;min-height:20px}
      .sub b{color:#0071F9;font-weight:600}
      .track{height:8px;border-radius:99px;background:#eef2f7;overflow:hidden;position:relative}
      .fill{height:100%;width:0%;border-radius:99px;
        background:linear-gradient(90deg,#0071F9,#5aa6ff);transition:width .25s ease}
      .track.indet .fill{width:35%!important;animation:slide 1.1s ease-in-out infinite}
      @keyframes slide{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}
      .meta{display:flex;justify-content:space-between;margin-top:12px;font-size:12px;
        color:#94a3b8;font-variant-numeric:tabular-nums}
      .meta .pct{color:#0f172a;font-weight:600}
      .spin{display:none;width:20px;height:20px;border:2.5px solid #dbe7fb;border-top-color:#0071F9;
        border-radius:50%;animation:spin .7s linear infinite;margin:2px auto 0}
      @keyframes spin{to{transform:rotate(360deg)}}
      body.installing .track,body.installing .meta{display:none}
      body.installing .spin{display:block}
      .foot{margin-top:28px;font-size:11px;color:#b6c0cf;letter-spacing:.02em}
    </style></head>
    <body class="checking">
      <div class="card">
        <div class="logo"><svg viewBox="0 0 24 24"><path d="M12 3 1 8l11 5 9-4.09V14h2V8L12 3zM5 13.18v3.99L12 21l7-3.83v-3.99L12 17 5 13.18z"/></svg></div>
        <h1 id="title">Checking for updates…</h1>
        <p class="sub" id="sub">Please wait a moment.</p>
        <div class="track indet" id="track"><div class="fill" id="fill"></div></div>
        <div class="meta"><span class="pct" id="pct">&nbsp;</span><span id="speed">&nbsp;</span></div>
        <div class="spin"></div>
        <div class="foot">PrepEdu Exam Platform</div>
      </div>
      <script>
        var S={state:'checking',percent:0,version:'',bps:0};
        function fmt(b){if(!b||b<=0)return '';
          if(b>1048576)return (b/1048576).toFixed(1)+' MB/s';return Math.round(b/1024)+' KB/s';}
        function render(){
          var t=document.getElementById('title'),s=document.getElementById('sub'),
              tr=document.getElementById('track'),f=document.getElementById('fill'),
              p=document.getElementById('pct'),sp=document.getElementById('speed');
          if(!t)return;
          document.body.className=S.state;
          if(S.state==='checking'){
            t.textContent='Checking for updates…';s.textContent='Please wait a moment.';
            tr.classList.add('indet');p.innerHTML='&nbsp;';sp.innerHTML='&nbsp;';
          }else if(S.state==='downloading'){
            t.textContent='Downloading update';
            s.innerHTML=S.version?('Version <b>'+S.version+'</b> • downloading…'):'Downloading…';
            tr.classList.remove('indet');f.style.width=(S.percent||0).toFixed(0)+'%';
            p.textContent=(S.percent||0).toFixed(0)+'%';sp.textContent=fmt(S.bps);
          }else if(S.state==='installing'){
            t.textContent='Installing update';
            s.textContent='The app will restart automatically. Please do not turn off your device.';
          }
        }
        window.upd={
          status:function(st,v){S.state=st;if(v)S.version=v;render();},
          progress:function(pc,b){S.state='downloading';S.percent=pc||0;S.bps=b||0;render();}
        };
        document.addEventListener('DOMContentLoaded',render);render();
      </script>
    </body></html>`
  )

export const runUpdateGate = (win: BrowserWindow, onProceed: () => void): void => {
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

  autoUpdater.on('checking-for-update', () => ui(`window.upd&&window.upd.status('checking')`))

  autoUpdater.on('update-available', (info) => {
    // An update is now downloading. Cancel the "server too slow" backstop: it
    // only guards the *checking* phase. If it fired mid-download we'd drop the
    // student into the exam and then relaunch under them when the download
    // finishes. Once a download is confirmed in progress we commit to finishing
    // and installing it here on the gate screen, never inside the exam.
    clearTimeout(timer)
    const v = JSON.stringify(String(info?.version || ''))
    ui(`window.upd&&window.upd.status('downloading',${v})`)
  })

  autoUpdater.on('update-not-available', () => {
    console.warn('[Updater] no update — entering exam')
    proceed()
  })

  autoUpdater.on('download-progress', (p) => {
    const pct = Number(p?.percent) || 0
    const bps = Number(p?.bytesPerSecond) || 0
    ui(`window.upd&&window.upd.progress(${pct},${bps})`)
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

  win.loadURL(UPDATER_HTML)
  // Start the check only once the updater screen is on-screen, so the very first
  // events (checking/available) have a live DOM to render into.
  win.webContents.once('did-finish-load', () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[Updater] checkForUpdates failed — entering exam:', err)
      proceed()
    })
  })
}
