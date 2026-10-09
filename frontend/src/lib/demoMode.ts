// NORQVA-0003 / NORQVA-0034: o sistema não tem mais modo demonstração nas telas. A visão DEMO (e o seletor)
// só existe nos testes automáticos, que usam dados de demonstração para nunca tocar em dado real. Nenhuma
// configuração de ambiente religa o modo demo num site publicado.
const env = (import.meta as any).env || {};
export const DEMO_MODE_ENABLED: boolean = env.MODE === 'test';
