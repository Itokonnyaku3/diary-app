import { useState } from 'react'
import type { Entry, Mode } from '../types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface Props {
  entries: Entry[]
  selectedId: number | null
  mode: Mode
  onSelect: (id: number) => void
  onNew: () => void
  onModeChange: (mode: Mode) => void
  onSettingsOpen: () => void
}

export default function Sidebar({
  entries, selectedId, mode, onSelect, onNew, onModeChange, onSettingsOpen,
}: Props) {
  const [search, setSearch] = useState('')

  const filtered = entries.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <aside style={{
      width: 'var(--sidebar-w)', minWidth: 200, maxWidth: 340,
      background: 'var(--bg-2)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0,
    }}>
      {/* ヘッダー */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>📓</span>
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Diary</span>
          <button onClick={onSettingsOpen} title="設定"
            style={{ color: 'var(--text-2)', fontSize: 16, padding: '2px 4px' }}>⚙</button>
        </div>

        {/* モード切替 */}
        <div className="flex gap-1" style={{
          background: 'var(--bg-3)', borderRadius: 6, padding: 3, marginBottom: 8,
        }}>
          {(['private', 'work'] as Mode[]).map(m => (
            <button key={m} onClick={() => onModeChange(m)} style={{
              flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 12, fontWeight: 600,
              background: mode === m ? 'var(--accent)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--text-2)',
              transition: 'all .15s',
            }}>
              {m === 'private' ? '🔒 プライベート' : '💼 仕事'}
            </button>
          ))}
        </div>

        {/* 検索 */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="検索…"
          style={{
            width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text-1)',
          }}
        />
      </div>

      {/* 新規作成ボタン */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={onNew} style={{
          width: '100%', padding: '7px 0', borderRadius: 6,
          background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13,
        }}>
          + 新しい日記
        </button>
      </div>

      {/* エントリ一覧 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '20px 16px', color: 'var(--text-2)', fontSize: 13, textAlign: 'center' }}>
            日記がありません
          </div>
        ) : (
          filtered.map(entry => (
            <button key={entry.id} onClick={() => onSelect(entry.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 14px',
                background: selectedId === entry.id ? 'var(--bg-hover)' : 'transparent',
                borderLeft: selectedId === entry.id ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'background .1s',
              }}
              onMouseEnter={e => { if (selectedId !== entry.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-3)' }}
              onMouseLeave={e => { if (selectedId !== entry.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div className="truncate" style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-1)' }}>
                {entry.title || '（タイトルなし）'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                {entry.date && format(new Date(entry.date + 'T00:00:00'), 'M月d日(E)', { locale: ja })}
                {entry.tags.length > 0 && (
                  <span style={{ marginLeft: 6 }}>
                    {entry.tags.slice(0, 2).map(t => (
                      <span key={t.id} style={{
                        display: 'inline-block', background: t.color + '33',
                        color: t.color, borderRadius: 3, padding: '0 4px', marginRight: 3, fontSize: 10,
                      }}>#{t.name}</span>
                    ))}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
