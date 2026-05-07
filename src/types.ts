export type Mode = 'private' | 'work'
export type EntryType = 'diary' | 'project'

export interface Tag {
  id: number
  name: string
  color: string
}

export interface Entry {
  id: number
  title: string
  content: string
  mode: Mode
  date: string | null
  entry_type: EntryType
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
  autoCommentEnabled: boolean
  autoCommentDelay: number
}

export const DEFAULT_SETTINGS: Settings = {
  apiUrl: 'http://localhost:8000',
  privateSystemPrompt: '',
  workSystemPrompt: '',
  autoCommentEnabled: true,
  autoCommentDelay: 15,
}
