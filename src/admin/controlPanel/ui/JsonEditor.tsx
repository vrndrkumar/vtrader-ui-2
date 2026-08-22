import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from 'react-simple-code-editor'
import { highlight, languages } from 'prismjs'
import 'prismjs/components/prism-json'
import { clsx } from 'clsx'

// ── Generic JSON editor ──────────────────────────────────────────────────────
// Syntax-highlighted, live-validated, with Format / Minify / Copy. Never mutates
// the user's text silently — formatting is an explicit action. Reports validity
// upward so the parent can gate saving.

export interface JsonValidity { valid: boolean; error: string | null; line?: number; col?: number }

function validate(text: string): JsonValidity {
  const t = text.trim()
  if (!t) return { valid: false, error: 'JSON is empty.' }
  try {
    JSON.parse(t)
    return { valid: true, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid JSON'
    const posMatch = /position (\d+)/.exec(msg)
    if (posMatch) {
      const pos = Number(posMatch[1])
      const before = text.slice(0, pos)
      const line = before.split('\n').length
      const col = pos - before.lastIndexOf('\n')
      return { valid: false, error: msg.replace(/ in JSON at position \d+/, ''), line, col }
    }
    return { valid: false, error: msg }
  }
}

interface Props {
  value: string
  onChange: (text: string) => void
  onValidityChange?: (v: JsonValidity) => void
  minHeight?: number
  readOnly?: boolean
}

export function JsonEditor({ value, onChange, onValidityChange, minHeight = 320, readOnly }: Props) {
  const validity = useMemo(() => validate(value), [value])
  const [copied, setCopied] = useState(false)
  const lastReported = useRef<string>('')

  useEffect(() => {
    const sig = `${validity.valid}:${validity.error ?? ''}`
    if (sig !== lastReported.current) { lastReported.current = sig; onValidityChange?.(validity) }
  }, [validity, onValidityChange])

  const format = () => { try { onChange(JSON.stringify(JSON.parse(value), null, 2)) } catch { /* invalid — leave as-is */ } }
  const minify = () => { try { onChange(JSON.stringify(JSON.parse(value))) } catch { /* invalid */ } }
  const copy = async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch { /* ignore */ } }

  const lineCount = value.split('\n').length

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-[#0d1424] flex flex-col">
      {/* token colours (scoped) */}
      <style>{`
        .vt-json .token.property{color:#7dd3fc}
        .vt-json .token.string{color:#86efac}
        .vt-json .token.number{color:#93c5fd}
        .vt-json .token.boolean{color:#c4b5fd}
        .vt-json .token.null{color:#94a3b8;font-style:italic}
        .vt-json .token.punctuation{color:#64748b}
        .vt-json textarea:focus{outline:none}
      `}</style>

      {/* toolbar */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-white/10 bg-[#111a2e]">
        <span className="text-[11px] font-mono text-slate-400">config_data.json</span>
        <span className="text-[10px] text-slate-500 tabular-nums">· {lineCount} lines · {new Blob([value]).size} B</span>
        <div className="ml-auto flex items-center gap-1">
          {!readOnly && <ToolBtn onClick={format} disabled={!validity.valid} title="Pretty-print (2-space)">Format</ToolBtn>}
          {!readOnly && <ToolBtn onClick={minify} disabled={!validity.valid} title="Minify">Minify</ToolBtn>}
          <ToolBtn onClick={copy} title="Copy JSON">{copied ? 'Copied' : 'Copy'}</ToolBtn>
        </div>
      </div>

      {/* editor */}
      <div className="vt-json overflow-auto" style={{ maxHeight: minHeight + 120 }}>
        <Editor
          value={value}
          onValueChange={readOnly ? () => { /* locked */ } : onChange}
          highlight={(code) => highlight(code, languages.json, 'json')}
          padding={14}
          readOnly={readOnly}
          textareaClassName="focus:outline-none"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.6, minHeight, color: '#e2e8f0' }}
        />
      </div>

      {/* validity footer */}
      <div className={clsx('flex items-center gap-2 px-3 h-9 border-t text-[11px] font-medium',
        validity.valid ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400' : 'border-red-500/20 bg-red-500/[0.07] text-red-400')}>
        {validity.valid ? (
          <><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>Valid JSON</>
        ) : (
          <><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
          {validity.error}{validity.line ? ` (line ${validity.line}, col ${validity.col})` : ''}</>
        )}
      </div>
    </div>
  )
}

function ToolBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="h-6 px-2 rounded-md text-[11px] font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
      {children}
    </button>
  )
}

export { validate as validateJson }
