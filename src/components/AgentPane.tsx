import { useState, useRef, useEffect, useCallback } from 'react'
import type { ChatMessage, Mode, Tag } from '../types'
import { streamChat, createTag, updateEntry } from '../api'

// ── タグ提案パターン: "タグ提案: #名前" or "タグ提案：#名前"
const TAG_REGEX = /タグ提案[：:]\s*#([\w぀-鿿゠-ヿ＀-￯a-zA-Z0-9_-]+)/g

function extractTagSuggestions(text: string): string[] {
  const names: string[] = []
  let m
  const re = new RegExp(TAG_REGEX.source, 'g')
  while ((m = re.exec(text)) !== null) names.push(m[1])
  return names
}

// ローカル用メッセージ型（API には role/content だけ送る）
interface LocalMessage extends ChatMessage {
  isAuto?: boolean
  tagSuggestions?: string[]
  acceptedTags?: Set<string>
  rejectedTags?: Set<string>
}

interface Props {
  currentEntryText: string
  currentEntryId: number | null
  mode: Mode
  systemPrompt?: string
  tags: Tag[]
  autoCommentEnabled: boolean
  autoCommentDelay: number       // 秒
  onTagAccept: (tagName: string) => Promise<void>
}

const AUTO_PROMPT = '（今書いている日記を読んで、気づいたことや共感できる点を短くコメントしてください。タグ提案があれば「タグ提案: #名前」の形式で1つだけ添えてください。）'

export default function AgentPane({
  currentEntryText, currentEntryId, mode, systemPrompt,
  tags, autoCommentEnabled, autoCommentDelay, onTagAccept,
}: Props) {
  const [messages, setMessages]     = useState<LocalMessage[]>([])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const lastAutoText = useRef('')   // 直前に自動コメントしたテキスト
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  // 末尾へスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // loading の最新値を ref で保持（タイマー依存配列に入れずに済む）
  const loadingRef = useRef(loading)
  useEffect(() => { loadingRef.current = loading }, [loading])

  // sendMessage の最新版を ref で保持（stale closure 防止）
  const sendMessageRef = useRef(sendMessage)
  useEffect(() => { sendMessageRef.current = sendMessage }, [sendMessage])

  // ── 自動コメントタイマー ─────────────────────────────
  useEffect(() => {
    if (!autoCommentEnabled) return
    if (currentEntryText.length < 80) return           // 短すぎるときは無視
    if (currentEntryText === lastAutoText.current) return // 内容が変わっていない

    // 前のタイマーをクリア
    if (timerRef.current) clearTimeout(timerRef.current)
    if (countRef.current) clearInterval(countRef.current)
    setAutoCountdown(autoCommentDelay)

    // カウントダウン表示（関数型更新で常に最新値から -1 する）
    countRef.current = setInterval(() => {
      setAutoCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (countRef.current) clearInterval(countRef.current)
          return null
        }
        return prev - 1
      })
    }, 1000)

    // 本体タイマー（loading は ref で確認 → loading が依存配列に不要）
    timerRef.current = setTimeout(() => {
      setAutoCountdown(null)
      if (countRef.current) clearInterval(countRef.current)
      if (loadingRef.current) return   // 応答中なら今回はスキップ
      lastAutoText.current = currentEntryText
      sendMessageRef.current(AUTO_PROMPT, true)
    }, autoCommentDelay * 1000)

    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      if (countRef.current) { clearInterval(countRef.current); countRef.current = null }
      setAutoCountdown(null)
    }
  // loading を外すことで「エージェント応答中」にカウントがリセットされなくなる
  }, [currentEntryText, autoCommentEnabled, autoCommentDelay])

  // ── メッセージ送信 ───────────────────────────────────
  const sendMessage = useCallback(async (text: string, isAuto = false) => {
    if (!text.trim() || loading) return

    const userMsg: LocalMessage = { role: 'user', content: text, isAuto }
    setMessages(prev => [...prev, userMsg])
    if (!isAuto) setInput('')
    setLoading(true)

    const assistantMsg: LocalMessage = { role: 'assistant', content: '', tagSuggestions: [], acceptedTags: new Set(), rejectedTags: new Set() }
    setMessages(prev => [...prev, assistantMsg])

    try {
      // API に送る history（isAuto フラグは除く）
      const history: ChatMessage[] = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      let fullText = ''

      for await (const token of streamChat(history, currentEntryText, mode, systemPrompt)) {
        fullText += token
        setMessages(prev => {
          const next = [...prev]
          const last = { ...next[next.length - 1] }
          last.content = fullText
          last.tagSuggestions = extractTagSuggestions(fullText)
          next[next.length - 1] = last
          return next
        })
      }
    } catch {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { ...next[next.length - 1], content: '⚠️ エラー: APIサーバーに接続できません。' }
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [loading, messages, currentEntryText, mode, systemPrompt])

  // ── タグ承認 ─────────────────────────────────────────
  async function handleAcceptTag(msgIdx: number, tagName: string) {
    await onTagAccept(tagName)
    setMessages(prev => {
      const next = [...prev]
      const msg = { ...next[msgIdx] }
      msg.acceptedTags = new Set([...(msg.acceptedTags ?? []), tagName])
      next[msgIdx] = msg
      return next
    })
  }

  function handleRejectTag(msgIdx: number, tagName: string) {
    setMessages(prev => {
      const next = [...prev]
      const msg = { ...next[msgIdx] }
      msg.rejectedTags = new Set([...(msg.rejectedTags ?? []), tagName])
      next[msgIdx] = msg
      return next
    })
  }

  // タイマーキャンセル
  function cancelAutoTimer() {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (countRef.current) clearInterval(countRef.current)
    setAutoCountdown(null)
    lastAutoText.current = currentEntryText  // 今の内容では再トリガーしない
  }

  return (
    <div style={{
      width: 'var(--agent-w)', minWidth: 240, maxWidth: 480, flexShrink: 0,
      background: 'var(--bg-2)', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* ── ヘッダー ── */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ fontSize: 16 }}>🤖</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>エージェント</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
            {mode === 'work' ? '💼 仕事' : '🔒 プライベート'}
            {autoCommentEnabled && <span style={{ marginLeft: 6, color: 'var(--success)' }}>● 自動ON</span>}
          </div>
        </div>
        {/* 今すぐコメントボタン */}
        <button
          onClick={() => { cancelAutoTimer(); sendMessage(AUTO_PROMPT, true) }}
          disabled={loading || currentEntryText.length < 20}
          title="今すぐコメントを求める"
          style={{
            fontSize: 11, padding: '4px 8px', borderRadius: 5,
            background: 'var(--bg-3)', border: '1px solid var(--border)',
            color: loading ? 'var(--text-3)' : 'var(--accent)',
            cursor: loading ? 'default' : 'pointer',
          }}
        >✨ 今すぐ</button>
        <button onClick={() => { setMessages([]); lastAutoText.current = '' }}
          title="会話をクリア" style={{ color: 'var(--text-3)', fontSize: 15 }}>🗑</button>
      </div>

      {/* ── 自動コメントカウントダウン ── */}
      {autoCountdown !== null && autoCountdown > 0 && (
        <div style={{
          padding: '6px 14px', background: 'rgba(99,102,241,0.08)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: 'var(--accent)' }}>
            🕐 {autoCountdown}秒後に自動コメント…
          </span>
          <button onClick={cancelAutoTimer}
            style={{ fontSize: 11, color: 'var(--text-3)', padding: '2px 6px' }}>キャンセル</button>
        </div>
      )}

      {/* ── メッセージ一覧 ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-2)', fontSize: 13, textAlign: 'center', marginTop: 16 }}>
            <p style={{ marginBottom: 10 }}>日記を書くと自動でコメントします。<br />話しかけることもできます。</p>
            {['今日のことを振り返って', '関連する過去の日記はある？', '何を書けばいい？'].map(hint => (
              <button key={hint} onClick={() => sendMessage(hint)} style={{
                display: 'block', width: '100%', margin: '4px 0',
                padding: '7px 12px', borderRadius: 6, fontSize: 12,
                background: 'var(--bg-3)', color: 'var(--text-2)',
                border: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer',
              }}>{hint}</button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          const isAutoMsg = isUser && msg.isAuto
          if (isAutoMsg) return null  // 自動送信メッセージはユーザー側に表示しない

          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '88%', padding: '8px 12px',
                  borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: isUser ? 'var(--accent)' : 'var(--bg-3)',
                  color: isUser ? '#fff' : 'var(--text-1)',
                  fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {msg.content || (loading && i === messages.length - 1
                    ? <span style={{ opacity: 0.4 }}>▌</span> : '')}
                </div>
              </div>

              {/* タグ提案チップ */}
              {!isUser && (msg.tagSuggestions?.length ?? 0) > 0 && (
                <div style={{ marginTop: 6, paddingLeft: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {msg.tagSuggestions!.map(tag => {
                    const accepted = msg.acceptedTags?.has(tag)
                    const rejected = msg.rejectedTags?.has(tag)
                    if (rejected) return null
                    return (
                      <div key={tag} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: accepted ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.12)',
                        border: `1px solid ${accepted ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}`,
                        borderRadius: 6, padding: '3px 8px', fontSize: 12,
                      }}>
                        <span style={{ color: accepted ? 'var(--success)' : 'var(--accent-2)' }}>#{tag}</span>
                        {!accepted && (
                          <>
                            <button onClick={() => handleAcceptTag(i, tag)}
                              title="タグを追加" style={{ color: 'var(--success)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                            <button onClick={() => handleRejectTag(i, tag)}
                              title="却下" style={{ color: 'var(--text-3)', fontSize: 14, cursor: 'pointer' }}>✕</button>
                          </>
                        )}
                        {accepted && <span style={{ color: 'var(--success)', fontSize: 11 }}>追加済み</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── 入力欄 ── */}
      <div style={{ padding: 10, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          display: 'flex', gap: 8, background: 'var(--bg-3)',
          border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px',
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
            }}
            placeholder="メッセージ… (Enter 送信 / Shift+Enter 改行)"
            rows={1}
            style={{
              flex: 1, resize: 'none', fontSize: 13, lineHeight: 1.5,
              color: 'var(--text-1)', background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{
              color: loading || !input.trim() ? 'var(--text-3)' : 'var(--accent)',
              fontSize: 18, alignSelf: 'flex-end', cursor: 'pointer',
            }}
          >↑</button>
        </div>
      </div>
    </div>
  )
}
