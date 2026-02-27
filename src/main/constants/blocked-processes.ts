import type { BlockedProcess } from '../types'

export const BLOCKED_PROCESSES: BlockedProcess[] = [
  // Screen recording
  { name: 'OBS Studio', patterns: ['obs64', 'obs32', 'obs-browser-page'] },
  { name: 'Bandicam', patterns: ['bdcam', 'bandicam'] },
  { name: 'Camtasia', patterns: ['CamtasiaStudio', 'CamRecorder'] },
  { name: 'ScreenRec', patterns: ['ScreenRec'] },
  { name: 'ShareX', patterns: ['ShareX'] },
  { name: 'Loom', patterns: ['Loom.app', 'Loom Helper'] },
  { name: 'Screencast-O-Matic', patterns: ['screencast-o-matic'] },
  { name: 'ApowerREC', patterns: ['ApowerREC'] },
  { name: 'Lightshot', patterns: ['Lightshot', 'lightshot'] },
  { name: 'Monosnap', patterns: ['Monosnap'] },
  { name: 'Snagit', patterns: ['Snagit', 'Snagit32', 'SnagitEditor'] },
  { name: 'Greenshot', patterns: ['Greenshot'] },
  { name: 'FlameShot', patterns: ['flameshot'] },
  { name: 'PicPick', patterns: ['picpick'] },
  { name: 'Gyazo', patterns: ['Gyazo', 'GyazoCapture'] },
  { name: 'FastStone Capture', patterns: ['FSCapture'] },
  { name: 'HyperCam', patterns: ['HyperCam'] },
  { name: 'Fraps', patterns: ['fraps'] },
  { name: 'Debut Video Capture', patterns: ['debut'] },
  { name: 'Icecream Screen Recorder', patterns: ['IceCreamScreenRecorder'] },
  { name: 'Movavi Screen Recorder', patterns: ['MovaviScreenRecorder'] },
  { name: 'QuickTime Player', patterns: ['QuickTime Player', 'QuickTimePlayerX'] },
  { name: 'Xbox Game Bar', patterns: ['GameBar', 'GameBarPresenceWriter'] },
  {
    name: 'GeForce ShadowPlay',
    patterns: ['NVIDIA Share', 'nvsphelper64']
  },
  { name: 'AMD ReLive', patterns: ['AMDRSServ', 'RadeonSoftware'] },

  // Remote desktop
  { name: 'TeamViewer', patterns: ['TeamViewer'] },
  { name: 'AnyDesk', patterns: ['AnyDesk'] },
  { name: 'UltraViewer', patterns: ['UltraViewer'] },
  {
    name: 'Chrome Remote Desktop',
    patterns: ['remoting_host', 'chrome_remote_desktop', 'chromoting']
  },
  { name: 'RustDesk', patterns: ['rustdesk'] },
  { name: 'Splashtop', patterns: ['SplashtopStreamer', 'SRServer'] },
  { name: 'LogMeIn', patterns: ['LogMeIn', 'LMIGuardian'] },
  { name: 'NoMachine', patterns: ['nxplayer', 'nxd', 'NoMachine'] },
  { name: 'Supremo', patterns: ['Supremo'] },
  {
    name: 'VNC',
    patterns: ['vncviewer', 'vncserver', 'tvnviewer', 'tvnserver', 'winvnc']
  },
  {
    name: 'ConnectWise ScreenConnect',
    patterns: ['ScreenConnect.Client', 'ScreenConnect Client']
  },
  { name: 'RemotePC', patterns: ['RemotePC'] },
  {
    name: 'Microsoft Remote Desktop',
    patterns: ['mstsc', 'Microsoft Remote Desktop']
  },

  // Chat / Messaging
  { name: 'Zalo', patterns: ['Zalo', 'ZaloPC'] },
  { name: 'Discord', patterns: ['Discord.app', 'Discord Helper'] },
  { name: 'Facebook Messenger', patterns: ['Messenger.app', 'FacebookMessenger'] },
  { name: 'Telegram', patterns: ['Telegram.app', 'Telegram Desktop'] },
  { name: 'Slack', patterns: ['Slack.app', 'Slack Helper'] },
  { name: 'WhatsApp', patterns: ['WhatsApp', 'WhatsApp.exe'] },
  { name: 'Signal', patterns: ['Signal', 'Signal.app'] },
  { name: 'Viber', patterns: ['Viber', 'Viber.app'] },
  { name: 'Line', patterns: ['Line', 'Line.app'] },
  { name: 'WeChat', patterns: ['WeChat', 'WeChatApp'] },
  { name: 'Skype', patterns: ['Skype', 'SkypeApp'] },
  { name: 'Microsoft Teams', patterns: ['Teams', 'ms-teams', 'msteams'] },
  { name: 'KakaoTalk', patterns: ['KakaoTalk'] },
  { name: 'Element', patterns: ['Element', 'Element.app'] },
  { name: 'Franz', patterns: ['Franz'] },
  { name: 'Rambox', patterns: ['Rambox'] },
  { name: 'Ferdium', patterns: ['Ferdium'] },
  { name: 'Beeper', patterns: ['Beeper'] },

  // Translation software
  { name: 'Google Translate (QTranslate)', patterns: ['QTranslate'] },
  { name: 'DeepL', patterns: ['DeepL'] },
  { name: 'GoldenDict', patterns: ['GoldenDict'] },
  { name: 'Lingoes', patterns: ['Lingoes'] },
  { name: 'Babylon Translator', patterns: ['Babylon.exe'] },
  { name: 'Mate Translate', patterns: ['MateTranslate', 'mate-translate'] },
  { name: 'Lạc Việt Dictionary', patterns: ['LacViet', 'LacVietMTD', 'MTD2024'] },
  { name: 'VDICT', patterns: ['VDICT'] },
  { name: 'TFlat Dictionary', patterns: ['TFlat'] },
  { name: 'Reverso', patterns: ['Reverso'] },
  { name: 'Naver Papago', patterns: ['Papago'] },
  { name: 'Yandex Translate', patterns: ['YandexTranslate'] },
  { name: 'iTranslate', patterns: ['iTranslate'] },
  { name: 'Crow Translate', patterns: ['crow'] },
  { name: 'Translatium', patterns: ['Translatium'] },

  // AI Assistant apps
  { name: 'ChatGPT', patterns: ['ChatGPT', 'com.openai.chat'] },
  { name: 'Claude', patterns: ['Claude.app', 'com.anthropic.claude'] },
  { name: 'Microsoft Copilot', patterns: ['Microsoft.Copilot', 'Copilot.app'] },
  { name: 'Gemini', patterns: ['Google Gemini', 'Gemini.app'] },
  { name: 'Jan AI', patterns: ['Jan.app', 'jan.exe'] },
  { name: 'LM Studio', patterns: ['LM Studio', 'lm-studio', 'LM-Studio'] },
  { name: 'Ollama', patterns: ['ollama serve', 'Ollama.app'] },
  { name: 'GPT4All', patterns: ['GPT4All', 'chat-gpt4all'] },
  { name: 'Cursor', patterns: ['Cursor.app', 'Cursor Helper'] },
  { name: 'Windsurf', patterns: ['Windsurf.app', 'Windsurf Helper'] },
  { name: 'Codeium', patterns: ['Codeium'] },
  { name: 'Perplexity', patterns: ['Perplexity.app', 'Perplexity.exe'] },
  { name: 'Poe', patterns: ['Poe', 'Poe.app'] },
  { name: 'DeepSeek', patterns: ['DeepSeek', 'DeepSeek.app'] },
  { name: 'Phind', patterns: ['Phind'] },
  { name: 'Msty', patterns: ['Msty'] },
  { name: 'AnythingLLM', patterns: ['anythingllm', 'AnythingLLM'] },
  { name: 'Tabnine', patterns: ['tabnine', 'Tabnine'] },
  { name: 'Aider', patterns: ['aider'] },
  { name: 'Kimi AI', patterns: ['Kimi'] },
  { name: 'Doubao', patterns: ['Doubao'] },

  // Video conferencing / Screen sharing
  { name: 'Zoom', patterns: ['Zoom', 'zoom.us'] },
  { name: 'Cisco Webex', patterns: ['WebexHost', 'CiscoWebExStart', 'webex'] },
  { name: 'GoTo Meeting', patterns: ['GoTo', 'g2mstart'] },
  { name: 'BlueJeans', patterns: ['BlueJeans'] },
  { name: 'Jitsi Meet', patterns: ['Jitsi Meet'] },
  { name: 'Lark', patterns: ['Lark', 'Lark.app'] },
  { name: 'DingTalk', patterns: ['DingTalk'] },

  // Virtual machines
  {
    name: 'VMware',
    patterns: ['vmware', 'vmplayer', 'vmnat', 'vmnetdhcp', 'vmware-vmx']
  },
  {
    name: 'VirtualBox',
    patterns: ['VirtualBox', 'VBoxSVC', 'VBoxHeadless']
  },
  { name: 'Parallels Desktop', patterns: ['Parallels Desktop', 'prl_vm_app'] },
  { name: 'UTM', patterns: ['UTM.app', 'qemu-system'] },
  { name: 'Hyper-V', patterns: ['vmwp', 'vmms'] },
  { name: 'Windows Sandbox', patterns: ['WindowsSandbox'] },

  // Android / iOS emulators
  { name: 'BlueStacks', patterns: ['HD-Player', 'BlueStacks'] },
  { name: 'NoxPlayer', patterns: ['Nox', 'NoxVMHandle'] },
  { name: 'LDPlayer', patterns: ['LDPlayer'] },
  { name: 'MuMu Player', patterns: ['MuMuPlayer'] },
  { name: 'Genymotion', patterns: ['Genymotion', 'player'] },

  // Phone mirroring / casting
  { name: 'ApowerMirror', patterns: ['ApowerMirror'] },
  { name: 'scrcpy', patterns: ['scrcpy'] },
  { name: 'Vysor', patterns: ['Vysor'] },
  { name: 'Reflector', patterns: ['Reflector', 'Reflector4'] },
  { name: 'LonelyScreen', patterns: ['LonelyScreen'] },
  { name: 'AirServer', patterns: ['AirServer'] },
  {
    name: 'Phone Link',
    patterns: ['PhoneExperienceHost', 'YourPhone']
  },

  // OCR / Text recognition
  { name: 'ABBYY FineReader', patterns: ['FineReader', 'FineReaderOCR'] },
  { name: 'TextSniper', patterns: ['TextSniper'] },
  { name: 'Capture2Text', patterns: ['Capture2Text'] },

  // Voice transcription
  { name: 'Otter.ai', patterns: ['Otter'] },
  { name: 'MacWhisper', patterns: ['MacWhisper'] },
  { name: 'Superwhisper', patterns: ['Superwhisper', 'superwhisper'] },
  {
    name: 'Dragon NaturallySpeaking',
    patterns: ['natspeak', 'dragon']
  },

  // Note-taking apps
  { name: 'Notion', patterns: ['Notion', 'Notion.app'] },
  { name: 'Obsidian', patterns: ['Obsidian', 'Obsidian.app'] },
  { name: 'Evernote', patterns: ['Evernote', 'Evernote.app'] },
  { name: 'OneNote', patterns: ['ONENOTE', 'Microsoft OneNote'] },
  { name: 'Logseq', patterns: ['Logseq'] },

  // VPN apps
  { name: 'NordVPN', patterns: ['NordVPN', 'nordvpn-service'] },
  { name: 'ExpressVPN', patterns: ['expressvpn', 'ExpressVPNService'] },
  { name: 'ProtonVPN', patterns: ['ProtonVPN'] },
  { name: 'Surfshark', patterns: ['Surfshark'] },
  { name: 'Windscribe', patterns: ['Windscribe'] },
  { name: 'CyberGhost', patterns: ['CyberGhost'] },
  { name: 'Hotspot Shield', patterns: ['hotspotshield'] },
  { name: 'Psiphon', patterns: ['psiphon3', 'PsiphonMac'] },
  { name: 'OpenVPN', patterns: ['openvpn-gui', 'openvpn', 'Tunnelblick'] },
  { name: 'WireGuard', patterns: ['WireGuard', 'wireguard'] },
  { name: 'Tailscale', patterns: ['tailscale', 'tailscaled'] },

  // Clipboard managers
  { name: 'Ditto', patterns: ['Ditto'] },
  { name: 'CopyQ', patterns: ['copyq'] },
  { name: 'Alfred', patterns: ['Alfred'] },
  { name: 'Raycast', patterns: ['Raycast'] },

  // Math / Homework solvers
  { name: 'Wolfram Mathematica', patterns: ['Mathematica', 'WolframAlpha'] },
  { name: 'MATLAB', patterns: ['MATLAB'] },
  { name: 'Maple', patterns: ['maplew', 'Maple'] }
]
