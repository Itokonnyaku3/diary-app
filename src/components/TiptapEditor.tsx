import { useEffect, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import { uploadImage, getApiUrl } from '../api'
import '../styles/editor.css'

type JSONContent = { type?: string; content?: JSONContent[]; text?: string; [key: string]: unknown }

interface ZoomFrame {
  doc: JSONContent
  nodeIndex: number
  label: string
}

interface Props {
  // マウント時の初期コンテンツ。key が変わるたびに remount するので
  // このコンポーネント内でコンテンツを props から再同期する必要はない。
  initialContent: string
  onChange: (json: string, text: string) => void
  onEditorReady?: (editor: Editor | null) => void
}

function parseContent(raw: string): JSONContent | string {
  if (!raw || raw === '{}') return ''
  try {
    const parsed = JSON.parse(raw)
    if (parsed.type === 'doc') return parsed
  } catch {/* noop */}
  return raw
}

function getLabel(node: JSONContent): string {
  const texts: string[] = []
  const extract = (n: JSONContent) => {
    if (n.text) texts.push(n.text as string)
    if (n.content) n.content.forEach(extract)
  }
  extract(node)
  return texts.join('').slice(0, 30) || '（無題）'
}

export default function TiptapEditor({ initialContent, onChange, onEditorReady }: Props) {
  const [zoomStack, setZoomStack] = useState<ZoomFrame[]>([])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: '今日のことを書いてみましょう…' }),
      Typography,
    ],
    content: parseContent(initialContent),
    onUpdate({ editor }) {
      onChange(JSON.stringify(editor.getJSON()), editor.getText())
    },
    editorProps: {
      handleDrop(view, event, _slice, moved) {
        if (!moved && event.dataTransfer?.files?.length) {
          const file = event.dataTransfer.files[0]
          if (file.type.startsWith('image/')) {
            event.preventDefault()
            uploadImage(file).then(({ url }) => {
              const abs = url.startsWith('http') ? url : `${getApiUrl()}${url}`
              const { schema } = view.state
              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
              const node = schema.nodes.image.create({ src: abs })
              view.dispatch(view.state.tr.insert(pos?.pos ?? 0, node))
            })
            return true
          }
        }
        return false
      },
      handlePaste(_view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            const file = item.getAsFile()
            if (file) {
              uploadImage(file).then(({ url }) => {
                const abs = url.startsWith('http') ? url : `${getApiUrl()}${url}`
                editor?.chain().focus().setImage({ src: abs }).run()
              })
            }
            return true
          }
        }
        return false
      },
    },
  })

  // エディタインスタンスを親へ通知
  useEffect(() => {
    if (onEditorReady) onEditorReady(editor ?? null)
    return () => { if (onEditorReady) onEditorReady(null) }
  }, [editor, onEditorReady])

  // ── ズーム ──────────────────────────────────────────────
  function zoomIn() {
    if (!editor) return
    const doc = editor.getJSON()
    const { from } = editor.state.selection
    const resolved = editor.state.doc.resolve(from)
    let depth = resolved.depth
    while (depth > 1) depth--
    const nodePos = resolved.before(depth > 0 ? depth : 1)
    const node = editor.state.doc.nodeAt(nodePos)
    if (!node || !node.content.size) return
    const nodeJSON = node.toJSON() as JSONContent
    const label = getLabel(nodeJSON)
    const parentContent = (doc.content ?? []) as JSONContent[]
    let offset = 1; let nodeIndex = 0
    for (let i = 0; i < parentContent.length; i++) {
      if (offset > nodePos) { nodeIndex = i; break }
      offset += (parentContent[i] as { nodeSize?: number }).nodeSize ?? 1
    }
    setZoomStack(prev => [...prev, { doc, nodeIndex, label }])
    const inner = (nodeJSON.content ?? []) as JSONContent[]
    editor.commands.setContent({ type: 'doc', content: inner.length ? inner : [{ type: 'paragraph' }] }, false)
  }

  function zoomOut() {
    if (!editor || zoomStack.length === 0) return
    const edited = editor.getJSON()
    const frame = zoomStack[zoomStack.length - 1]
    const restored = JSON.parse(JSON.stringify(frame.doc)) as JSONContent
    if (restored.content?.[frame.nodeIndex]) {
      restored.content[frame.nodeIndex] = { ...restored.content[frame.nodeIndex], content: edited.content }
    }
    setZoomStack(prev => prev.slice(0, -1))
    editor.commands.setContent(restored, false)
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return
      if (e.key === ']') { e.preventDefault(); zoomIn() }
      if (e.key === '[') { e.preventDefault(); zoomOut() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [editor, zoomStack])

  if (!editor) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* パンくずナビ */}
      {zoomStack.length > 0 && (
        <div style={{ padding: '6px 24px', background: 'var(--bg-3)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
          <button onClick={() => { if (!editor) return; editor.commands.setContent(zoomStack[0].doc, false); setZoomStack([]) }}
            style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>ルート</button>
          {zoomStack.map((frame, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>›</span>
              {i === zoomStack.length - 1
                ? <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{frame.label}</span>
                : <button onClick={() => { if (!editor) return; editor.commands.setContent(frame.doc, false); setZoomStack(prev => prev.slice(0, i + 1)) }}
                    style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>{frame.label}</button>}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>Ctrl+[ で戻る</span>
        </div>
      )}

      {/* ツールバー */}
      <div className="editor-toolbar">
        <Btn label="H1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
        <Btn label="H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <Btn label="H3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <div className="toolbar-divider" />
        <Btn label="B" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} style={{ fontWeight: 700 }} />
        <Btn label="I" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} style={{ fontStyle: 'italic' }} />
        <Btn label="S" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} style={{ textDecoration: 'line-through' }} />
        <div className="toolbar-divider" />
        <Btn label="≡" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} style={{ fontSize: 16 }} />
        <Btn label="1." active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <Btn label="✓" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} style={{ fontSize: 14 }} />
        <div className="toolbar-divider" />
        <Btn label="❝" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} style={{ fontSize: 16 }} />
        <Btn label="</>" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} style={{ fontSize: 11 }} />
        <div className="toolbar-divider" />
        <label className="toolbar-btn" title="画像を挿入" style={{ cursor: 'pointer' }}>🖼
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return
              const { url } = await uploadImage(file)
              const abs = url.startsWith('http') ? url : `${getApiUrl()}${url}`
              editor.chain().focus().setImage({ src: abs }).run(); e.target.value = ''
            }} />
        </label>
        <div className="toolbar-divider" />
        <Btn label="⊕" title="ズームイン (Ctrl+])" onClick={zoomIn} />
        {zoomStack.length > 0 && <Btn label="⊖" title="ズームアウト (Ctrl+[)" onClick={zoomOut} active />}
        <div className="toolbar-divider" />
        <Btn label="↩" onClick={() => editor.chain().focus().undo().run()} style={{ fontSize: 16 }} />
        <Btn label="↪" onClick={() => editor.chain().focus().redo().run()} style={{ fontSize: 16 }} />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>
          Tab: インデント　Ctrl+]: ズームイン　Ctrl+[: ズームアウト
        </span>
      </div>

      {/* エディタ本体 */}
      <div className="tiptap-editor"><EditorContent editor={editor} /></div>
    </div>
  )
}

function Btn({ label, title, active, onClick, style }: {
  label: string; title?: string; active?: boolean; onClick?: () => void; style?: React.CSSProperties
}) {
  return (
    <button className={`toolbar-btn${active ? ' is-active' : ''}`}
      title={title} onClick={onClick} type="button" style={style}>{label}</button>
  )
}
