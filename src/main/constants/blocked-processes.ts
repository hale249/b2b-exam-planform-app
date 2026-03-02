import type { BlockedProcess } from '../types'

export const BLOCKED_PROCESSES: BlockedProcess[] = [
  // macOS native screen recording
  {
    name: 'Screen Recording',
    patterns: ['screencapture', 'ReplayKit', 'ScreenRecording']
  },

  // Screen recording
  { name: 'OBS Studio', patterns: ['obs64', 'obs32', 'obs.exe', 'obs-browser-page'] },
  { name: 'Bandicam', patterns: ['bdcam', 'bdcam.exe', 'bandicam', 'bandicam.exe'] },
  { name: 'Camtasia', patterns: ['CamtasiaStudio', 'CamRecorder', 'CamtasiaStudio.exe', 'CamRecorder.exe'] },
  { name: 'ShareX', patterns: ['ShareX', 'ShareX.exe'] },
  { name: 'Loom', patterns: ['Loom.app', 'Loom Helper', 'Loom.exe'] },
  { name: 'Snagit', patterns: ['Snagit', 'Snagit32', 'SnagitEditor', 'Snagit32.exe', 'SnagitEditor.exe'] },
  { name: 'QuickTime Player', patterns: ['QuickTime Player', 'QuickTimePlayerX'] },
  { name: 'Lightshot', patterns: ['Lightshot', 'lightshot', 'Lightshot.exe'] },
  { name: 'Monosnap', patterns: ['Monosnap', 'Monosnap.exe'] },
  { name: 'Xbox Game Bar', patterns: ['GameBar', 'GameBarPresenceWriter'] },

  // Remote desktop
  { name: 'TeamViewer', patterns: ['TeamViewer', 'TeamViewer.exe'] },
  { name: 'AnyDesk', patterns: ['AnyDesk', 'AnyDesk.exe'] },
  { name: 'UltraViewer', patterns: ['UltraViewer', 'UltraViewer.exe'] },
  {
    name: 'Chrome Remote Desktop',
    patterns: ['remoting_host', 'remoting_host.exe', 'chrome_remote_desktop', 'chromoting']
  },
  {
    name: 'Microsoft Remote Desktop',
    patterns: ['mstsc', 'mstsc.exe', 'Microsoft Remote Desktop']
  },

  // Chat / Messaging
  { name: 'Zalo', patterns: ['Zalo', 'ZaloPC', 'Zalo.exe'] },
  { name: 'Discord', patterns: ['Discord.app', 'Discord Helper', 'Discord.exe', 'Update.exe --processStart Discord.exe'] },
  { name: 'Facebook Messenger', patterns: ['Messenger.app', 'FacebookMessenger', 'Messenger.exe'] },
  { name: 'Telegram', patterns: ['Telegram.app', 'Telegram Desktop', 'Telegram.exe'] },
  { name: 'Slack', patterns: ['Slack.app', 'Slack Helper', 'slack.exe'] },
  { name: 'WhatsApp', patterns: ['WhatsApp', 'WhatsApp.exe'] },
  { name: 'Skype', patterns: ['Skype', 'SkypeApp', 'Skype.exe'] },

  // Translation software
  { name: 'DeepL', patterns: ['DeepL', 'DeepL.exe'] },
  { name: 'Google Translate (QTranslate)', patterns: ['QTranslate', 'QTranslate.exe'] },
  { name: 'Lạc Việt Dictionary', patterns: ['LacViet', 'LacVietMTD', 'MTD2024', 'LacVietMTD.exe', 'MTD2024.exe'] },

  // AI Assistant apps
  { name: 'ChatGPT', patterns: ['ChatGPT', 'ChatGPT.exe', 'com.openai.chat'] },
  { name: 'Claude', patterns: ['Claude.app', 'Claude.exe', 'com.anthropic.claude'] },
  { name: 'Microsoft Copilot', patterns: ['Microsoft.Copilot', 'Copilot.app', 'Copilot.exe'] },
  { name: 'Gemini', patterns: ['Google Gemini', 'Gemini.app', 'Gemini.exe'] },
  { name: 'Cursor', patterns: ['Cursor.app', 'Cursor Helper', 'Cursor.exe'] },
  { name: 'Windsurf', patterns: ['Windsurf.app', 'Windsurf Helper', 'Windsurf.exe'] },
  { name: 'Perplexity', patterns: ['Perplexity.app', 'Perplexity.exe'] },
  { name: 'DeepSeek', patterns: ['DeepSeek', 'DeepSeek.app', 'DeepSeek.exe'] },
  { name: 'Poe', patterns: ['Poe', 'Poe.app', 'Poe.exe'] },

  // Video conferencing / Screen sharing
  { name: 'Zoom', patterns: ['Zoom', 'zoom.us', 'Zoom.exe'] },
  { name: 'Cisco Webex', patterns: ['WebexHost', 'CiscoWebExStart', 'webex', 'webex.exe', 'atmgr.exe'] },
  { name: 'Lark', patterns: ['Lark', 'Lark.app', 'Lark.exe'] }
]