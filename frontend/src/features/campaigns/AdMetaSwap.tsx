import React, { useState } from 'react';
import { CTA_LABEL } from './ctaLabels';

// NORQVA-0056: anúncio que JÁ ESTÁ na Meta. A Meta não deixa editar a peça de um anúncio existente;
// o NORQVA cria uma peça nova com o mesmo vídeo e troca dentro do mesmo anúncio (status, orçamento e
// público não mudam). O anúncio volta para a revisão da Meta, que costuma levar de minutos a algumas horas.

const input = 'w-full rounded-md bg-nq-surface border border-nq-line px-2 py-1.5 text-nq-text';

export function AdMetaSwap({
  campaignId,
  campaignCode,
  index,
  ad,
  apiFetch,
  showError,
  showSuccess,
  onDone,
  options = []
}: {
  campaignId: string;
  campaignCode: string;
  index: number;
  ad: any;
  apiFetch: (url: string, init?: any) => Promise<any>;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
  onDone: (campaign: any) => void;
  /** NORQVA-0098: criativos aprovados da oferta (trocar o vídeo no ar) */
  options?: Array<{ id: string; human_id: string; ok: boolean; reason?: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    destination_url: String(ad?.destination_url || ''),
    primary_text: String(ad?.primary_text || ''),
    headline: String(ad?.headline || ''),
    cta: String(ad?.cta || 'SEE_DETAILS'),
    confirm_code: ''
  });
  // NORQVA-0098: descrição e troca de vídeo (só vão no pedido quando preenchidos)
  const [description, setDescription] = useState(String(ad?.description || ''));
  const [creativeId, setCreativeId] = useState('');
  const n = index + 1;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center min-h-[40px] rounded-full bg-nq-raised px-4 text-[13px] font-semibold text-nq-text hover:brightness-110"
        data-testid={`ad-meta-edit-${index}`}
      >
        Editar anúncio na Meta
      </button>
    );
  }

  const submit = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/campaigns/${campaignId}/ads/${index}/replace-on-meta?mode=real`, {
        method: 'POST',
        body: JSON.stringify({
          ...f,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(creativeId ? { creative_id: creativeId } : {})
        })
      });
      showSuccess(
        (r?.video_changed
          ? 'Vídeo e peça trocados na Meta. O anúncio passa pela revisão da Meta antes de voltar a rodar.'
          : 'Anúncio trocado na Meta. Ele passa pela revisão da Meta antes de voltar a rodar com o texto novo.') +
          (r?.mixed_offers ? ' Atenção: os anúncios desta campanha agora levam para páginas diferentes; troque os outros também.' : '') +
          (r?.plan_sync_failed ? ' A troca foi feita na Meta, mas a tela não foi atualizada: recarregue.' : '')
      );
      setOpen(false);
      if (r?.campaign) onDone(r.campaign);
    } catch (err: any) {
      showError(err?.message || 'Não foi possível trocar o anúncio na Meta.');
    } finally {
      setBusy(false);
    }
  };

  const codeOk = f.confirm_code.trim().toUpperCase() === String(campaignCode || '').toUpperCase();

  return (
    <div className="rounded-2xl bg-nq-raised p-4 space-y-3" data-testid={`ad-meta-form-${index}`}>
      <p className="text-nq-text">
        A Meta cria uma peça nova (com o mesmo vídeo, ou com o vídeo escolhido) e troca neste anúncio. Status, orçamento e público não mudam. O anúncio
        volta para a revisão da Meta. Sem preço no texto: preço só na página, no WhatsApp e no pagamento.
      </p>
      <label className="block">
        <span className="text-nq-muted">Link de destino</span>
        <input aria-label={`Novo link do anúncio ${n}`} value={f.destination_url} onChange={e => setF({ ...f, destination_url: e.target.value })} className={input} />
      </label>
      <label className="block">
        <span className="text-nq-muted">Texto do anúncio</span>
        <textarea aria-label={`Novo texto do anúncio ${n}`} rows={4} value={f.primary_text} onChange={e => setF({ ...f, primary_text: e.target.value })} className={input} />
      </label>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="text-nq-muted">Título</span>
          <input aria-label={`Novo título do anúncio ${n}`} value={f.headline} onChange={e => setF({ ...f, headline: e.target.value })} className={input} />
        </label>
        <label className="block">
          <span className="text-nq-muted">Botão</span>
          <select aria-label={`Novo botão do anúncio ${n}`} value={f.cta} onChange={e => setF({ ...f, cta: e.target.value })} className={input}>
            {Object.entries(CTA_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-nq-muted">Descrição (opcional)</span>
        <input aria-label={`Nova descrição do anúncio ${n}`} maxLength={255} value={description} onChange={e => setDescription(e.target.value)} className={input} />
      </label>
      {options.length > 0 && (
        <label className="block">
          <span className="text-nq-muted">Vídeo</span>
          <select aria-label={`Novo vídeo do anúncio ${n}`} value={creativeId} onChange={e => setCreativeId(e.target.value)} className={input}>
            <option value="">Manter o vídeo atual</option>
            {options.map(o => (
              <option key={o.id} value={o.id} disabled={!o.ok}>
                {o.human_id}
                {o.ok ? '' : ` — ${o.reason || 'indisponível'}`}
              </option>
            ))}
          </select>
          {creativeId && (
            <span className="block mt-1 text-[12px] text-nq-subtle">O NORQVA envia o vídeo novo e espera a Meta processar (pode levar alguns minutos).</span>
          )}
        </label>
      )}
      <label className="block">
        <span className="text-nq-muted">Para confirmar, digite o código da campanha ({campaignCode})</span>
        <input aria-label={`Código para trocar o anúncio ${n}`} value={f.confirm_code} onChange={e => setF({ ...f, confirm_code: e.target.value })} className={input} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !codeOk}
          className="rounded-md bg-nq-positive px-3 py-1.5 font-semibold text-nq-on-positive disabled:opacity-50"
          data-testid={`ad-meta-submit-${index}`}
        >
          {busy ? (creativeId ? 'Enviando o vídeo…' : 'Trocando na Meta…') : 'Trocar na Meta'}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-md border border-nq-line px-3 py-1.5 text-nq-text">
          Cancelar
        </button>
      </div>
    </div>
  );
}
