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
      body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
        background:radial-gradient(900px 520px at 50% -8%,#e8f1ff 0%,#f5f8fc 55%,#f3f6fb 100%);
        color:#0f172a;display:flex;align-items:center;justify-content:center;
        user-select:none;-webkit-user-select:none}
      .card{width:430px;max-width:88vw;background:#fff;border:1px solid #eef1f6;border-radius:24px;
        box-shadow:0 24px 70px rgba(15,23,42,.10);padding:46px 40px 34px;text-align:center}
      .icon{width:76px;height:76px;margin:0 auto 24px;border-radius:22px;
        background:linear-gradient(135deg,#0071F9,#4f9bff);display:flex;align-items:center;
        justify-content:center;box-shadow:0 12px 28px rgba(0,113,249,.38),0 0 0 8px rgba(0,113,249,.06);
        animation:float 3s ease-in-out infinite}
      @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
      .icon svg{width:38px;height:38px;fill:#fff}
      h1{font-size:21px;font-weight:700;margin:0 0 8px;letter-spacing:-.02em}
      .sub{font-size:14px;color:#64748b;margin:0;line-height:1.55;min-height:22px}
      .ver{display:none;margin:14px auto 0;padding:5px 14px;border-radius:99px;
        background:#eff6ff;color:#0071F9;font-size:12.5px;font-weight:600;width:fit-content}
      .wrap{margin-top:26px}
      .track{height:10px;border-radius:99px;background:#eef2f7;overflow:hidden;position:relative}
      .fill{height:100%;width:0%;border-radius:99px;
        background:linear-gradient(90deg,#0071F9,#5aa6ff);transition:width .3s ease;
        box-shadow:0 0 12px rgba(0,113,249,.4)}
      .track.indet .fill{width:38%!important;animation:slide 1.15s ease-in-out infinite}
      @keyframes slide{0%{transform:translateX(-130%)}100%{transform:translateX(360%)}}
      .meta{display:flex;justify-content:space-between;align-items:center;margin-top:13px;
        font-variant-numeric:tabular-nums}
      .meta .pct{color:#0f172a;font-weight:700;font-size:15px}
      .meta .info{color:#94a3b8;font-size:12.5px}
      .spin{display:none;width:26px;height:26px;border:3px solid #dbe7fb;border-top-color:#0071F9;
        border-radius:50%;animation:spin .7s linear infinite;margin:6px auto 0}
      @keyframes spin{to{transform:rotate(360deg)}}
      body.installing .wrap{display:none}
      body.installing .spin{display:block}
      .foot{margin-top:30px;font-size:11px;color:#b6c0cf;letter-spacing:.04em;text-transform:uppercase}
    </style></head>
    <body class="checking">
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M13 3h-2v8.59L8.21 8.79 6.79 10.2 12 15.41l5.21-5.21-1.42-1.41L13 11.59V3zM5 18h14v2H5z"/></svg></div>
        <h1 id="title">Checking for updates…</h1>
        <p class="sub" id="sub">Please wait a moment.</p>
        <div class="ver" id="ver"></div>
        <div class="wrap">
          <div class="track indet" id="track"><div class="fill" id="fill"></div></div>
          <div class="meta"><span class="pct" id="pct">&nbsp;</span><span class="info" id="info">&nbsp;</span></div>
        </div>
        <div class="spin"></div>
        <div class="foot">PrepEdu Exam Platform</div>
      </div>
      <script>
        var S={state:'checking',percent:0,version:'',bps:0,tr:0,tot:0};
        function spd(b){if(!b||b<=0)return '';
          if(b>=1048576)return (b/1048576).toFixed(1)+' MB/s';return Math.max(1,Math.round(b/1024))+' KB/s';}
        function mb(b){return (b/1048576).toFixed(1);}
        function render(){
          var t=document.getElementById('title'),s=document.getElementById('sub'),
              v=document.getElementById('ver'),tr=document.getElementById('track'),
              f=document.getElementById('fill'),p=document.getElementById('pct'),
              inf=document.getElementById('info');
          if(!t)return;
          document.body.className=S.state;
          v.style.display=S.version?'block':'none';
          if(S.version)v.textContent='Version '+S.version;
          if(S.state==='checking'){
            t.textContent='Checking for updates…';s.textContent='Please wait a moment.';
            tr.classList.add('indet');p.innerHTML='&nbsp;';inf.innerHTML='&nbsp;';
          }else if(S.state==='downloading'){
            t.textContent='Downloading update';
            s.textContent='Downloading… please keep your network connected.';
            tr.classList.remove('indet');
            var pc=Math.max(0,Math.min(100,S.percent||0));
            f.style.width=pc.toFixed(0)+'%';p.textContent=pc.toFixed(0)+'%';
            var parts=[];var sp=spd(S.bps);if(sp)parts.push(sp);
            if(S.tot>0)parts.push(mb(S.tr)+' / '+mb(S.tot)+' MB');
            inf.textContent=parts.join('  •  ');
          }else if(S.state==='installing'){
            t.textContent='Installing update';
            s.textContent='The app will restart automatically. Please do not turn off your device.';
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
