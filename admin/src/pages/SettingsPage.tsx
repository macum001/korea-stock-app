// jp: 어드민 설정 / 프롬프트 - AI 프롬프트 편집 + 기본값 복원

import { useState, useEffect, useCallback } from 'react';
import { Save, RotateCcw, Check, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { promptApi, PromptItem } from '@/lib/promptApi';

export function SettingsPage() {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPrompts(await promptApi.list()); }
    catch { setPrompts([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>설정 / 프롬프트</h1>
        <p style={{ fontSize: 13, color: 'var(--admin-text-sec)', margin: '6px 0 0' }}>
          AI가 공시를 분석할 때 사용하는 프롬프트예요. 수정하면 다음 분석부터 적용됩니다.
        </p>
      </div>

      {/* jp: 주의 안내 */}
      <div style={{ display: 'flex', gap: 10, padding: 14, background: '#f59e0b18', border: '1px solid #f59e0b40', borderRadius: 12, marginBottom: 20 }}>
        <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6, color: 'var(--admin-text-sec)' }}>
          프롬프트는 AI 분석 품질에 직접 영향을 줘요. 잘못 수정하면 분석이 이상해질 수 있어요.
          언제든 <strong style={{ color: 'var(--admin-text)' }}>기본값으로 되돌리기</strong>로 원래대로 복원할 수 있어요.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={24} className="spin" style={{ color: 'var(--admin-accent)' }} />
          <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : prompts.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--admin-text-ter)', textAlign: 'center', padding: 40 }}>프롬프트를 불러오지 못했어요.</p>
      ) : (
        prompts.map((p) => <PromptCard key={p.key} prompt={p} onSaved={load} />)
      )}
    </div>
  );
}

function PromptCard({ prompt, onSaved }: { prompt: PromptItem; onSaved: () => void }) {
  const [content, setContent] = useState(prompt.content);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // jp: prompt가 새로 로드되면 content 동기화
  useEffect(() => { setContent(prompt.content); }, [prompt.content]);

  const dirty = content !== prompt.content;

  const handleSave = async () => {
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      await promptApi.save(prompt.key, content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch { /* noop */ }
    finally { setBusy(false); }
  };

  const handleReset = async () => {
    if (!window.confirm('이 프롬프트를 기본값으로 되돌릴까요? 수정한 내용은 사라져요.')) return;
    setBusy(true);
    try {
      const res = await promptApi.reset(prompt.key);
      setContent(res.content);
      onSaved();
    } catch { /* noop */ }
    finally { setBusy(false); }
  };

  return (
    <div style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={17} style={{ color: 'var(--admin-accent)' }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{prompt.name}</h2>
          {prompt.isCustom ? (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'var(--admin-accent)', color: '#fff' }}>수정됨</span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'var(--admin-elevated)', color: 'var(--admin-text-ter)' }}>기본값</span>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--admin-text-ter)', margin: '0 0 14px', lineHeight: 1.6 }}>{prompt.description}</p>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%', minHeight: 280, padding: 14, borderRadius: 10,
          border: `1px solid ${dirty ? 'var(--admin-accent)' : 'var(--admin-border)'}`,
          background: 'var(--admin-elevated)', color: 'var(--admin-text)',
          fontSize: 13, lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--admin-text-ter)' }}>
          {prompt.updatedAt
            ? `마지막 수정: ${new Date(prompt.updatedAt).toLocaleString('ko-KR')}${prompt.updatedBy ? ` · ${prompt.updatedBy}` : ''}`
            : '아직 수정한 적 없어요 (코드 기본값 사용 중)'}
          {' · '}{content.length.toLocaleString()}자
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleReset} disabled={busy}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text-sec)', fontSize: 13, cursor: busy ? 'default' : 'pointer' }}>
            <RotateCcw size={14} /> 기본값으로
          </button>
          <button onClick={handleSave} disabled={busy || !dirty || !content.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none', background: saved ? 'var(--admin-success)' : 'var(--admin-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: (busy || !dirty) ? 'default' : 'pointer', opacity: (!dirty || !content.trim()) && !saved ? 0.5 : 1 }}>
            {busy ? <Loader2 size={14} className="spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? '저장됨' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
