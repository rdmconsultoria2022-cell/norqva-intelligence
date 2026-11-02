import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clapperboard, Download, RefreshCw } from 'lucide-react';
import { Section, Surface, StatusPill, Tone } from '../../components/ui/premium';

// NORQVA-0160 (etapa B): vídeo com apresentadora fictícia, feito pela Fábrica de vídeo (motor separado).
// Some sozinho quando a função está desligada (VIDEO_FACTORY_ENABLED). Gasto (aprovar, gerar cena de novo) só ADMIN.

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

const input = 'w-full bg-nq-bg border border-nq-line rounded p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text min-h-[44px]';
const label = 'block text-nq-aux text-nq-muted mb-1';
const pill = 'px-4 rounded-full text-nq-aux font-semibold min-h-[44px] disabled:opacity-50';
const primary = `${pill} bg-nq-positive text-nq-on-positive hover:brightness-110`;
const quiet = `${pill} bg-nq-raised text-nq-text`;

export const STATUS_LABEL: Record<string, { text: string; tone: Tone }> = {
  roteiro: { text: 'Roteiro (nada gasto ainda)', tone: 'attention' },
  gerando: { text: 'Gerando as cenas', tone: 'neutral' },
  revisao: { text: 'Cenas prontas para revisar', tone: 'attention' },
  montando: { text: 'Montando o vídeo', tone: 'neutral' },
  pronto: { text: 'Vídeo pronto', tone: 'positive' },
  erro: { text: 'Erro na geração', tone: 'critical' }
};

const WORKING = ['gerando', 'montando'];
const usd = (n: unknown) => `US$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
const disabledMsg = (e: any) => /não está ligado/i.test(String(e?.message || ''));

export const VideoPresenterPanel: React.FC<{
  apiFetch: ApiFetch;
  pageId: string;
  productId: string | null | undefined;
  offerId: string | null | undefined;
  isAdmin: boolean;
  canEdit: boolean;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  pollMs?: number;
  /** Anúncios da página (para escolher onde o vídeo entra). */
  ads?: any[];
  /** Chamado depois de colocar o vídeo num anúncio (a tela recarrega os anúncios). */
  onAdChanged?: () => void;
}> = ({ apiFetch, pageId, productId, offerId, isAdmin, canEdit, showError, showSuccess, pollMs = 10000, ads = [], onAdChanged }) => {
  const [hidden, setHidden] = useState(false);
  const [catalog, setCatalog] = useState<any>(null);
  const [list, setList] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [personaId, setPersonaId] = useState<number | null>(null);
  const [duration, setDuration] = useState(30);
  const [tone, setTone] = useState('');
  const [lines, setLines] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmSpend, setConfirmSpend] = useState(false);
  const [format, setFormat] = useState('9:16');
  const [newLine, setNewLine] = useState<Record<number, string>>({});
  const [adPick, setAdPick] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingFirst, setLoadingFirst] = useState(false);
  const [reload, setReload] = useState(0);
  const [tick, setTick] = useState(0);
  const timer = useRef<any>(null);
  // o App recria apiFetch/showError a cada render: guardar num ref evita recarregar (e perder falas não salvas)
  const fetchRef = useRef(apiFetch);
  fetchRef.current = apiFetch;
  const currentId = useRef<string | null>(null);

  const post = (url: string, body: any = {}) => apiFetch(url, { method: 'POST', body: JSON.stringify(body) });

  const show = useCallback((v: any) => {
    currentId.current = v?.id || null;
    setCurrent(v);
    setConfirmSpend(false);
    if (v?.id) setList(prev => (prev.some(p => p.id === v.id) ? prev.map(p => (p.id === v.id ? { ...p, ...v } : p)) : [v, ...prev]));
    const l: Record<number, string> = {};
    for (const c of v?.motor?.cenas || []) l[c.id] = c.fala || '';
    setLines(l);
  }, []);

  useEffect(() => {
    let alive = true;
    setHidden(false);
    setLoadError(null);
    setCatalog(null);
    setList([]);
    currentId.current = null;
    setCurrent(null);
    (async () => {
      try {
        const api = fetchRef.current;
        const [cat, ls] = await Promise.all([
          api('/video-factory/catalog'),
          api(`/video-factory/productions?generated_page_id=${encodeURIComponent(pageId)}`)
        ]);
        if (!alive) return;
        setCatalog(cat);
        setList(Array.isArray(ls) ? ls : []);
        if (cat?.personas?.[0]) setPersonaId(cat.personas[0].id);
        if (Array.isArray(ls) && ls[0]) {
          setLoadingFirst(true);
          try {
            const v = await api(`/video-factory/productions/${ls[0].id}`);
            if (alive) show(v);
          } finally {
            if (alive) setLoadingFirst(false);
          }
        }
      } catch (e: any) {
        if (!alive) return;
        // desligado: o painel não aparece. Fora do ar: aviso com "Tentar de novo" (nunca some sem explicar)
        if (disabledMsg(e)) setHidden(true);
        else setLoadError(String(e?.message || 'A Fábrica de vídeo não respondeu.'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [pageId, show, reload]);

  // enquanto gera ou monta, atualiza sozinho
  useEffect(() => {
    clearTimeout(timer.current);
    let alive = true;
    if (current && WORKING.includes(current.status)) {
      const id = current.id;
      timer.current = setTimeout(async () => {
        try {
          const v = await fetchRef.current(`/video-factory/productions/${id}`);
          // resposta atrasada de outro vídeo não troca a tela
          if (alive && currentId.current === id) show(v);
        } catch {
          if (alive) setTick(t => t + 1); // falhou: tenta de novo na próxima volta
        }
      }, pollMs);
    }
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [current, show, pollMs, tick]);

  if (hidden) return null;
  if (loadError) {
    return (
      <Section title={<span className="inline-flex items-center gap-2"><Clapperboard className="h-4 w-4" /> Vídeo com apresentadora</span>} testId="video-presenter">
        <Surface className="space-y-3 p-4" >
          <p className="text-nq-aux text-nq-text" data-testid="video-unavailable">Vídeo indisponível no momento: {loadError}</p>
          <button type="button" className={quiet} onClick={() => setReload(n => n + 1)} data-testid="video-retry">
            <RefreshCw className="h-4 w-4 inline" /> Tentar de novo
          </button>
        </Surface>
      </Section>
    );
  }
  if (!catalog) {
    return (
      <Section title={<span className="inline-flex items-center gap-2"><Clapperboard className="h-4 w-4" /> Vídeo com apresentadora</span>} testId="video-presenter">
        <Surface className="p-4"><p className="text-nq-aux text-nq-muted">Carregando…</p></Surface>
      </Section>
    );
  }

  const run = async (fn: () => Promise<any>, ok?: string) => {
    setBusy(true);
    try {
      const v = await fn();
      show(v);
      if (ok) showSuccess(ok);
    } catch (e: any) {
      showError(e?.message || 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  };

  const template = catalog.templates?.[0];
  const durations: number[] = (template?.durations || []).map((d: any) => d.seconds);
  const left = Math.max(0, Number(catalog.budget?.monthly_usd || 0) - Number(catalog.budget?.spent_month_usd || 0));
  const m = current?.motor;
  const status = STATUS_LABEL[current?.status] || { text: current?.status || '', tone: 'neutral' as Tone };
  const editable = canEdit && current?.status === 'roteiro';
  const changed = editable && (m?.cenas || []).some((c: any) => (lines[c.id] ?? '') !== (c.fala || ''));
  const alerts: any[] = m?.alertas || [];
  const priceIssues: any[] = current?.price_issues || [];
  const allReady = (m?.cenas || []).length > 0 && (m.cenas as any[]).every(c => c.tentativa_em_uso);

  const createForm = (
    <div className="space-y-3" data-testid="video-create">
      <p className="text-nq-aux text-nq-muted">
        Uma personagem fictícia da marca apresenta o produto em vídeo vertical. Primeiro sai o roteiro (sem custo); os clipes só são gerados depois que o administrador aprova o gasto.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(catalog.personas || []).map((p: any) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPersonaId(p.id)}
            data-testid={`video-persona-${p.id}`}
            aria-pressed={personaId === p.id}
            className={`rounded-lg p-2 text-left border ${personaId === p.id ? 'border-nq-positive' : 'border-nq-line'}`}
          >
            {p.image && <img src={p.image} alt={`Personagem ${p.name}`} className="w-full aspect-[3/4] object-cover rounded" />}
            <span className="block mt-1 text-nq-text text-nq-aux font-semibold">{p.name}</span>
            <span className="block text-nq-muted text-nq-aux">Personagem fictícia</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="video-duration">Duração</label>
          <select id="video-duration" className={input} value={duration} onChange={e => setDuration(Number(e.target.value))}>
            {(durations.length ? durations : [15, 30, 45, 60]).map(d => (
              <option key={d} value={d}>{d} segundos</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="video-tone">Tom (opcional)</label>
          <input id="video-tone" className={input} value={tone} maxLength={120} placeholder="ex.: acolhedor, animado" onChange={e => setTone(e.target.value)} />
        </div>
      </div>
      <button
        type="button"
        className={primary}
        disabled={busy || !personaId || !productId || !offerId || !canEdit}
        data-testid="video-create-btn"
        onClick={() =>
          run(
            () => post('/video-factory/productions', { product_id: productId, offer_id: offerId, generated_page_id: pageId, persona_id: personaId, duration_s: duration, template_id: template?.id, tone }),
            'Roteiro criado. Confira as falas.'
          )
        }
      >
        {busy ? 'Escrevendo o roteiro…' : 'Criar roteiro'}
      </button>
    </div>
  );

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          <Clapperboard className="h-4 w-4" /> Vídeo com apresentadora
        </span>
      }
      testId="video-presenter"
    >
      <Surface className="space-y-4 p-4">
        <p className="text-nq-aux text-nq-muted" data-testid="video-budget">
          Orçamento de vídeo do mês: {usd(catalog.budget?.spent_month_usd)} usados de {usd(catalog.budget?.monthly_usd)} (restam {usd(left)}).
        </p>

        {list.length > 0 && (current === null || list.length > 1) && (
          <div>
            <label className={label} htmlFor="video-pick">Vídeos desta página</label>
            <select
              id="video-pick"
              className={input}
              value={current?.id || 'new'}
              onChange={e => {
                if (e.target.value === 'new') {
                  currentId.current = null;
                  setCurrent(null);
                  setConfirmSpend(false);
                  return;
                }
                const id = e.target.value;
                currentId.current = id;
                run(() => apiFetch(`/video-factory/productions/${id}`));
              }}
            >
              {list.map(v => (
                <option key={v.id} value={v.id}>{`${v.duration_s}s · ${new Date(v.created_at).toLocaleDateString('pt-BR')} · ${STATUS_LABEL[v.status]?.text || v.status}`}</option>
              ))}
              <option value="new">Novo vídeo…</option>
            </select>
          </div>
        )}

        {!current && loadingFirst && <p className="text-nq-aux text-nq-muted" data-testid="video-loading">Carregando o vídeo…</p>}
        {!current && !loadingFirst && createForm}

        {current && m && (
          <div className="space-y-4" data-testid="video-production">
            <div className="flex flex-wrap items-center gap-3">
              <span aria-live="polite"><StatusPill tone={status.tone} testId="video-status">{status.text}</StatusPill></span>
              <span className="text-nq-aux text-nq-muted">Custo estimado: {usd(current.estimated_cost_usd ?? m.custo_estimado_usd)}</span>
              {WORKING.includes(current.status) && <span className="text-nq-aux text-nq-muted">Atualiza sozinho a cada poucos segundos.</span>}
              <button type="button" className={quiet} onClick={() => { currentId.current = null; setCurrent(null); setConfirmSpend(false); }} disabled={busy}>
                Novo vídeo
              </button>
            </div>

            {(alerts.length > 0 || priceIssues.length > 0) && (
              <div className="rounded border border-nq-critical/40 p-3 text-nq-aux" data-testid="video-alerts">
                <p className="font-semibold text-nq-critical-text">Corrija antes de aprovar:</p>
                <ul className="list-disc pl-5">
                  {priceIssues.map((p: any) => (
                    <li key={`p${p.scene_id}`}>Cena {p.order}: anúncio não fala preço ("{p.match}").</li>
                  ))}
                  {alerts.map((a: any, i: number) => (
                    <li key={`a${i}`}>{a.titulo}{a.trecho ? `: "${a.trecho}"` : ''}{a.sugestao ? ` — ${a.sugestao}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}

            <ol className="space-y-3">
              {(m.cenas || []).map((c: any) => (
                <li key={c.id} className="rounded border border-nq-line p-3 space-y-2" data-testid={`video-scene-${c.ordem}`}>
                  <p className="text-nq-aux text-nq-muted">Cena {c.ordem} · {c.enquadramento} · {c.acao}</p>
                  {editable ? (
                    <textarea
                      className={input}
                      rows={2}
                      aria-label={`Fala da cena ${c.ordem}`}
                      value={lines[c.id] ?? ''}
                      maxLength={400}
                      onChange={e => setLines(l => ({ ...l, [c.id]: e.target.value }))}
                    />
                  ) : (
                    <p className="text-nq-text">"{c.fala}"</p>
                  )}
                  {(c.tentativas || []).length > 0 && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {c.tentativas.map((t: any) => (
                        <div key={t.id} className={`rounded p-1 border ${c.tentativa_em_uso === t.id ? 'border-nq-positive' : 'border-nq-line'}`}>
                          {t.status === 'pronta' && t.video ? (
                            <video src={t.video} controls playsInline preload="metadata" className="w-full aspect-[9/16] bg-black rounded" />
                          ) : (
                            <p className="text-nq-aux text-nq-muted p-2">{t.status === 'falhou' ? 'Falhou' : 'Gerando…'}</p>
                          )}
                          {t.status === 'pronta' && (
                            <>
                              {t.fidelidade_fala != null && (
                                <p className="text-nq-aux text-nq-muted">Fala {Math.round(Number(t.fidelidade_fala) * 100)}% fiel</p>
                              )}
                              {c.tentativa_em_uso === t.id ? (
                                <span className="inline-flex items-center gap-1 text-nq-aux text-nq-positive-text"><Check className="h-3 w-3" /> Em uso</span>
                              ) : (
                                canEdit && (
                                  <button type="button" className={quiet} disabled={busy}
                                    onClick={() => run(() => post(`/video-factory/productions/${current.id}/scenes/${c.id}/choose`, { take_id: t.id }))}>
                                    Usar esta
                                  </button>
                                )
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {isAdmin && current.status !== 'roteiro' && !WORKING.includes(current.status) && (
                    <div className="flex flex-wrap gap-2 items-end">
                      <input className={`${input} flex-1`} placeholder="Nova fala (opcional)" aria-label={`Nova fala da cena ${c.ordem}`} maxLength={400}
                        value={newLine[c.id] || ''} onChange={e => setNewLine(n => ({ ...n, [c.id]: e.target.value }))} />
                      <button type="button" className={quiet} disabled={busy} data-testid={`video-regen-${c.ordem}`}
                        onClick={() => run(() => post(`/video-factory/productions/${current.id}/scenes/${c.id}/regenerate`, { new_line: newLine[c.id] || null }), 'Cena enviada para gerar de novo.')}>
                        <RefreshCw className="h-4 w-4 inline" /> Gerar de novo (gasta)
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>

            {editable && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={quiet} disabled={busy || !changed} data-testid="video-save-script"
                  onClick={() => run(() => apiFetch(`/video-factory/productions/${current.id}/script`, {
                    method: 'PUT',
                    body: JSON.stringify({ scenes: (m.cenas || []).map((c: any) => ({ id: c.id, line: lines[c.id] ?? '' })) })
                  }), 'Roteiro salvo.')}>
                  Salvar falas
                </button>
              </div>
            )}

            {current.status === 'roteiro' && (
              isAdmin ? (
                <div className="space-y-2" data-testid="video-approve">
                  {!confirmSpend ? (
                    <button type="button" className={primary} disabled={busy || changed || alerts.length > 0 || priceIssues.length > 0}
                      data-testid="video-approve-btn" onClick={() => setConfirmSpend(true)}>
                      Aprovar gasto e gerar ({usd(current.estimated_cost_usd ?? m.custo_estimado_usd)})
                    </button>
                  ) : (
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-nq-aux text-nq-text">
                        {m.precisa_aprovacao_extra
                          ? `Este vídeo passa do limite de gasto sem aprovação extra. Confirma mesmo assim o gasto de cerca de ${usd(current.estimated_cost_usd ?? m.custo_estimado_usd)}?`
                          : `Confirma o gasto de cerca de ${usd(current.estimated_cost_usd ?? m.custo_estimado_usd)} na geração dos clipes?`}
                      </span>
                      <button type="button" className={primary} disabled={busy} data-testid="video-approve-confirm"
                        onClick={async () => {
                          await run(() => post(`/video-factory/productions/${current.id}/approve`, { extra: Boolean(m.precisa_aprovacao_extra) }), 'Gasto aprovado. As cenas estão sendo geradas.');
                          setConfirmSpend(false);
                        }}>
                        Sim, gerar
                      </button>
                      <button type="button" className={quiet} disabled={busy} onClick={() => setConfirmSpend(false)}>Cancelar</button>
                    </div>
                  )}
                  {changed && <p className="text-nq-aux text-nq-muted">Salve as falas antes de aprovar.</p>}
                </div>
              ) : (
                <p className="text-nq-aux text-nq-muted">O administrador aprova o gasto para gerar as cenas.</p>
              )
            )}

            {['revisao', 'pronto', 'erro'].includes(current.status) && canEdit && (
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className={label} htmlFor="video-format">Formato</label>
                  <select id="video-format" className={input} value={format} onChange={e => setFormat(e.target.value)}>
                    <option value="9:16">9:16 (Reels e Stories)</option>
                    <option value="4:5">4:5 (Feed)</option>
                    <option value="1:1">1:1 (quadrado)</option>
                  </select>
                </div>
                <button type="button" className={primary} disabled={busy || !allReady} data-testid="video-assemble"
                  onClick={() => run(() => post(`/video-factory/productions/${current.id}/assemble`, { format }), 'Montando o vídeo com legendas.')}>
                  Montar vídeo
                </button>
                {!allReady && <span className="text-nq-aux text-nq-muted">Escolha uma tomada em cada cena.</span>}
              </div>
            )}

            {m.video_final && (
              <div className="space-y-2" data-testid="video-final">
                <video src={m.video_final} controls playsInline className="w-full max-w-xs aspect-[9/16] bg-black rounded" />
                <a href={m.video_final} target="_blank" rel="noreferrer" className={`${quiet} inline-flex items-center gap-1.5`}>
                  <Download className="h-4 w-4" /> Baixar vídeo
                </a>
                <p className="text-nq-aux text-nq-muted">O link de download vale por 24 horas; abra esta tela de novo para gerar outro.</p>
              </div>
            )}

            {current.status === 'pronto' && m.video_final && canEdit && (
              <div className="space-y-2 rounded border border-nq-line p-3" data-testid="video-use-in-ad">
                <p className="text-nq-aux font-semibold text-nq-text">Usar este vídeo num anúncio da campanha</p>
                {current.creative_id && ads.some((a: any) => a.id === current.creative_id) ? (
                  <p className="text-nq-aux text-nq-positive-text" data-testid="video-in-ad">
                    Este vídeo está no anúncio {ads.find((a: any) => a.id === current.creative_id)?.human_id}. Aprove-o aqui em cima ou no passo 5; a campanha leva o vídeo como anúncio de vídeo, sempre pausada.
                  </p>
                ) : null}
                {ads.length === 0 ? (
                  <p className="text-nq-aux text-nq-muted">Esta página ainda não tem anúncios.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <label className={label} htmlFor="video-ad-pick">Anúncio (o texto continua o mesmo; vira uma versão nova para aprovar)</label>
                      <select id="video-ad-pick" className={input} value={adPick} onChange={e => setAdPick(e.target.value)}>
                        <option value="">Escolha o anúncio…</option>
                        {ads.map((a: any) => (
                          <option key={a.id} value={a.id}>{`${a.human_id} · ${String(a.headline || a.hook || '').slice(0, 60)}${a.format === 'VIDEO' ? ' (já é vídeo)' : ''}`}</option>
                        ))}
                      </select>
                    </div>
                    <button type="button" className={primary} disabled={busy || !adPick} data-testid="video-use-in-ad-btn"
                      onClick={async () => {
                        await run(() => post(`/video-factory/productions/${current.id}/use-in-ad`, { creative_id: adPick }), 'Vídeo colocado no anúncio. Aprove a versão nova para ir à campanha.');
                        setAdPick('');
                        onAdChanged?.();
                      }}>
                      Colocar no anúncio
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Surface>
    </Section>
  );
};
