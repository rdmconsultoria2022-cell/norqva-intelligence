// NORQVA-0047: "Testar servidor" explica em português o que está errado no servidor do WhatsApp.
// fetch simulado: nada sai para a internet.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkEvolutionServer } from '../services/whatsapp/provider';

const resp = (status: number, body: any) => ({ status, text: async () => (body === null ? '' : JSON.stringify(body)) }) as any;

describe('NORQVA-0047 — testar servidor do WhatsApp', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sem configuração aponta as variáveis que faltam', async () => {
    const r = await checkEvolutionServer('', '');
    expect(r).toMatchObject({ ok: false, step: 'CONFIG' });
    expect(r.problem).toContain('EVOLUTION_API_URL e EVOLUTION_API_KEY');
  });

  it('endereço errado (404) pede para corrigir o EVOLUTION_API_URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(resp(404, null));
    const r = await checkEvolutionServer('https://errado.onrender.com/', 'k');
    expect(r).toMatchObject({ ok: false, step: 'ADDRESS', host: 'errado.onrender.com' });
  });

  it('senha errada aponta as duas variáveis', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(resp(200, { status: 200, message: 'Welcome to the Evolution API, it is working!', version: '2.3.0' }))
      .mockResolvedValueOnce(resp(401, { error: 'Unauthorized' }));
    const r = await checkEvolutionServer('https://wa.onrender.com', 'errada');
    expect(r).toMatchObject({ ok: false, step: 'KEY', version: '2.3.0' });
    expect(r.problem).toContain('AUTHENTICATION_API_KEY');
  });

  it('tudo certo mostra a versão', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(resp(200, { message: 'Welcome to the Evolution API, it is working!', version: '2.3.0' }))
      .mockResolvedValueOnce(resp(200, []));
    const r = await checkEvolutionServer('https://wa.onrender.com', 'certa');
    expect(r).toEqual({ ok: true, step: 'OK', host: 'wa.onrender.com', version: '2.3.0', problem: null });
    expect(f.mock.calls[1][0]).toBe('https://wa.onrender.com/instance/fetchInstances');
  });

  it('servidor fora do ar', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const r = await checkEvolutionServer('https://wa.onrender.com', 'k');
    expect(r).toMatchObject({ ok: false, step: 'REACH' });
  });
});
