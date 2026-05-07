import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import { uploadImage, getApiUrl } from '../api'
import '../styles/editor.css'

// Tiptap の JSON 型
type JSONContent = { type?: string; content?: JSONContent[]; text?: string; [key: string]: unknown }

interface ZoomFrame {
  doc: JSONContent        // ズームイン前のフルドキュメント
  nodeIndex: number       // ズームしたノードのインデックス
  parentContent: JSONContent[]  // 親の content 配列
  label: string
}

interface Props {
  content: string
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

function getNodeLabel(node: JSONContent): string {
  if (!node.content) return '（無題）'
  const texts: string[] = []
  const extract = (n: JSONContent) => {
    if (n.text) texts.push(n.text as string)
    if (n.content) n.content.forEach(extract)
  }
  extract(node)
  return texts.join('').slice(0, 30) || '（無題）'
}

export default function TiptapEditor({ content, onChange, onEditorReady }: Props) {
  const [zoomStack, setZoomStack] = useState<ZoomFrame[]>([])
  const fullDocRef = useRef<JSONContent | null>(null)
  const isFirstRender = useRef(true)

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
    content: parseContent(content),
    onUpdate({ editor }) {
      const json = JSON.stringify(editor.getJSON())
      const text = editor.getText()
      onChange(json, text)
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

  // content prop 変化時（別エントリ切替）
  useEffect(() => {
    if (!editor) return
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setZoomStack([])
    fullDocRef.current = null
    editor.commands.setContent(parseContent(content), false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.slice(0, 40)])

  // ── ズームイン ──────────────────────────────────────────
  function zoomIn() {
    if (!editor) return
    const doc = editor.getJSON()
    const { from } = editor.state.selection
    const resolved = editor.state.doc.resolve(from)
    // depth=1 のノード（トップレベル要素）を探す
    let depth = resolved.depth
    while (depth > 1) depth--
    const nodePos = resolved.before(depth > 0 ? depth : 1)
    const node = editor.state.doc.nodeAt(nodePos)
    if (!node || !node.content.size) return

    const nodeJSON = node.toJSON() as JSONContent
    const label = getNodeLabel(nodeJSON)
    const parentContent = (doc.content ?? []) as JSONContent[]
    const nodeIndex = parentContent.findIndex((_, i) => {
      let offset = 1
      for (let j = 0; j < i; j++) {
        offset += (parentContent[j] as { nodeSize?: number }).nodeSize ?? 1
      }
      return offset > nodePos
    })

    fullDocRef.current = doc
    setZoomStack(prev => [...prev, { doc, nodeIndex: Math.max(nodeIndex, 0), parentContent, label }])
    const innerContent = (nodeJSON.content ?? []) as JSONContent[]
    editor.commands.setContent({ type: 'doc', content: innerContent.length ? innerContent : [{ type: 'paragraph' }] }, false)
  }

  // ── ズームアウト ────────────────────────────────────────
  function zoomOut() {
    if (!editor || zoomStack.length === 0) return
    const editedDoc = editor.getJSON()
    const frame = zoomStack[zoomStack.length - 1]
    const restored = JSON.parse(JSON.stringify(frame.doc)) as JSONContent
    // 編集内容をズーム対象ノードに書き戻す
    if (restored.content && restored.content[frame.nodeIndex]) {
      restored.content[frame.nodeIndex] = {
        ...restored.content[frame.nodeIndex],
        content: editedDoc.content,
      }
    }
    setZoomStack(prev => prev.slice(0, -1))
    editor.commands.setContent(restored, false)
    fullDocRef.current = restored
  }

  // ── キーボード（Ctrl+] / Ctrl+[） ──────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return
      if (e.key === ']') { e.preventDefault(); zoomIn() }
      if (e.key === '[') { e.preventDefault(); zoomOut() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editor, zoomStack])

  if (!editor) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── パンくずナビ（ズーム中のみ表示） ── */}
      {zoomStack.length > 0 && (
        <div style={{
          padding: '6px 24px', background: 'var(--bg-3)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap',
        }}>
          <button onClick={() => {
            // ルートに戻る
            if (!editor || zoomStack.length === 0) return
            const root = zoomStack[0].doc
            setZoomStack([])
            editor.commands.setContent(root, false)
          }} style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>
            ルート
          </button>
          {zoomStack.map((frame, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>›</span>
              {i === zoomStack.length - 1 ? (
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{frame.label}</span>
              ) : (
                <button onClick={() => {
                  // i+1 番目までズームアウト
                  if (!editor) return
                  const target = zoomStack[i]
                  setZoomStack(prev => prev.slice(0, i + 1))
                  editor.commands.setContent(target.doc, false)
                }} style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>
                  {frame.label}
                </button>
              )}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>
            Ctrl+[ で戻る
          </span>
        </div>
      )}

      {/* ── ツールバー ── */}
      <div className="editor-toolbar">
        <ToolbarBtn label="H1" title="見出し1" active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
        <ToolbarBtn label="H2" title="見出し2" active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolbarBtn label="H3" title="見出し3" active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <div className="toolbar-divider" />
        <ToolbarBtn label="B" title="太字 (Ctrl+B)" active={editor.isActive('bold')} style={{ fontWeight: 700 }}
          onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarBtn label="I" title="斜体 (Ctrl+I)" active={editor.isActive('italic')} style={{ fontStyle: 'italic' }}
          onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarBtn label="S" title="取り消し線" active={editor.isActive('strike')} style={{ textDecoration: 'line-through' }}
          onClick={() => editor.chain().focus().toggleStrike().run()} />
        <div className="toolbar-divider" />
        <ToolbarBtn label="≡" title="箇条書き" active={editor.isActive('bulletList')} style={{ fontSize: 16 }}
          onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarBtn label="1." title="番号付きリスト" active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarBtn label="✓" title="チェックリスト" active={editor.isActive('taskList')} style={{ fontSize: 14 }}
          onClick={() => editor.chain().focus().toggleTaskList().run()} />
        <div className="toolbar-divider" />
        <ToolbarBtn label="❝" title="引用" active={editor.isActive('blockquote')} style={{ fontSize: 16 }}
          onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarBtn label="</>" title="コードブロック" active={editor.isActive('codeBlock')} style={{ fontSize: 11 }}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        <div className="toolbar-divider" />
        <label className="toolbar-btn" title="画像を挿入" style={{ cursor: 'pointer' }}>
          🖼
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              const { url } = await uploadImage(file)
              const abs = url.startsWith('http') ? url : `${getApiUrl()}${url}`
              editor.chain().focus().setImage({ src: abs }).run()
              e.target.value = ''
            }} />
        </label>
        <div className="toolbar-divider" />
        {/* ズームボタン */}
        <ToolbarBtn label="⊕" title="ズームイン (Ctrl+])" onClick={zoomIn} />
        {zoomStack.length > 0 && (
          <ToolbarBtn label="⊖" title="ズームアウト (Ctrl+[)" onClick={zoomOut}
            active style={{ background: 'var(--warning)' }} />
        )}
        <div className="toolbar-divider" />
        <ToolbarBtn label="↩" title="元に戻す (Ctrl+Z)"
          onClick={() => editor.chain().focus().undo().run()} style={{ fontSize: 16 }} />
        <ToolbarBtn label="↪" title="やり直す (Ctrl+Y)"
          onClick={() => editor.chain().focus().redo().run()} style={{ fontSize: 16 }} />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>
          Tab: インデント　Ctrl+]: ズームイン　Ctrl+[: ズームアウト
        </span>
      </div>

      {/* ── エディタ本体 ── */}
      <div className="tiptap-editor">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

interface BtnProps {
  label: string; title?: string; active?: boolean
  onClick?: () => void; style?: React.CSSProperties
}
function ToolbarBtn({ label, title, active, onClick, style }: BtnProps) {
  return (
    <button className={`toolbar-btn${active ? ' is-active' : ''}`}
      title={title} onClick={onClick} type="button" style={style}>
      {label}
    </button>
  )
}
