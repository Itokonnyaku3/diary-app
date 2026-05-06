import { useState } from 'react'
import type { Settings } from '../types'

interface Props {
  settings: Settings
  onSave: (s: Settings) => void
  onClose: () => void
}

const PLACEHOLDER_PRIVATE = `例：
あなたは私の個人日記アシスタントです。
感情に寄り添いながら、気づきを与えてください。`

const PLACEHOLDER_WORK = `例：
あなたは仕事の振り返りをサポートするアシスタントです。
課題と改善点を建設的に指摘してください。`

export default function SettingsModal({ settings, onSave, onClose }: Props) {
  const [form, setForm] = useState(settings)

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, width: 520, maxWidth: '92vw',
        maxHeight: '85vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>⚙ 設定</h2>

        {/* API URL */}
        <Section title="API サーバー URL">
          <input
            value={form.apiUrl}
            onChange={e => update('apiUrl', e.target.value)}
            placeholder="https://xxxxx.localtonet.com"
            style={inputStyle}
          />
          <Hint>自宅外から使う場合は Localtonet の URL、自宅内は http://localhost:8000</Hint>
        </Section>

        {/* 自動コメント */}
        <Section title="自動コメント">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <ToggleSwitch
              checked={form.autoCommentEnabled}
              onChange={v => update('autoCommentEnabled', v)}
            />
            <span style={{ fontSize: 13, color: form.autoCommentEnabled ? 'var(--text-1)' : 'var(--text-3)' }}>
              {form.autoCommentEnabled ? '有効 — 入力が止まると自動でエージェントがコメント' : '無効'}
            </span>
          </label>

          {form.autoCommentEnabled && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
                自動コメントまでの待機時間：<strong style={{ color: 'var(--text-1)' }}>{form.autoCommentDelay}秒</strong>
              </div>
              <input
                type="range" min={5} max={60} step={5}
                value={form.autoCommentDelay}
                onChange={e => update('autoCommentDelay', Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)' }}>
                <span>5秒（すぐ）</span><span>60秒（ゆっくり）</span>
              </div>
            </div>
          )}
        </Section>

        {/* プライベートプロンプト */}
        <Section title="🔒 プライベートモード システムプロンプト">
          <textarea
            value={form.privateSystemPrompt}
            onChange={e => update('privateSystemPrompt', e.target.value)}
            rows={4}
            placeholder={PLACEHOLDER_PRIVATE}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          <Hint>空白の場合はデフォルトプロンプトを使用します</Hint>
        </Section>

        {/* 仕事プロンプト */}
        <Section title="💼 仕事モード システムプロンプト">
          <textarea
            value={form.workSystemPrompt}
            onChange={e => update('workSystemPrompt', e.target.value)}
            rows={4}
            placeholder={PLACEHOLDER_WORK}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          <Hint>空白の場合はデフォルトプロンプトを使用します</Hint>
        </Section>

        {/* ボタン */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 6, fontSize: 13,
            background: 'var(--bg-3)', color: 'var(--text-2)',
            border: '1px solid var(--border)', cursor: 'pointer',
          }}>キャンセル</button>
          <button onClick={() => { onSave(form); onClose() }} style={{
            padding: '8px 20px', borderRadius: 6, fontSize: 13,
            background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer',
          }}>保存</button>
        </div>
      </div>
    </div>
  )
}

// ── 小コンポーネント ────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8, letterSpacing: '0.03em' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>{children}</div>
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
        background: checked ? 'var(--accent)' : 'var(--bg-hover)',
        position: 'relative', transition: 'background .2s',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: checked ? 18 : 3,
        width: 14, height: 14, borderRadius: '50%', background: '#fff',
        transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13,
  background: 'var(--bg-3)', border: '1px solid var(--border)',
  color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit',
}
