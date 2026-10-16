import React, { useEffect, useMemo, useRef, useState } from 'react';
import { brl, int, Disclosure } from '../../components/ui/premium';

// NORQVA-0082 (D-0082): receita × investimento por dia (dados de /api/executive/daily, só leitura).
// Um eixo só (os dois em R$). Cores validadas para fundo escuro (contraste e daltonismo);
// o investimento também é tracejado, para não depender só da cor. Tocar/passar o dedo mostra o dia.

export interface DailyPoint {
  date: string;
  revenue: number;
  paidOrders: number;
  spend: number;
}

const REVENUE = '#059669';
const SPEND = '#3B82F6';
const H = 168;
const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

const dm = (ymd: string) => ymd.split('-').reverse().slice(0, 2).join('/');

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

/** Linha suave (Catmull-Rom → Bézier), sem passar do valor real nos extremos. */
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.18;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    // controle vertical limitado ao intervalo do trecho: a curva não inventa picos
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const c1y = Math.min(hi, Math.max(lo, p1[1] + (p2[1] - p0[1]) * t));
    const c2y = Math.min(hi, Math.max(lo, p2[1] - (p3[1] - p1[1]) * t));
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function DailyChart({ days }: { days: DailyPoint[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => setSel(null), [days]);

  const geo = useMemo(() => {
    const max = niceMax(Math.max(...days.map(d => Math.max(d.revenue, d.spend)), 0));
    const innerW = width - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (days.length === 1 ? innerW / 2 : (i / (days.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
    return {
      max,
      x,
      y,
      revenue: smoothPath(days.map((d, i) => [x(i), y(d.revenue)])),
      spend: smoothPath(days.map((d, i) => [x(i), y(d.spend)])),
      grid: [0, 0.5, 1].map(f => ({ v: max * f, y: y(max * f) }))
    };
  }, [days, width]);

  const pick = (clientX: number) => {
    const el = boxRef.current;
    if (!el || days.length === 0) return;
    const r = el.getBoundingClientRect();
    const rel = clientX - r.left - PAD.left;
    const innerW = width - PAD.left - PAD.right;
    const i = days.length === 1 ? 0 : Math.round((rel / innerW) * (days.length - 1));
    setSel(Math.max(0, Math.min(days.length - 1, i)));
  };

  const shown = sel ?? days.length - 1;
  const cur = days[shown];
  const totRevenue = days.reduce((a, d) => a + d.revenue, 0);
  const totSpend = days.reduce((a, d) => a + d.spend, 0);

  return (
    <div className="space-y-3" data-testid="daily-chart">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-nq-aux text-nq-muted" aria-live="polite">
          {sel === null ? 'Último dia' : 'Dia'} <span className="text-nq-text">{dm(cur.date)}</span>
        </div>
        <div className="flex gap-4 text-nq-aux tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="8" aria-hidden="true"><line x1="0" y1="4" x2="16" y2="4" stroke={REVENUE} strokeWidth="2" strokeLinecap="round" /></svg>
            <span className="text-nq-muted">Receita</span> <span className="text-nq-text">{brl(cur.revenue)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="8" aria-hidden="true"><line x1="0" y1="4" x2="16" y2="4" stroke={SPEND} strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" /></svg>
            <span className="text-nq-muted">Anúncios</span> <span className="text-nq-text">{brl(cur.spend)}</span>
          </span>
        </div>
      </div>

      <div
        ref={boxRef}
        className="relative w-full touch-pan-y select-none"
        onPointerMove={e => pick(e.clientX)}
        onPointerDown={e => pick(e.clientX)}
        onPointerLeave={e => e.pointerType === 'mouse' && setSel(null)}
      >
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={`Receita e investimento em anúncios por dia, de ${dm(days[0].date)} a ${dm(days[days.length - 1].date)}. Receita total ${brl(totRevenue)}, investimento total ${brl(totSpend)}.`}
          className="block"
        >
          {geo.grid.map(g => (
            <g key={g.v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={g.y} y2={g.y} stroke="#343434" strokeWidth="1" strokeDasharray={g.v === 0 ? undefined : '2 4'} />
              {g.v > 0 && (
                <text x={width - PAD.right} y={g.y - 4} textAnchor="end" fontSize="12" fill="#8A8A8A">
                  {brl(g.v, { compact: true }).replace(',00', '')}
                </text>
              )}
            </g>
          ))}
          <path d={geo.spend} fill="none" stroke={SPEND} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={geo.revenue} fill="none" stroke={REVENUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {sel !== null && (
            <g>
              <line x1={geo.x(shown)} x2={geo.x(shown)} y1={PAD.top} y2={H - PAD.bottom} stroke="#A3A3A3" strokeWidth="1" />
              <circle cx={geo.x(shown)} cy={geo.y(cur.spend)} r="4.5" fill={SPEND} stroke="#1D1D1D" strokeWidth="2" />
              <circle cx={geo.x(shown)} cy={geo.y(cur.revenue)} r="4.5" fill={REVENUE} stroke="#1D1D1D" strokeWidth="2" />
            </g>
          )}
          {sel === null && days.length > 1 && (
            <circle cx={geo.x(days.length - 1)} cy={geo.y(cur.revenue)} r="4" fill={REVENUE} stroke="#1D1D1D" strokeWidth="2" />
          )}
          <text x={PAD.left} y={H - 4} fontSize="12" fill="#8A8A8A">{dm(days[0].date)}</text>
          <text x={width - PAD.right} y={H - 4} fontSize="12" fill="#8A8A8A" textAnchor="end">{dm(days[days.length - 1].date)}</text>
        </svg>
      </div>

      <Disclosure summary="Ver os números de cada dia" testId="daily-table" className="-mx-4">
        <div className="overflow-x-auto">
          <table className="w-full text-nq-caption tabular-nums">
            <thead>
              <tr className="text-nq-muted text-left">
                <th className="py-1.5 pr-3 font-normal">Dia</th>
                <th className="py-1.5 pr-3 font-normal text-right">Receita</th>
                <th className="py-1.5 pr-3 font-normal text-right">Anúncios</th>
                <th className="py-1.5 font-normal text-right">Vendas</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map(d => (
                <tr key={d.date} className="border-t border-nq-line/50 text-nq-text">
                  <td className="py-1.5 pr-3">{dm(d.date)}</td>
                  <td className="py-1.5 pr-3 text-right">{brl(d.revenue)}</td>
                  <td className="py-1.5 pr-3 text-right">{brl(d.spend)}</td>
                  <td className="py-1.5 text-right">{int(d.paidOrders)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </div>
  );
}
