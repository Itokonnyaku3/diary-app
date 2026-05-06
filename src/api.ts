import type { Entry, Tag, ChatMessage, Mode } from './types'

export function getApiUrl(): string {
  return localStorage.getItem('diary_api_url') || 'http://localhost:8000'
}

// ─── 日記 CRUD ─────────────────────────────────────────

export async function fetchEntries(mode?: Mode): Promise<Entry[]> {
  const url = new URL(`${getApiUrl()}/diary`)
  if (mode) url.searchParams.set('mode', mode)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('Failed to fetch entries')
  return res.json()
}

export async function fetchEntry(id: number): Promise<Entry> {
  const res = await fetch(`${getApiUrl()}/diary/${id}`)
  if (!res.ok) throw new Error('Failed to fetch entry')
  return res.json()
}

export async function createEntry(data: {
  title: string; content: string; mode: Mode; date: string; tag_ids?: number[]
}): Promise<Entry> {
  const res = await fetch(`${getApiUrl()}/diary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create entry')
  return res.json()
}

export async function updateEntry(
  id: number,
  data: Partial<{ title: string; content: string; mode: Mode; date: string; tag_ids: number[] }>
): Promise<Entry> {
  const res = await fetch(`${getApiUrl()}/diary/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update entry')
  return res.json()
}

export async function deleteEntry(id: number): Promise<void> {
  const res = await fetch(`${getApiUrl()}/diary/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete entry')
}

// ─── タグ ──────────────────────────────────────────────

export async function fetchTags(): Promise<Tag[]> {
  const res = await fetch(`${getApiUrl()}/tags`)
  if (!res.ok) throw new Error('Failed to fetch tags')
  return res.json()
}

export async function createTag(name: string, color = '#6366f1'): Promise<Tag> {
  const res = await fetch(`${getApiUrl()}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  })
  if (!res.ok) throw new Error('Failed to create tag')
  return res.json()
}

// ─── 画像アップロード ───────────────────────────────────

export async function uploadImage(file: File): Promise<{ url: string; filename: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${getApiUrl()}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Failed to upload image')
  return res.json()
}

// ─── チャット（FastAPI 経由 → Ollama）SSE ストリーミング ──

export async function* streamChat(
  messages: ChatMessage[],
  currentEntry: string,
  mode: Mode,
  systemPrompt?: string
): AsyncGenerator<string> {
  const res = await fetch(`${getApiUrl()}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      current_entry: currentEntry,
      mode,
      system_prompt: systemPrompt || undefined,
    }),
  })
  if (!res.ok || !res.body) throw new Error(`Chat failed: ${res.status}`)

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data)
        if (parsed.content) yield parsed.content
      } catch {/* ignore */}
    }
  }
}
