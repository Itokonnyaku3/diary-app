import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import { uploadImage, getApiUrl } from '../api'
import '../styles/editor.css'

interface Props {
  content: string
  onChange: (json: string, text: string) => void
  onImageDrop?: (url: string) => void
}

// Tiptap JSON と plain text の両方を返す
function parseInitialContent(raw: string) {
  if (!raw || raw === '{}') return ''
  try {
    const parsed = JSON.parse(raw)
    if (parsed.type === 'doc') return parsed
  } catch {/* noop */}
  // plain text fallback
  return raw
}

export default function TiptapEditor({ content, onChange }: Props) {
  const isFirstRender = useRef(true)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Tab キーでインデント動作をリスト内で有効にする
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: '今日のことを書いてみましょう…' }),
      Typography,
    ],
    content: parseInitialContent(content),
    onUpdate({ editor }) {
      const json = JSON.stringify(editor.getJSON())
      const text = editor.getText()
      onChange(json, text)
    },
    editorProps: {
      // 画像ドロップ & ペースト
      handleDrop(view, event, _slice, moved) {
        if (!moved && event.dataTransfer?.files?.length) {
          const file = event.dataTransfer.files[0]
          if (file.type.startsWith('image/')) {
            event.preventDefault()
            uploadImage(file).then(({ url }) => {
              const absoluteUrl = url.startsWith('http') ? url : `${getApiUrl()}${url}`
              const { schema } = view.state
              const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })
              const node = schema.nodes.image.create({ src: absoluteUrl })
              const transaction = view.state.tr.insert(coordinates?.pos ?? 0, node)
              view.dispatch(transaction)
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
                const absoluteUrl = url.startsWith('http') ? url : `${getApiUrl()}${url}`
                editor?.chain().focus().setImage({ src: absoluteUrl }).run()
              })
            }
            return true
          }
        }
        return false
      },
    },
  })

  // content prop が外から変わったとき（別エントリに切り替わったとき）
  useEffect(() => {
    if (!editor) return
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const parsed = parseInitialContent(content)
    editor.commands.setContent(parsed || '', false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.slice(0, 30)]) // content全体を比較すると無限ループするので先頭だけ

  if (!editor) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* ── ツールバー ── */}
      <div className="editor-toolbar">
        <ToolbarBtn
          label="H1" title="見出し1 (Ctrl+Alt+1)"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarBtn
          label="H2" title="見出し2 (Ctrl+Alt+2)"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarBtn
          label="H3" title="見出し3 (Ctrl+Alt+3)"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        />
        <div className="toolbar-divider" />
        <ToolbarBtn
          label="B" title="太字 (Ctrl+B)"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          style={{ fontWeight: 700 }}
        />
        <ToolbarBtn
          label="I" title="斜体 (Ctrl+I)"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          style={{ fontStyle: 'italic' }}
        />
        <ToolbarBtn
          label="S" title="取り消し線 (Ctrl+Shift+S)"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          style={{ textDecoration: 'line-through' }}
        />
        <div className="toolbar-divider" />
        <ToolbarBtn
          label="≡" title="箇条書き"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          style={{ fontSize: 16 }}
        />
        <ToolbarBtn
          label="1." title="番号付きリスト"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarBtn
          label="✓" title="チェックリスト"
          active={editor.isActive('taskList')}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          style={{ fontSize: 14 }}
        />
        <div className="toolbar-divider" />
        <ToolbarBtn
          label="❝" title="引用"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          style={{ fontSize: 16 }}
        />
        <ToolbarBtn
          label="</>" title="コードブロック"
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          style={{ fontSize: 11 }}
        />
        <div className="toolbar-divider" />
        {/* 画像挿入ボタン */}
        <label className="toolbar-btn" title="画像を挿入" style={{ cursor: 'pointer' }}>
          🖼
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              const { url } = await uploadImage(file)
              const absoluteUrl = url.startsWith('http') ? url : `${getApiUrl()}${url}`
              editor.chain().focus().setImage({ src: absoluteUrl }).run()
              e.target.value = ''
            }}
          />
        </label>
        <div className="toolbar-divider" />
        <ToolbarBtn
          label="↩" title="元に戻す (Ctrl+Z)"
          onClick={() => editor.chain().focus().undo().run()}
          style={{ fontSize: 16 }}
        />
        <ToolbarBtn
          label="↪" title="やり直す (Ctrl+Y)"
          onClick={() => editor.chain().focus().redo().run()}
          style={{ fontSize: 16 }}
        />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>
          Tab: インデント　Shift+Tab: 戻す　Ctrl+K: コマンド
        </span>
      </div>

      {/* ── エディタ本体 ── */}
      <div className="tiptap-editor">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

// ── ツールバーボタン ────────────────────────────────────
interface BtnProps {
  label: string
  title?: string
  active?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}
function ToolbarBtn({ label, title, active, onClick, style }: BtnProps) {
  return (
    <button
      className={`toolbar-btn${active ? ' is-active' : ''}`}
      title={title}
      onClick={onClick}
      type="button"
      style={style}
    >
      {label}
    </button>
  )
}
