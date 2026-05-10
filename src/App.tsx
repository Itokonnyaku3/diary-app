import { useState, useEffect, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import type { Entry, Mode, Settings, Tag } from './types'
import { DEFAULT_SETTINGS } from './types'
import { fetchEntries, fetchTags, createTag, updateEntry } from './api'
import Sidebar from './components/Sidebar'
import EditorPane from './components/EditorPane'
import AgentPane from './components/AgentPane'
import SettingsModal from './components/Settings'
import CommandPalette from './components/CommandPalette'

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('diary_settings')
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {/* noop */}
  return DEFAULT_SETTINGS
}

export default function App() {
  const [entries, setEntries]               = useState<Entry[]>([])
  const [tags, setTags]                     = useState<Tag[]>([])
  const [selectedId, setSelectedId]         = useState<number | null>(null)
  const [isNew, setIsNew]                   = useState(false)
  const [newEntryType, setNewEntryType]     = useState<'diary' | 'project'>('diary')
  const [mode, setMode]                     = useState<Mode>('private')
  const [settings, setSettings]             = useState<Settings>(loadSettings)
  const [showSettings, setShowSettings]     = useState(false)
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null)
  const [currentText, setCurrentText]       = useState('')

  useEffect(() => {
    localStorage.setItem('diary_api_url', settings.apiUrl)
    localStorage.setItem('diary_settings', JSON.stringify(settings))
  }, [settings])

  useEffect(() => { loadData() }, [mode])

  async function loadData() {
    try {
      const [es, ts] = await Promise.all([fetchEntries(mode), fetchTags()])
      setEntries(es)
      setTags(ts)
    } catch (e) {
      console.error('API接続エラー:', e)
    }
  }

  const selectedEntry = isNew ? null : (entries.find(e => e.id === selectedId) ?? null)

  function handleSaved(entry: Entry, wasCreated: boolean) {
    // エントリ一覧を更新
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === entry.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = entry
        return next.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      }
      return [entry, ...prev]
    })
    // selectedId の更新は「新規作成の初回保存」のときだけ行う
    // 更新保存のときに setSelectedId を呼ぶと、ユーザーが別エントリに
    // 切り替えた後でも元のエントリに戻ってしまうバグを防ぐ
    if (wasCreated && isNew && selectedId === null) {
      setIsNew(false)
      setSelectedId(entry.id)
    }
  }

  function handleNew(type: 'diary' | 'project' = 'diary') {
    setNewEntryType(type); setIsNew(true); setSelectedId(null)
  }
  function handleSelect(id: number)  { setIsNew(false); setSelectedId(id) }
  function handleModeChange(m: Mode) { setMode(m); setSelectedId(null); setIsNew(false) }

  // エディタインスタンスを受け取り、テキスト変化を監視する
  const handleEditorReady = useCallback((editor: Editor | null) => {
    setEditorInstance(editor)
  }, [])

  useEffect(() => {
    if (!editorInstance) return
    const update = () => setCurrentText(editorInstance.getText())
    editorInstance.on('update', update)
    // 初期テキストも設定
    setCurrentText(editorInstance.getText())
    return () => { editorInstance.off('update', update) }
  }, [editorInstance])

  const handleTagAccept = useCallback(async (tagName: string) => {
    try {
      let tag = tags.find(t => t.name === tagName)
      if (!tag) {
        tag = await createTag(tagName)
        setTags(prev => [...prev, tag!])
      }
      if (selectedId) {
        const entry = entries.find(e => e.id === selectedId)
        if (entry) {
          const currentTagIds = entry.tags.map(t => t.id)
          if (!currentTagIds.includes(tag.id)) {
            const updated = await updateEntry(selectedId, { tag_ids: [...currentTagIds, tag.id] })
            handleSaved(updated, false)
          }
        }
      }
    } catch (e) {
      console.error('タグ追加エラー:', e)
    }
  }, [tags, selectedId, entries])

  const systemPrompt = mode === 'work' ? settings.workSystemPrompt : settings.privateSystemPrompt

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        entries={entries}
        selectedId={selectedId}
        mode={mode}
        onSelect={handleSelect}
        onNew={handleNew}
        onModeChange={handleModeChange}
        onSettingsOpen={() => setShowSettings(true)}
      />
      <EditorPane
        entry={selectedEntry}
        isNew={isNew}
        initialEntryType={newEntryType}
        mode={mode}
        tags={tags}
        onSaved={handleSaved}
        onEditorReady={handleEditorReady}
      />
      <AgentPane
        currentEntryText={currentText}
        currentEntryId={selectedId}
        mode={mode}
        systemPrompt={systemPrompt}
        tags={tags}
        autoCommentEnabled={settings.autoCommentEnabled}
        autoCommentDelay={settings.autoCommentDelay}
        onTagAccept={handleTagAccept}
      />
      <CommandPalette
        editor={editorInstance}
        mode={mode}
        onNewEntry={() => handleNew('diary')}
        onModeChange={handleModeChange}
        onOpenSettings={() => setShowSettings(true)}
      />
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={s => setSettings(s)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
