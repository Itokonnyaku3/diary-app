export type Mode = 'private' | 'work'

export interface Tag {
  id: number
  name: string
  color: string
}

export interface Entry {
  id: number
  title: string
  content: string  // Tiptap JSON 文字列
  mode: Mode
  date: string     // YYYY-MM-DD
  tags: Tag[]
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface Settings {
  apiUrl: string
  privateSystemPrompt: string
  workSystemPrompt: string
  autoCommentEnabled: boolean   // 自動コメント ON/OFF
  autoCommentDelay: number      // 自動コメントまでの秒数
}

export const DEFAULT_SETTINGS: Settings = {
  apiUrl: 'http://localhost:8000',
  privateSystemPrompt: '',
  workSystemPrompt: '',
  autoCommentEnabled: true,
  autoCommentDelay: 15,
}
