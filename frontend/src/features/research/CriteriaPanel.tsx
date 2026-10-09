import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Save, RotateCcw } from 'lucide-react';

// NORQVA-0029: aba Critérios da tela Pesquisa. Mostra as regras em português; ADMIN ajusta (nova versão em
// rascunho) e valida. Só a versão validada vale para a Base, a seleção de candidatos e o mercado europeu.

export interface CriteriaDef {
  key: string;
  group: 'BASE' | 'SHORTLIST' | 'EU';
  label: string;
  unit: string;
  min: number;
  max: number;
  integer?: boolean;
}

export interface CriteriaVersion {
  version: number;
  status: 'DRAFT' | 'VALIDATED' | 'SUPERSEDED';
  numbers: Record<string, number>;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
  validated_by_name: string | null;
  validated_at: string | null;
  texts_hash: string;
}

export interface CriteriaOverview {
  effective: { numbers: Record<string, number>; version: number | null; validated: boolean; texts_changed: boolean };
  validated: CriteriaVersion | null;
  draft: CriteriaVersion | null;
  versions: CriteriaVersion[];
  defs: CriteriaDef[];
  texts: { validator_checks: { key: string; label: string }[]; ai_rules: string[] };
  texts_hash: string;
}

const GROUPS: { id: CriteriaDef['group']; title: string; hint: string }[] = [
  { id: 'BASE', title: 'Classes da Base de campanhas', hint: '“Equilíbrio” é o CPA de equilíbrio do produto: o máximo que se pode pagar por venda sem perder dinheiro.' },
  { id: 'SHORTLIST', title: 'Seleção de candidatos para avaliação', hint: 'Quem entra na lista que pode ser enviada ao Time de IAs.' },
  { id: 'EU', title: 'Mercado europeu', hint: 'Nota de 0 a 100 de cada nicho, pela Biblioteca de Anúncios da Meta. Os quatro pesos somam 1.' }
];

const STATUS_LABEL: Record<CriteriaVersion['status'], string> = { DRAFT: 'rascunho', VALIDATED: 'validada', SUPERSEDED: 'substituída' };
const fmt = (n: number | undefined) => (n === undefined || n === null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }));
const when = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

interface Props {
  currentUser: any;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  /** Avisa a tela Pesquisa quando a validação muda (trava do "Aprovar plano"). */
  onChanged?: (o: CriteriaOverview) => void;
}

export const CriteriaPanel: React.FC<Props> = ({ currentUser, apiFetch, showError, showSuccess, onChanged }) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [data, setData] = useState<CriteriaOverview | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Base do formulário: o rascunho em aberto, ou os números em vigor
  const base = useMemo<Record<string, number>>(() => (data ? data.draft?.numbers || data.effective.numbers : {}), [data]);

  const load = useCallback(async () => {
    try {
      const r: CriteriaOverview = await apiFetch('/research/criteria');
      setData(r);
      const b = r.draft?.numbers || r.effective.numbers;
      setForm(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, String(v)])));
      onChanged?.(r);
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar os critérios.');
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <p className="text-sm text-slate-500">Carregando os critérios…</p>;

  const changed = Object.keys(form).filter(k => Number(String(form[k]).replace(',', '.')) !== base[k]);

  const saveDraft = async () => {
    setBusy(true);
    try {
      const numbers = Object.fromEntries(changed.map(k => [k, String(form[k]).replace(',', '.')]));
      const r = await apiFetch('/research/criteria/drafts', { method: 'POST', body: JSON.stringify({ numbers, note: note.trim() || null }), headers: { 'Content-Type': 'application/json' } });
      showSuccess(`Rascunho v${r?.version} criado. Ele só vale depois de validado.`);
      setNote('');
      await load();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível criar o rascunho.');
    } finally {
      setBusy(false);
    }
  };

  const validate = async (version: number) => {
    setBusy(true);
    try {
      await apiFetch(`/research/criteria/${version}/validate`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
      showSuccess(`Critérios v${version} validados. Passam a valer agora.`);
      await load();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível validar.');
    } finally {
      setBusy(false);
    }
  };

  const eff = data.effective;
  const draft = data.draft;
  const draftTextsOk = !!draft && draft.texts_hash === data.texts_hash;
  // Sem mudança de número, um rascunho novo só faz sentido para trazer os textos atuais
  const needsFreshDraft = (!!draft && !draftTextsOk) || (!draft && eff.texts_changed);

  return (
    <div className="space-y-5 text-sm" data-testid="criteria-panel">
      <div
        className={`rounded border p-3 text-xs ${eff.validated ? 'border-emerald-700/50 bg-emerald-950/20 text-emerald-200' : 'border-amber-600/50 bg-amber-950/20 text-amber-200'}`}
        data-testid="criteria-status"
      >
        {eff.validated && data.validated ? (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Valendo: versão {data.validated.version}, validada
            {data.validated.validated_by_name ? ` por ${data.validated.validated_by_name}` : ''} em {when(data.validated.validated_at)}.
          </span>
        ) : eff.texts_changed ? (
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Os textos do checklist ou das regras mudaram depois da versão {eff.version}. Os números dela continuam valendo,
            mas nenhum plano pode ser aprovado até uma nova validação.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Nada validado ainda: o sistema usa os valores de sempre, e nenhum plano pode ser aprovado até você validar.
          </span>
        )}
      </div>

      {draft && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-sky-700/50 bg-sky-950/20 p-3 text-xs text-sky-100" data-testid="criteria-draft">
          <span>
            Rascunho v{draft.version}
            {draft.created_by_name ? ` de ${draft.created_by_name}` : ''} ({when(draft.created_at)}){draft.note ? `: ${draft.note}` : ''}.{' '}
            {!draftTextsOk && 'Os textos mudaram depois deste rascunho: salve um rascunho novo para validar.'}
          </span>
          {isAdmin && draftTextsOk && (
            <button
              onClick={() => validate(draft.version)}
              disabled={busy || changed.length > 0}
              title={changed.length > 0 ? 'Salve ou desfaça os ajustes antes de validar' : undefined}
              data-testid="validate-criteria"
              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Validar v{draft.version}
            </button>
          )}
        </div>
      )}

      {GROUPS.map(g => (
        <section key={g.id} className="space-y-2" data-testid={`criteria-group-${g.id}`}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{g.title}</h3>
          <p className="text-[11px] text-slate-500">{g.hint}</p>
          <div className="divide-y divide-slate-800 rounded border border-slate-800">
            {data.defs.filter(d => d.group === g.id).map(d => {
              const isChanged = changed.includes(d.key);
              const draftDiff = draft && draft.numbers[d.key] !== eff.numbers[d.key];
              return (
                <div key={d.key} className="grid grid-cols-1 items-center gap-2 p-2 text-xs sm:grid-cols-[1fr_8rem_9rem]">
                  <span className="text-slate-200">{d.label}</span>
                  <span className="text-slate-400" title="Valor em vigor">
                    em vigor: <span className="font-mono text-slate-200">{fmt(eff.numbers[d.key])}</span> {d.unit}
                  </span>
                  {isAdmin ? (
                    <input
                      aria-label={d.label}
                      inputMode="decimal"
                      value={form[d.key] ?? ''}
                      onChange={e => setForm({ ...form, [d.key]: e.target.value })}
                      className={`w-full rounded border bg-slate-950 px-2 py-1 font-mono text-slate-100 ${isChanged ? 'border-sky-500' : draftDiff ? 'border-sky-800' : 'border-slate-700'}`}
                    />
                  ) : (
                    <span className="text-slate-500">{draftDiff ? `rascunho: ${fmt(draft!.numbers[d.key])}` : ''}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {isAdmin && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-dashed border-slate-700 p-3 text-xs">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-slate-400">Motivo do ajuste (opcional)</span>
            <input value={note} onChange={e => setNote(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100" />
          </label>
          <button
            onClick={saveDraft}
            disabled={busy || (changed.length === 0 && !needsFreshDraft)}
            data-testid="save-criteria-draft"
            className="inline-flex items-center gap-1 rounded bg-slate-200 px-3 py-1.5 font-semibold text-slate-900 disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" /> Salvar como rascunho{changed.length ? ` (${changed.length})` : ''}
          </button>
          {changed.length > 0 && (
            <button
              onClick={() => setForm(Object.fromEntries(Object.entries(base).map(([k, v]) => [k, String(v)])))}
              className="inline-flex items-center gap-1 rounded border border-slate-700 px-3 py-1.5 text-slate-300"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Desfazer
            </button>
          )}
        </div>
      )}

      <section className="space-y-2" data-testid="criteria-texts">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Checklist do validador</h3>
        <p className="text-[11px] text-slate-500">O Claude crítico confere cada item. Se algum vier como falha, ele não pode aprovar.</p>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-300">
          {data.texts.validator_checks.map(c => (
            <li key={c.key}>{c.label}</li>
          ))}
        </ul>
        <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Regras que as IAs recebem</h3>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-300">
          {data.texts.ai_rules.map(r => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-500">Estes textos entram na validação; mudar o texto é feito por contrato.</p>
      </section>

      <section className="space-y-1" data-testid="criteria-history">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Versões</h3>
        {data.versions.map(v => (
          <div key={v.version} className="flex flex-wrap gap-x-3 text-[11px] text-slate-400">
            <span className="font-mono text-slate-200">v{v.version}</span>
            <span>{STATUS_LABEL[v.status]}</span>
            <span>
              criada {when(v.created_at)}
              {v.created_by_name ? ` por ${v.created_by_name}` : ''}
            </span>
            {v.validated_at && (
              <span>
                validada {when(v.validated_at)}
                {v.validated_by_name ? ` por ${v.validated_by_name}` : ''}
              </span>
            )}
            {v.note && <span className="text-slate-500">{v.note}</span>}
          </div>
        ))}
      </section>
    </div>
  );
};
