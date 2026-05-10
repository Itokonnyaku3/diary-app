import { useState, useEffect, useRef, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import type { Entry, Mode, Tag, EntryType } from '../types'
import { updateEntry, createEntry } from '../api'
import { format } from 'date-fns'
import TiptapEditor from './TiptapEditor'

interface Props {
  entry: Entry | null
  isNew: boolean
  initialEntryType: EntryType  // + 日記 or + プロジェクト で決まる初期タイプ
  mode: Mode
  tags: Tag[]
  onSaved: (entry: Entry, wasCreated: boolean) => void
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

export default function EditorPane({ entry, isNew, initialEntryType, mode, tags, onSaved, onEditorReady }: Props) {
  // ── 保存用のstate（TiptapEditorの表示とは切り離す）──────
  const [saveTitle, setSaveTitle]     = useState('')
  const [saveContent, setSaveContent] = useState('{}')
  const [date, setDate]               = useState(format(new Date(), 'yyyy-MM-dd'))
  const [entryType, setEntryType]     = useState<EntryType>('diary')
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [saveStatus, setSaveStatus]   = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // 保存先エントリIDのref（切替時に即座に更新）
  const saveTargetIdRef    = useRef<number | null>(null)
  const saveTargetIsNewRef = useRef(true)
  const prevLoadedKeyRef   = useRef<string>('')

  // ── エントリ切替 → saveTargetを即座に更新し、フォームも初期化 ──
  // isNew 時は initialEntryType もキーに含めることで、
  // + 日記 → + プロジェクト のような切替も正しくリセットされる
  const entryKey = isNew ? `new-${initialEntryType}` : String(entry?.id ?? 'empty')
  if (entryKey !== prevLoadedKeyRef.current) {
    prevLoadedKeyRef.current = entryKey
    saveTargetIdRef.current    = isNew ? null : (entry?.id ?? null)
    saveTargetIsNewRef.current = isNew

    const newTitle   = isNew ? '' : (entry?.title ?? '')
    const newContent = isNew ? '{}' : (entry?.content ?? '{}')
    const newDate    = isNew ? format(new Date(), 'yyyy-MM-dd') : (entry?.date ?? format(new Date(), 'yyyy-MM-dd'))
    const newType    = isNew ? initialEntryType : ((entry?.entry_type ?? 'diary') as EntryType)
    const newTagIds  = isNew ? [] : (entry?.tags.map(t => t.id) ?? [])

    if (saveTitle   !== newTitle)   setSaveTitle(newTitle)
    if (saveContent !== newContent) setSaveContent(newContent)
    if (date        !== newDate)    setDate(newDate)
    if (entryType   !== newType)    setEntryType(newType)
    // tagIds は配列なので常に更新
    setSelectedTagIds(newTagIds)
  }

  const debouncedTitle   = useDebounce(saveTitle, 800)
  const debouncedContent = useDebounce(saveContent, 800)

  // ── 保存（保存先IDは debounce 発火時点でキャプチャ）──────
  const save = useCallback(async (
    targetId: number | null,
    targetIsNew: boolean,
    t: string,
    c: string,
  ) => {
    if (!t && (c === '{}' || !c)) return
    setSaveStatus('saving')
    try {
      const payload = {
        title: t, content: c, mode,
        date: entryType === 'project' ? undefined : date,
        entry_type: entryType,
        tag_ids: selectedTagIds,
      }
      if (!targetIsNew && targetId !== null) {
        const updated = await updateEntry(targetId, payload)
        onSaved(updated, false)
      } else if (saveTargetIdRef.current === null) {
        const created = await createEntry({ ...payload, date: payload.date || format(new Date(), 'yyyy-MM-dd') })
        saveTargetIdRef.current    = created.id
        saveTargetIsNewRef.current = false
        onSaved(created, true)
      } else {
        const updated = await updateEntry(saveTargetIdRef.current, payload)
        onSaved(updated, false)
      }
      setSaveStatus('saved')
    } catch (e) {
      console.error('Save error:', e)
      setSaveStatus('error')
    }
  }, [mode, date, entryType, selectedTagIds, onSaved])

  useEffect(() => {
    const id    = saveTargetIdRef.current
    const isNow = saveTargetIsNewRef.current
    save(id, isNow, debouncedTitle, debouncedContent)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTitle, debouncedContent])

  // ── 空の状態 ──────────────────────────────────────────
  if (!isNew && !entry) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-2)', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 48 }}>📝</span>
        <p style={{ fontSize: 14 }}>左のサイドバーから選ぶか「+ 新しい日記」をクリック</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Ctrl+K でコマンドパレット</p>
      </div>
    )
  }

  // TiptapEditor に渡す initialContent は entry props から直接算出する
  // （state 経由にしないことで、remount 時に正しいコンテンツが渡る）
  const editorInitialContent = isNew ? '{}' : (entry?.content ?? '{}')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── メタバー ── */}
      <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>

        <div style={{ display: 'flex', background: 'var(--bg-3)', borderRadius: 6, padding: 2 }}>
          {(['diary', 'project'] as EntryType[]).map(t => (
            <button key={t} onClick={() => setEntryType(t)} style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: entryType === t ? 'var(--accent)' : 'transparent',
              color: entryType === t ? '#fff' : 'var(--text-2)', transition: 'all .15s',
            }}>{t === 'diary' ? '📅 日記' : '📌 プロジェクト'}</button>
          ))}
        </div>

        {entryType === 'diary' && (
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 8px', fontSize: 13, color: 'var(--text-2)' }} />
        )}

        <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {tags.map(tag => (
            <button key={tag.id} onClick={() => setSelectedTagIds(ids =>
              ids.includes(tag.id) ? ids.filter(i => i !== tag.id) : [...ids, tag.id]
            )} style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              background: selectedTagIds.includes(tag.id) ? tag.color + '33' : 'var(--bg-3)',
              color: selectedTagIds.includes(tag.id) ? tag.color : 'var(--text-2)',
              border: `1px solid ${selectedTagIds.includes(tag.id) ? tag.color + '66' : 'var(--border)'}`,
              transition: 'all .1s',
            }}>#{tag.name}</button>
          ))}
        </div>
        <span style={{
          fontSize: 11, flexShrink: 0,
          color: saveStatus === 'error' ? 'var(--danger)' : saveStatus === 'saved' ? 'var(--success)' : 'var(--text-3)',
        }}>
          {saveStatus === 'saving' ? '保存中…'
            : saveStatus === 'saved' ? '✓ 保存済み'
            : saveStatus === 'error' ? '⚠ 保存失敗（サーバー未接続）'
            : ''}
        </span>
      </div>

      {/* ── タイトル ── */}
      <input
        value={saveTitle}
        onChange={e => setSaveTitle(e.target.value)}
        placeholder={entryType === 'project' ? 'プロジェクト名' : 'タイトル'}
        style={{ padding: '16px 24px 8px', fontSize: 24, fontWeight: 700,
          color: 'var(--text-1)', width: '100%',
          background: 'transparent', border: 'none', outline: 'none', flexShrink: 0 }}
      />

      {/* ── Tiptap エディタ ──
          key が変わると remount。initialContent は entry props から直接渡すので
          常に正しいエントリのコンテンツで初期化される。 */}
      <TiptapEditor
        key={entryKey}   {/* entryKey が変わると remount → 正しいコンテンツで初期化 */}
        initialContent={editorInitialContent}
        onChange={(json, _text) => setSaveContent(json)}
        onEditorReady={onEditorReady}
      />
    </div>
  )
}
