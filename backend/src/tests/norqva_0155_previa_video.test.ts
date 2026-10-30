// NORQVA-0155: prévia em vídeo só para o Kit de Bordado na página gerada.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { productPreviewVideo } from '../services/creative/generatedImages';

describe('NORQVA-0155 — prévia em vídeo', () => {
  it('bordado tem; livros de cozinha não', () => {
    expect(productPreviewVideo({ name: 'Kit de Bordado NORQVA' })).toEqual({ src: '/videos/bordado/previa_aula.mp4', poster: '/videos/bordado/previa_aula.jpg' });
    expect(productPreviewVideo({ name: 'TRATTORIA EM CASA' })).toBeNull();
    expect(productPreviewVideo({ name: '' })).toBeNull();
  });
  it('os arquivos existem no site', () => {
    const pub = path.resolve(__dirname, '../../../frontend/public');
    for (const f of ['videos/bordado/previa_aula.mp4', 'videos/bordado/previa_aula.jpg']) expect(fs.existsSync(path.join(pub, f))).toBe(true);
  });
});
