/**
 * NORQVA Design System — UI/UX Refresh V1 Tokens
 * Canonical styling tokens for clean, modern B2B SaaS executive interface.
 */

export const UI_TOKENS = {
  // Page canvas
  canvas: 'bg-slate-50/80 min-h-screen text-slate-900',
  
  // Card & Surface containers
  card: 'bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.02)]',
  cardSubtle: 'bg-slate-50/60 rounded-xl border border-slate-200/60',
  cardInteractive: 'bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200',

  // Section Headers
  sectionTitle: 'text-sm font-semibold text-slate-900 tracking-tight flex items-center gap-2',
  sectionSubtitle: 'text-xs text-slate-500 mt-0.5',

  // Typography
  kpiNumber: 'text-2xl sm:text-3xl font-bold tracking-tight text-slate-900',
  kpiLabel: 'text-xs font-medium text-slate-500 uppercase tracking-wider',
  
  // Badges
  badgeSuccess: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60',
  badgeWarning: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/60',
  badgeDanger: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/60',
  badgeInfo: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60',
  badgeNeutral: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/60',

  // Table styles
  tableHeader: 'bg-slate-50/80 text-slate-600 font-medium text-xs uppercase tracking-wider border-b border-slate-200/80',
  tableRow: 'hover:bg-slate-50/60 transition-colors border-b border-slate-100 text-xs text-slate-700',
  
  // Buttons
  btnPrimary: 'px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs shadow-sm transition-all flex items-center justify-center gap-2',
  btnSecondary: 'px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs border border-slate-200 shadow-sm transition-all flex items-center justify-center gap-2',
  btnActivePill: 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white shadow-sm transition-all',
  btnInactivePill: 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all'
};
