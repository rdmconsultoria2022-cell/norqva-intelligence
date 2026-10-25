// NORQVA-0135: "Kit de Bordado" não é o kit de livros de cozinha (página /p/, não /kit/).
import { describe, it, expect } from 'vitest';
import { isKitOffer } from '../services/launchPlans/campaignEditorService';

describe('NORQVA-0135 — kit de livros x kit de bordado', () => {
  it('só o kit de livros vai para /kit/', () => {
    expect(isKitOffer({ name: 'Kit Cozinha Italiana' })).toBe(true);
    expect(isKitOffer({ name: 'KIT TRATTORIA COMPLETO — 5 LIVROS' })).toBe(true);
    expect(isKitOffer({ name: 'Kit de Bordado NORQVA' })).toBe(false);
    expect(isKitOffer({ name: 'Bordado' })).toBe(false);
    expect(isKitOffer({ name: null })).toBe(false);
  });
});
