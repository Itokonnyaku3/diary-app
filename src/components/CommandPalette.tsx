import { useState, useEffect, useRef, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import type { Mode } from '../types'

export interface Command {
  id: string
  label: string
  icon: string
  group: string
  shortcut?: string
  action: () => void
}

interface Props {
  editor: Editor | null
  mode: Mode
  onNewEntry: () => void
  onModeChange: (m: Mode) => void
  onOpenSettings: () => void
}

export default function CommandPalette({ editor, mode, onNewEntry, onModeChange, onOpenSettings }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl+K でトグル
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQuery('')
        setCursor(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  const commands: Command[] = [
    // ── アプリコマンド ──
    { id: 'new', label: '新しい日記を作成', icon: '📝', group: 'アプリ', shortcut: 'Ctrl+N', action: () => { onNewEntry(); setOpen(false) } },
    { id: 'mode-private', label: 'プライベートモードに切替', icon: '🔒', group: 'アプリ', action: () => { onModeChange('private'); setOpen(false) } },
    { id: 'mode-work',    label: '仕事モードに切替', icon: '💼', group: 'アプリ', action: () => { onModeChange('work'); setOpen(false) } },
    { id: 'settings',     label: '設定を開く', icon: '⚙', group: 'アプリ', action: () => { onOpenSettings(); setOpen(false) } },
    // ── エディタコマンド ──
    { id: 'h1',    label: '見出し 1', icon: 'H1', group: 'エディタ', shortcut: 'Ctrl+Alt+1', action: () => { editor?.chain().focus().toggleHeading({ level: 1 }).run(); setOpen(false) } },
    { id: 'h2',    label: '見出し 2', icon: 'H2', group: 'エディタ', shortcut: 'Ctrl+Alt+2', action: () => { editor?.chain().focus().toggleHeading({ level: 2 }).run(); setOpen(false) } },
    { id: 'h3',    label: '見出し 3', icon: 'H3', group: 'エディタ', shortcut: 'Ctrl+Alt+3', action: () => { editor?.chain().focus().toggleHeading({ level: 3 }).run(); setOpen(false) } },
    { id: 'bold',  label: '太字',     icon: 'B',  group: 'エディタ', shortcut: 'Ctrl+B', action: () => { editor?.chain().focus().toggleBold().run(); setOpen(false) } },
    { id: 'italic',label: '斜体',     icon: 'I',  group: 'エディタ', shortcut: 'Ctrl+I', action: () => { editor?.chain().focus().toggleItalic().run(); setOpen(false) } },
    { id: 'ul',    label: '箇条書きリスト', icon: '≡', group: 'エディタ', action: () => { editor?.chain().focus().toggleBulletList().run(); setOpen(false) } },
    { id: 'ol',    label: '番号付きリスト', icon: '1.', group: 'エディタ', action: () => { editor?.chain().focus().toggleOrderedList().run(); setOpen(false) } },
    { id: 'task',  label: 'チェックリスト', icon: '✓', group: 'エディタ', action: () => { editor?.chain().focus().toggleTaskList().run(); setOpen(false) } },
    { id: 'quote', label: '引用',     icon: '❝', group: 'エディタ', action: () => { editor?.chain().focus().toggleBlockquote().run(); setOpen(false) } },
    { id: 'code',  label: 'コードブロック', icon: '</>', group: 'エディタ', action: () => { editor?.chain().focus().toggleCodeBlock().run(); setOpen(false) } },
    { id: 'hr',    label: '区切り線', icon: '—',  group: 'エディタ', action: () => { editor?.chain().focus().setHorizontalRule().run(); setOpen(false) } },
    { id: 'undo',  label: '元に戻す', icon: '↩',  group: 'エディタ', shortcut: 'Ctrl+Z', action: () => { editor?.chain().focus().undo().run(); setOpen(false) } },
    { id: 'redo',  label: 'やり直す', icon: '↪',  group: 'エディタ', shortcut: 'Ctrl+Y', action: () => { editor?.chain().focus().redo().run(); setOpen(false) } },
  ]

  const filtered = query
    ? commands.filter(c => c.label.includes(query) || c.id.includes(query.toLowerCase()))
    : commands

  // グループでまとめる
  const groups = [...new Set(filtered.map(c => c.group))]

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); filtered[cursor]?.action() }
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh', zIndex: 200,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 12, width: 480, maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 検索欄 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 16, color: 'var(--text-3)' }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={handleKey}
            placeholder="コマンドを検索…"
            style={{
              flex: 1, fontSize: 15, color: 'var(--text-1)',
              background: 'transparent', border: 'none', outline: 'none',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4 }}>ESC</span>
        </div>

        {/* コマンド一覧 */}
        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              コマンドが見つかりません
            </div>
          ) : (
            groups.map(group => {
              const items = filtered.filter(c => c.group === group)
              const startIdx = filtered.indexOf(items[0])
              return (
                <div key={group}>
                  <div style={{ padding: '6px 16px 3px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {group}
                  </div>
                  {items.map((cmd, i) => {
                    const globalIdx = startIdx + i
                    return (
                      <button
                        key={cmd.id}
                        onClick={cmd.action}
                        onMouseEnter={() => setCursor(globalIdx)}
                        style={{
                          width: '100%', textAlign: 'left',
                          padding: '8px 16px',
                          display: 'flex', alignItems: 'center', gap: 12,
                          background: cursor === globalIdx ? 'var(--bg-hover)' : 'transparent',
                          transition: 'background .1s',
                        }}
                      >
                        <span style={{
                          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--bg-3)', borderRadius: 6, fontSize: 12, fontWeight: 700,
                          color: 'var(--text-2)', flexShrink: 0,
                        }}>{cmd.icon}</span>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{cmd.label}</span>
                        {cmd.shortcut && (
                          <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4 }}>
                            {cmd.shortcut}
                          </span>
                        )}
                        {cmd.id === `mode-${mode}` && (
                          <span style={{ fontSize: 10, color: 'var(--success)', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: 4 }}>現在</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
