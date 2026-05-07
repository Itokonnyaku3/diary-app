import { useState, useEffect, useRef, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import type { Entry, Mode, Tag, EntryType } from '../types'
import { updateEntry, createEntry } from '../api'
import { format } from 'date-fns'
import TiptapEditor from './TiptapEditor'

interface Props {
  entry: Entry | null
  isNew: boolean
  mode: Mode
  tags: Tag[]
  // wasCreated=true のとき App 側で selectedId を更新する
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

export default function EditorPane({ entry, isNew, mode, tags, onSaved, onEditorReady }: Props) {
  const [title, setTitle]               = useState('')
  const [content, setContent]           = useState('{}')
  const [date, setDate]                 = useState(format(new Date(), 'yyyy-MM-dd'))
  const [entryType, setEntryType]       = useState<EntryType>('diary')
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [saving, setSaving]             = useState(false)

  // 保存先エントリIDを管理するref（エントリ切替時に即座に更新）
  const saveTargetIdRef = useRef<number | null>(null)
  const saveTargetIsNewRef = useRef(true)
  // 前回ロードしたエントリIDを追跡（isNew=trueのときはnull）
  const prevLoadedId = useRef<number | null | 'new'>(undefined as unknown as null)

  // ── エントリ切替時の初期化 ──────────────────────────────
  useEffect(() => {
    const loadId: number | null | 'new' = isNew ? 'new' : (entry?.id ?? null)
    if (loadId === prevLoadedId.current) return
    prevLoadedId.current = loadId

    // 保存ターゲットをリセット（これが最重要: 切替前のdebounceが古いターゲットに保存しないように）
    saveTargetIdRef.current = isNew ? null : (entry?.id ?? null)
    saveTargetIsNewRef.current = isNew

    if (isNew) {
      setTitle('')
      setContent('{}')
      setDate(format(new Date(), 'yyyy-MM-dd'))
      setEntryType('diary')
      setSelectedTagIds([])
    } else if (entry) {
      setTitle(entry.title)
      setContent(entry.content || '{}')
      setDate(entry.date || format(new Date(), 'yyyy-MM-dd'))
      setEntryType((entry.entry_type as EntryType) || 'diary')
      setSelectedTagIds(entry.tags.map(t => t.id))
    }
  }, [entry?.id, isNew])

  const debouncedTitle   = useDebounce(title, 800)
  const debouncedContent = useDebounce(content, 800)

  // ── 保存処理 ───────────────────────────────────────────
  // debouncedTitle/Content が更新された時点のターゲットIDを保存に使う
  const save = useCallback(async (
    targetId: number | null,
    targetIsNew: boolean,
    t: string,
    c: string,
  ) => {
    if (!t && (c === '{}' || !c)) return
    setSaving(true)
    try {
      const payload = {
        title: t, content: c, mode,
        date: entryType === 'project' ? undefined : date,
        entry_type: entryType,
        tag_ids: selectedTagIds,
      }
      if (!targetIsNew && targetId !== null) {
        // 既存エントリの更新
        const updated = await updateEntry(targetId, payload)
        // selectedId は変えない（更新なので）
        onSaved(updated, false)
      } else if (targetIsNew && saveTargetIdRef.current === null) {
        // 新規作成（まだIDが発行されていない場合のみ）
        const created = await createEntry({ ...payload, date: payload.date || '' })
        saveTargetIdRef.current = created.id
        saveTargetIsNewRef.current = false
        onSaved(created, true)  // wasCreated=true → App側でselectedIdを更新
      } else if (targetIsNew && saveTargetIdRef.current !== null) {
        // 新規エントリが初回保存済み → 以降は update
        const updated = await updateEntry(saveTargetIdRef.current, payload)
        onSaved(updated, false)
      }
    } catch (e) {
      console.error('Save error:', e)
    } finally {
      setSaving(false)
    }
  }, [mode, date, entryType, selectedTagIds, onSaved])

  // debounce発火時点のターゲットIDをキャプチャして save に渡す
  useEffect(() => {
    // debouncedTitle/Content が変化した瞬間のターゲットIDを使う
    const capturedId    = saveTargetIdRef.current
    const capturedIsNew = saveTargetIsNewRef.current
    save(capturedId, capturedIsNew, debouncedTitle, debouncedContent)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTitle, debouncedContent])

  const showEmpty = !isNew && !entry
  if (showEmpty) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-2)', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 48 }}>📝</span>
        <p style={{ fontSize: 14 }}>左のサイドバーから選ぶか「+ 新しい日記」をクリック</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Ctrl+K でコマンドパレット</p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── メタバー ── */}
      <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>

        {/* 日記/プロジェクト切替 */}
        <div style={{ display: 'flex', background: 'var(--bg-3)', borderRadius: 6, padding: 2 }}>
          {(['diary', 'project'] as EntryType[]).map(t => (
            <button key={t} onClick={() => setEntryType(t)} style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: entryType === t ? 'var(--accent)' : 'transparent',
              color: entryType === t ? '#fff' : 'var(--text-2)',
              transition: 'all .15s',
            }}>
              {t === 'diary' ? '📅 日記' : '📌 プロジェクト'}
            </button>
          ))}
        </div>

        {/* 日付（日記のみ） */}
        {entryType === 'diary' && (
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 8px', fontSize: 13, color: 'var(--text-2)' }} />
        )}

        {/* タグ */}
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
        <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
          {saving ? '保存中…' : '✓ 保存済み'}
        </span>
      </div>

      {/* ── タイトル ── */}
      <input value={title} onChange={e => setTitle(e.target.value)}
        placeholder={entryType === 'project' ? 'プロジェクト名' : 'タイトル'}
        style={{ padding: '16px 24px 8px', fontSize: 24, fontWeight: 700,
          color: 'var(--text-1)', width: '100%',
          background: 'transparent', border: 'none', outline: 'none', flexShrink: 0 }} />

      {/* ── Tiptap エディタ ── */}
      <TiptapEditor
        key={isNew ? 'new' : String(entry?.id ?? 'empty')}
        content={content}
        onChange={(json, _text) => setContent(json)}
        onEditorReady={onEditorReady}
      />
    </div>
  )
}
