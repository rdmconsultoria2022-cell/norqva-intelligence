import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Eye } from 'lucide-react';

// NORQVA-0036: situação real do anúncio (rodando ou não), imagem da Meta com aviso de link vencido e a
// prévia oficial da Meta ("Ver como aparece") em Instagram feed, Instagram Stories e Facebook feed.

type ApiFetch = (url: string, options?: RequestInit) => Promise<any>;

export interface Delivery {
  key: 'RUNNING' | 'PAUSED' | 'REVIEW' | 'REJECTED' | 'ISSUES' | 'ARCHIVED' | 'UNKNOWN';
  label: string;
  reason: string | null;
  cls: string;
}

/**
 * O que o anúncio está fazendo de verdade. O effective_status do anúncio já reflete campanha/conjunto pausados
 * (CAMPAIGN_PAUSED/ADSET_PAUSED); conferimos também os status de campanha e conjunto por segurança.
 */
export function adDelivery(ad: { status?: string | null; effective_status?: string | null; adset_effective_status?: string | null; campaign_effective_status?: string | null }): Delivery {
  const eff = String(ad.effective_status || ad.status || '').toUpperCase();
  const set = String(ad.adset_effective_status || '').toUpperCase();
  const camp = String(ad.campaign_effective_status || '').toUpperCase();
  const paused = (reason: string): Delivery => ({ key: 'PAUSED', label: 'pausado', reason, cls: 'bg-slate-800 text-slate-300' });
  const parent = (st: string, who: 'campanha' | 'conjunto'): Delivery => {
    const quem = who === 'campanha' ? 'a campanha' : 'o conjunto';
    if (st === 'IN_PROCESS' || st === 'PENDING_REVIEW') return { key: 'REVIEW', label: 'em análise', reason: `${quem} está em análise`, cls: 'bg-amber-950 text-amber-300' };
    if (st === 'WITH_ISSUES') return { key: 'ISSUES', label: 'com problema', reason: `${quem} tem um problema: veja no Gerenciador`, cls: 'bg-red-950 text-red-300' };
    return paused(who === 'campanha' ? 'a campanha não está ativa' : 'o conjunto não está ativo');
  };
  if (eff === 'ACTIVE') {
    if (camp && camp !== 'ACTIVE') return parent(camp, 'campanha');
    if (set && set !== 'ACTIVE') return parent(set, 'conjunto');
    return { key: 'RUNNING', label: 'rodando', reason: null, cls: 'bg-emerald-950 text-emerald-300' };
  }
  if (eff === 'PAUSED') return paused('o anúncio está pausado');
  if (eff === 'CAMPAIGN_PAUSED') return paused('a campanha está pausada');
  if (eff === 'ADSET_PAUSED') return paused('o conjunto está pausado');
  if (eff === 'PENDING_REVIEW' || eff === 'IN_PROCESS' || eff === 'PREAPPROVED' || eff === 'PENDING_BILLING_INFO')
    return { key: 'REVIEW', label: 'em análise', reason: eff === 'PENDING_BILLING_INFO' ? 'pendência de pagamento na conta' : 'a Meta ainda está analisando', cls: 'bg-amber-950 text-amber-300' };
  if (eff === 'DISAPPROVED') return { key: 'REJECTED', label: 'recusado', reason: 'reprovado pela Meta: veja o motivo no Gerenciador', cls: 'bg-red-950 text-red-300' };
  if (eff === 'WITH_ISSUES') return { key: 'ISSUES', label: 'com problema', reason: 'a Meta apontou um problema: veja no Gerenciador', cls: 'bg-red-950 text-red-300' };
  if (eff === 'ARCHIVED' || eff === 'DELETED') return { key: 'ARCHIVED', label: 'arquivado', reason: null, cls: 'bg-slate-900 text-slate-500' };
  return { key: 'UNKNOWN', label: eff ? eff.toLowerCase() : 'sem status', reason: null, cls: 'bg-slate-800 text-slate-400' };
}

export const DeliveryBadge: React.FC<{ d: Delivery }> = ({ d }) => (
  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${d.cls}`} title={d.reason || undefined} data-testid="ad-delivery">
    {d.label}
    {d.reason ? ` · ${d.reason}` : ''}
  </span>
);

/** Imagem vinda da Meta: o link expira; quando falha, avisa em vez de mostrar imagem quebrada. */
export const MetaImage: React.FC<{ url?: string | null; alt: string; className?: string }> = ({ url, alt, className = '' }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const ok = !!url && /^https:\/\//i.test(url) && !failed;
  if (!ok) {
    return (
      <div className={`${className} bg-black flex items-center justify-center text-[10px] text-slate-500 text-center px-1`} data-testid={url ? 'meta-image-expired' : 'meta-image-none'}>
        {url ? 'imagem expirada · use "Ver como aparece"' : 'sem imagem · use "Ver como aparece"'}
      </div>
    );
  }
  return <img src={url as string} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`${className} object-cover`} />;
};

const FORMATS: { key: string; label: string; w: number; h: number }[] = [
  { key: 'INSTAGRAM_STANDARD', label: 'Instagram feed', w: 330, h: 600 },
  { key: 'INSTAGRAM_STORY', label: 'Instagram Stories', w: 330, h: 600 },
  { key: 'MOBILE_FEED_STANDARD', label: 'Facebook feed', w: 330, h: 560 }
];

/** Botão "Ver como aparece" + painel com a prévia oficial da Meta. */
export const AdPreviewButton: React.FC<{ metaAdId: string; apiFetch: ApiFetch }> = ({ metaAdId, apiFetch }) => {
  const [open, setOpen] = useState(false);
  const [fmt, setFmt] = useState(FORMATS[0].key);
  const [state, setState] = useState<Record<string, { src: string | null; error?: string | null; manager_url?: string | null } | 'loading'>>({});

  // Cada formato é pedido uma vez só (o App recria apiFetch a cada render; o ref evita pedidos repetidos).
  const requested = useRef<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open || requested.current.has(fmt)) return;
    requested.current.add(fmt);
    setState(s => ({ ...s, [fmt]: 'loading' }));
    apiFetch(`/meta/ads/${encodeURIComponent(metaAdId)}/preview?format=${fmt}`)
      .then((r: any) => setState(s => ({ ...s, [fmt]: { src: r?.src || null, error: r?.error || null, manager_url: r?.manager_url || null } })))
      .catch((e: any) => setState(s => ({ ...s, [fmt]: { src: null, error: e?.message || 'Não foi possível buscar a prévia.' } })));
  }, [open, fmt, metaAdId, apiFetch, attempt]);

  const retry = () => {
    requested.current.delete(fmt);
    setState(s => {
      const n = { ...s };
      delete n[fmt];
      return n;
    });
    setAttempt(a => a + 1);
  };

  const cur = state[fmt];
  const f = FORMATS.find(x => x.key === fmt)!;
  const managerUrl = Object.values(state).find((v: any) => v && v !== 'loading' && v.manager_url) as any;

  return (
    <div className="text-[11px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        data-testid="ad-preview-toggle"
        className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-950/30 px-2 py-0.5 text-sky-300 hover:bg-sky-900/40"
      >
        <Eye className="h-3 w-3" /> {open ? 'Fechar prévia' : 'Ver como aparece'}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded border border-slate-800 bg-slate-950/60 p-2" data-testid="ad-preview-panel">
          <div className="flex flex-wrap gap-1" role="tablist">
            {FORMATS.map(x => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={fmt === x.key}
                onClick={() => setFmt(x.key)}
                className={`rounded px-2 py-0.5 ${fmt === x.key ? 'bg-sky-500 text-slate-950' : 'border border-slate-700 text-slate-300'}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          {cur === 'loading' || !cur ? (
            <p className="text-slate-400">Gerando a prévia na Meta…</p>
          ) : cur.src ? (
            <iframe
              title={`Prévia ${f.label}`}
              src={cur.src}
              width={f.w}
              height={f.h}
              loading="lazy"
              data-testid="ad-preview-iframe"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              className="max-w-full rounded border border-slate-800 bg-white"
              style={{ border: 0 }}
            />
          ) : (
            <div className="space-y-1">
              <p className="text-amber-300" data-testid="ad-preview-error">{cur.error || 'A Meta não gerou a prévia deste formato.'}</p>
              <button type="button" onClick={retry} data-testid="ad-preview-retry" className="rounded border border-slate-700 px-2 py-0.5 text-slate-300">
                Tentar de novo
              </button>
            </div>
          )}
          {managerUrl?.manager_url && (
            <a href={managerUrl.manager_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-300 underline" data-testid="ad-manager-link">
              Abrir no Gerenciador de Anúncios <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
};
