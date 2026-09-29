// NORQVA-0017 (fase 3): GPT second opinion on an opportunity (structured JSON). Optional:
// without OPENAI_API_KEY the result says so and the flow continues with Claude only.

export interface SecondOpinionInput {
  opportunity: any;
  evidence: any;
  context: any;
}

export interface SecondOpinion {
  by: 'GPT';
  model?: string;
  skipped?: boolean;
  reason?: string;
  score?: number;
  verdict?: 'SEGUIR' | 'TESTAR' | 'DESCARTAR';
  summary?: string;
  risks?: string[];
  at: string;
}

export type SecondOpinionProvider = (input: SecondOpinionInput) => Promise<SecondOpinion>;

const SYSTEM = `Você é um analista sênior de tráfego pago (Meta Ads) avaliando uma oportunidade de campanha para uma empresa brasileira de produtos digitais.
Dê uma segunda opinião independente, cética e objetiva, em português do Brasil, baseada SOMENTE nos dados recebidos.
Considere: evidência de demanda (anúncios que se sustentam no mercado europeu, desempenho da nossa conta), margem (CPA de equilíbrio), claims verificadas disponíveis e riscos (políticas da Meta, promessas proibidas, amostra pequena).
Responda APENAS um JSON: {"score": 0-100, "verdict": "SEGUIR"|"TESTAR"|"DESCARTAR", "summary": "até 5 frases", "risks": ["..."]}.`;

export const gptSecondOpinion: SecondOpinionProvider = async input => {
  const at = new Date().toISOString();
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { by: 'GPT', skipped: true, reason: 'OPENAI_API_KEY não configurada: segunda opinião desativada.', at };
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const payload = JSON.stringify(input).slice(0, 60000);
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: payload }
        ]
      }),
      signal: controller.signal
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { by: 'GPT', model, skipped: true, reason: `Falha na API da OpenAI (HTTP ${res.status}).`, at };
    return parseSecondOpinion(data?.choices?.[0]?.message?.content, model, at);
  } catch (err: any) {
    return { by: 'GPT', model, skipped: true, reason: err?.name === 'AbortError' ? 'A OpenAI demorou demais para responder.' : 'Erro ao consultar a OpenAI.', at };
  } finally {
    clearTimeout(timer);
  }
};

export function parseSecondOpinion(content: unknown, model: string, at: string): SecondOpinion {
  let j: any;
  try {
    j = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    return { by: 'GPT', model, skipped: true, reason: 'Resposta da OpenAI fora do formato JSON.', at };
  }
  const score = Math.max(0, Math.min(100, Math.round(Number(j?.score))));
  const verdict = ['SEGUIR', 'TESTAR', 'DESCARTAR'].includes(String(j?.verdict).toUpperCase()) ? (String(j.verdict).toUpperCase() as SecondOpinion['verdict']) : undefined;
  if (!Number.isFinite(score) || !verdict) return { by: 'GPT', model, skipped: true, reason: 'Resposta da OpenAI incompleta.', at };
  return {
    by: 'GPT',
    model,
    score,
    verdict,
    summary: String(j?.summary || '').slice(0, 2000),
    risks: Array.isArray(j?.risks) ? j.risks.map((r: any) => String(r).slice(0, 300)).slice(0, 8) : [],
    at
  };
}
