// NORQVA-0147: o atendente apresentava o kit (alternativa) antes da coleção [RECOMENDADO] e usava **negrito** que o WhatsApp não entende.
import { describe, it, expect } from 'vitest';
import { systemPrompt, splitReply, whatsappBold } from '../services/whatsapp/attendant';

describe('NORQVA-0147: ordem das opções e negrito do WhatsApp', () => {
  it('regra fixa: recomendado sempre primeiro, acima das condições', () => {
    const p = systemPrompt({ brandName: 'Trattoria', catalog: '- Código X', globalConditions: 'ofereça o kit primeiro', numberConditions: '', customerName: null, cpfOnFile: null });
    expect(p).toMatch(/marcado como recomendado no catálogo vem sempre em primeiro lugar/);
    expect(p).toMatch(/se as condições abaixo disserem outra ordem/);
    expect(p.indexOf('6b.')).toBeLessThan(p.indexOf('CONDIÇÕES DE ATENDIMENTO'));
  });

  it('troca **negrito** por *negrito* e mantém o resto', () => {
    expect(whatsappBold('1. **Coleção Trattoria Completa**: R$ 47,00')).toBe('1. *Coleção Trattoria Completa*: R$ 47,00');
    expect(whatsappBold('já *certo* e 2 * 3')).toBe('já *certo* e 2 * 3');
    expect(splitReply('**A**\n\n**B**')).toEqual(['*A*', '*B*']);
  });
});
