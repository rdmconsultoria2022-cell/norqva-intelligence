// NORQVA-0135: capa do Kit de Bordado na tela Produtos (não a do kit de livros).
import { describe, it, expect } from 'vitest';
import { productCover } from '../features/products/ProductsView';

describe('NORQVA-0135 — capa na tela Produtos', () => {
  it('bordado usa a capa do bordado; kit de livros continua com a dele', () => {
    expect(productCover({ name: 'Kit de Bordado NORQVA' })).toMatch(/\/images\/bordado\/capa\.jpg$/);
    expect(productCover({ name: 'Bordado' })).toMatch(/\/images\/bordado\/capa\.jpg$/);
    expect(productCover({ name: 'Kit Cozinha Italiana' })).toMatch(/\/images\/kit\/capa_kit\.jpg$/);
    expect(productCover({ name: 'Desafio Seca Barriga' })).toBeNull();
  });
});
