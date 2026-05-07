import { useState } from 'react'
import type { Entry, Mode } from '../types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface Props {
  entries: Entry[]
  selectedId: number | null
  mode: Mode
  onSelect: (id: number) => void
  onNew: (type?: 'diary' | 'project') => void
  onModeChange: (mode: Mode) => void
  onSettingsOpen: () => void
}

export default function Sidebar({
  entries, selectedId, mode, onSelect, onNew, onModeChange, onSettingsOpen,
}: Props) {
  const [search, setSearch] = useState('')
  const [showProjects, setShowProjects] = useState(true)
  const [showDiary, setShowDiary] = useState(true)

  const diaryEntries = entries.filter(e =>
    e.entry_type !== 'project' &&
    e.title.toLowerCase().includes(search.toLowerCase())
  )
  const projectEntries = entries.filter(e =>
    e.entry_type === 'project' &&
    e.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <aside style={{ width: 'var(--sidebar-w)', minWidth: 200, maxWidth: 340,
      background: 'var(--bg-2)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0 }}>

      {/* ヘッダー */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>📓</span>
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Diary</span>
          <button onClick={onSettingsOpen} title="設定"
            style={{ color: 'var(--text-2)', fontSize: 16, padding: '2px 4px', cursor: 'pointer' }}>⚙</button>
        </div>

        {/* モード切替 */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-3)', borderRadius: 6, padding: 3, marginBottom: 8 }}>
          {(['private', 'work'] as Mode[]).map(m => (
            <button key={m} onClick={() => onModeChange(m)} style={{
              flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: mode === m ? 'var(--accent)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--text-2)',
              transition: 'all .15s',
            }}>
              {m === 'private' ? '🔒 プライベート' : '💼 仕事'}
            </button>
          ))}
        </div>

        {/* 検索 */}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="検索…"
          style={{ width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text-1)', outline: 'none' }} />
      </div>

      {/* 新規ボタン */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 6 }}>
        <button onClick={() => onNew('diary')} style={{
          flex: 1, padding: '7px 0', borderRadius: 6,
          background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer',
        }}>+ 日記</button>
        <button onClick={() => onNew('project')} style={{
          flex: 1, padding: '7px 0', borderRadius: 6,
          background: 'var(--bg-3)', color: 'var(--text-2)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
          border: '1px solid var(--border)',
        }}>+ プロジェクト</button>
      </div>

      {/* エントリ一覧 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>

        {/* プロジェクトセクション */}
        {projectEntries.length > 0 && (
          <div>
            <button onClick={() => setShowProjects(v => !v)}
              style={{ width: '100%', textAlign: 'left', padding: '6px 14px 4px',
                fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
                letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4,
                cursor: 'pointer', background: 'transparent' }}>
              <span style={{ transition: 'transform .15s', display: 'inline-block',
                transform: showProjects ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              📌 プロジェクト ({projectEntries.length})
            </button>
            {showProjects && projectEntries.map(entry => (
              <EntryItem key={entry.id} entry={entry} selected={selectedId === entry.id}
                onClick={() => onSelect(entry.id)} />
            ))}
          </div>
        )}

        {/* 日記セクション */}
        <button onClick={() => setShowDiary(v => !v)}
          style={{ width: '100%', textAlign: 'left', padding: '6px 14px 4px',
            fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
            letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4,
            cursor: 'pointer', background: 'transparent' }}>
          <span style={{ transition: 'transform .15s', display: 'inline-block',
            transform: showDiary ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          📅 日記 ({diaryEntries.length})
        </button>
        {showDiary && (
          diaryEntries.length === 0 ? (
            <div style={{ padding: '12px 16px', color: 'var(--text-2)', fontSize: 13, textAlign: 'center' }}>
              日記がありません
            </div>
          ) : (
            diaryEntries.map(entry => (
              <EntryItem key={entry.id} entry={entry} selected={selectedId === entry.id}
                onClick={() => onSelect(entry.id)} />
            ))
          )
        )}
      </div>
    </aside>
  )
}

function EntryItem({ entry, selected, onClick }: { entry: Entry; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', padding: '8px 14px', cursor: 'pointer',
      background: selected ? 'var(--bg-hover)' : 'transparent',
      borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
      transition: 'background .1s', display: 'block',
    }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-3)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontWeight: 500, fontSize: 13, color: 'var(--text-1)' }}>
        {entry.title || '（タイトルなし）'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
        {entry.date && format(new Date(entry.date + 'T00:00:00'), 'M月d日(E)', { locale: ja })}
        {entry.tags.slice(0, 2).map(t => (
          <span key={t.id} style={{
            display: 'inline-block', background: t.color + '33', color: t.color,
            borderRadius: 3, padding: '0 4px', marginLeft: 4, fontSize: 10,
          }}>#{t.name}</span>
        ))}
      </div>
    </button>
  )
}
