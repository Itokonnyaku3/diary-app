import { useState, useEffect, useRef, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import type { Entry, Mode, Tag } from '../types'
import { updateEntry, createEntry } from '../api'
import { format } from 'date-fns'
import TiptapEditor from './TiptapEditor'

interface Props {
  entry: Entry | null
  isNew: boolean
  mode: Mode
  tags: Tag[]
  onSaved: (entry: Entry) => void
  onEditorReady: (editor: Editor | null) => void
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function EditorPane({ entry, isNew, mode, tags, onSaved, onEditorReady }: Props) {
  const [title, setTitle]             = useState('')
  const [content, setContent]         = useState('{}')
  const [plainText, setPlainText]     = useState('')
  const [date, setDate]               = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [saving, setSaving]           = useState(false)
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null)
  const entryIdRef = useRef<number | null>(null)
  const prevEntryId = useRef<number | null>(null)

  // エントリ切替時にフィールドをリセット
  useEffect(() => {
    const newId = isNew ? null : (entry?.id ?? null)
    if (newId === prevEntryId.current) return
    prevEntryId.current = newId

    if (isNew) {
      setTitle('')
      setContent('{}')
      setPlainText('')
      setDate(format(new Date(), 'yyyy-MM-dd'))
      setSelectedTagIds([])
      entryIdRef.current = null
    } else if (entry) {
      setTitle(entry.title)
      setContent(entry.content)
      setPlainText('')
      setDate(entry.date)
      setSelectedTagIds(entry.tags.map(t => t.id))
      entryIdRef.current = entry.id
    }
  }, [entry?.id, isNew])

  const debouncedTitle   = useDebounce(title, 700)
  const debouncedContent = useDebounce(content, 700)

  const save = useCallback(async () => {
    if (!debouncedTitle && (debouncedContent === '{}' || !debouncedContent)) return
    setSaving(true)
    try {
      const payload = { title: debouncedTitle, content: debouncedContent, mode, date, tag_ids: selectedTagIds }
      if (entryIdRef.current) {
        const updated = await updateEntry(entryIdRef.current, payload)
        onSaved(updated)
      } else {
        const created = await createEntry(payload)
        entryIdRef.current = created.id
        onSaved(created)
      }
    } catch (e) {
      console.error('Save error:', e)
    } finally {
      setSaving(false)
    }
  }, [debouncedTitle, debouncedContent, mode, date, selectedTagIds, onSaved])

  useEffect(() => { save() }, [debouncedTitle, debouncedContent])

  // Tiptap Editor インスタンスを親へ渡す
  useEffect(() => { onEditorReady(editorInstance) }, [editorInstance, onEditorReady])

  const showEmpty = !isNew && !entry
  if (showEmpty) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-2)', flexDirection: 'column', gap: 12,
      }}>
        <span style={{ fontSize: 48 }}>📝</span>
        <p style={{ fontSize: 14 }}>左のサイドバーから日記を選ぶか、「+ 新しい日記」をクリック</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Ctrl+K でコマンドパレットを開けます</p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* ── メタバー（日付・タグ・保存状態） ── */}
      <div style={{
        padding: '8px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0,
      }}>
        <input
          type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{
            background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '4px 8px', fontSize: 13, color: 'var(--text-2)',
          }}
        />
        <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {tags.map(tag => (
            <button key={tag.id} onClick={() => setSelectedTagIds(ids =>
              ids.includes(tag.id) ? ids.filter(i => i !== tag.id) : [...ids, tag.id]
            )} style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500,
              background: selectedTagIds.includes(tag.id) ? tag.color + '33' : 'var(--bg-3)',
              color: selectedTagIds.includes(tag.id) ? tag.color : 'var(--text-2)',
              border: `1px solid ${selectedTagIds.includes(tag.id) ? tag.color + '66' : 'var(--border)'}`,
              transition: 'all .1s', cursor: 'pointer',
            }}>
              #{tag.name}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
          {saving ? '保存中…' : '✓ 保存済み'}
        </span>
      </div>

      {/* ── タイトル ── */}
      <input
        value={title} onChange={e => setTitle(e.target.value)}
        placeholder="タイトル"
        style={{
          padding: '16px 24px 8px', fontSize: 24, fontWeight: 700,
          color: 'var(--text-1)', width: '100%',
          background: 'transparent', border: 'none', outline: 'none', flexShrink: 0,
        }}
      />

      {/* ── Tiptap エディタ（ツールバー込み） ── */}
      <TiptapEditor
        key={`${isNew ? 'new' : entry?.id}`}
        content={content}
        onChange={(json, text) => {
          setContent(json)
          setPlainText(text)
        }}
      />
    </div>
  )
}
