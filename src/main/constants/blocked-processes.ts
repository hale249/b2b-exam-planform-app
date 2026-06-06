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
  {
    name: 'Camtasia',
    patterns: ['CamtasiaStudio', 'CamRecorder', 'CamtasiaStudio.exe', 'CamRecorder.exe']
  },
  { name: 'ShareX', patterns: ['ShareX', 'ShareX.exe'] },
  { name: 'Loom', patterns: ['Loom.app', 'Loom Helper', 'Loom.exe'] },
  {
    name: 'Snagit',
    patterns: ['Snagit', 'Snagit32', 'SnagitEditor', 'Snagit32.exe', 'SnagitEditor.exe']
  },
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
  {
    name: 'Discord',
    patterns: [
      'Discord.app',
      'Discord Helper',
      'Discord.exe',
      'Update.exe --processStart Discord.exe'
    ]
  },
  { name: 'Facebook Messenger', patterns: ['Messenger.app', 'FacebookMessenger', 'Messenger.exe'] },
  { name: 'Telegram', patterns: ['Telegram.app', 'Telegram Desktop', 'Telegram.exe'] },
  { name: 'Slack', patterns: ['Slack.app', 'Slack Helper', 'slack.exe'] },
  { name: 'WhatsApp', patterns: ['WhatsApp', 'WhatsApp.exe'] },
  { name: 'Skype', patterns: ['Skype', 'SkypeApp', 'Skype.exe'] },

  // Translation software
  { name: 'DeepL', patterns: ['DeepL', 'DeepL.exe'] },
  { name: 'Google Translate (QTranslate)', patterns: ['QTranslate', 'QTranslate.exe'] },
  {
    name: 'Lạc Việt Dictionary',
    patterns: ['LacViet', 'LacVietMTD', 'MTD2024', 'LacVietMTD.exe', 'MTD2024.exe']
  },

  // AI Assistant apps - general chatbots
  { name: 'ChatGPT', patterns: ['ChatGPT', 'ChatGPT.exe', 'com.openai.chat'] },
  { name: 'Claude', patterns: ['Claude.app', 'Claude.exe', 'com.anthropic.claude'] },
  { name: 'Microsoft Copilot', patterns: ['Microsoft.Copilot', 'Copilot.app', 'Copilot.exe'] },
  { name: 'Gemini', patterns: ['Google Gemini', 'Gemini.app', 'Gemini.exe'] },
  { name: 'Perplexity', patterns: ['Perplexity.app', 'Perplexity.exe'] },
  { name: 'Poe', patterns: ['Poe', 'Poe.app', 'Poe.exe'] },
  { name: 'Grok', patterns: ['Grok', 'Grok.app', 'Grok.exe', 'com.xai.grok'] },
  { name: 'Mistral Le Chat', patterns: ['LeChat', 'Le Chat', 'LeChat.exe', 'Mistral.app'] },
  { name: 'DeepSeek', patterns: ['DeepSeek', 'DeepSeek.app', 'DeepSeek.exe'] },
  { name: 'Kimi', patterns: ['Kimi', 'Kimi.app', 'Kimi.exe', 'Moonshot'] },
  { name: 'Qwen', patterns: ['Qwen', 'Qwen.app', 'Qwen.exe', 'Tongyi', 'TongyiLingma'] },
  { name: 'Doubao', patterns: ['Doubao', 'Doubao.app', 'Doubao.exe'] },
  { name: 'Yuanbao', patterns: ['Yuanbao', 'Yuanbao.exe'] },
  { name: 'Wenxin', patterns: ['Wenxin', 'ERNIE', 'Wenxin.exe'] },

  // AI Coding assistants / IDEs
  { name: 'Cursor', patterns: ['Cursor.app', 'Cursor Helper', 'Cursor.exe'] },
  { name: 'Windsurf', patterns: ['Windsurf.app', 'Windsurf Helper', 'Windsurf.exe'] },
  { name: 'Trae', patterns: ['Trae.app', 'Trae Helper', 'Trae.exe'] },
  { name: 'Zed', patterns: ['Zed.app', 'Zed Helper', 'Zed.exe'] },
  {
    name: 'GitHub Copilot',
    patterns: ['GitHubCopilot', 'github-copilot', 'copilot-language-server']
  },
  { name: 'Codeium', patterns: ['Codeium', 'codeium', 'codeium.exe', 'codeium_language_server'] },
  { name: 'Tabnine', patterns: ['Tabnine', 'TabNine', 'tabnine.exe', 'TabNine.exe'] },
  { name: 'Continue', patterns: ['Continue.app', 'continue-core', 'continue.exe'] },
  { name: 'Cline', patterns: ['Cline', 'cline.exe'] },
  { name: 'Cody', patterns: ['Cody', 'Cody.app', 'sourcegraph-cody', 'cody.exe'] },
  { name: 'Aider', patterns: ['aider', 'aider.exe'] },

  // Local LLM runners
  { name: 'Ollama', patterns: ['Ollama', 'Ollama.app', 'ollama', 'ollama.exe'] },
  { name: 'LM Studio', patterns: ['LM Studio', 'LMStudio', 'LM Studio.app', 'LM Studio.exe'] },
  { name: 'Jan', patterns: ['Jan.app', 'jan.exe'] },
  { name: 'AnythingLLM', patterns: ['AnythingLLM', 'anythingllm', 'AnythingLLM.exe'] },
  { name: 'GPT4All', patterns: ['GPT4All', 'gpt4all', 'GPT4All.exe'] },

  // AI-enabled browsers
  { name: 'Brave', patterns: ['Brave Browser.app', 'brave.exe', 'brave-browser'] },
  { name: 'Opera', patterns: ['Opera.app', 'opera.exe'] },
  { name: 'Arc', patterns: ['Arc.app', 'Arc Helper', 'Arc.exe'] },
  { name: 'Dia', patterns: ['Dia.app', 'Dia Helper'] },

  // Video conferencing / Screen sharing
  { name: 'Zoom', patterns: ['Zoom', 'zoom.us', 'Zoom.exe'] },
  {
    name: 'Cisco Webex',
    patterns: ['WebexHost', 'CiscoWebExStart', 'webex', 'webex.exe', 'atmgr.exe']
  },
  { name: 'Lark', patterns: ['Lark', 'Lark.app', 'Lark.exe'] }
]
