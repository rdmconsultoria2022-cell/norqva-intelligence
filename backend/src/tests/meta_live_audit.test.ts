import { describe, it, expect, vi, afterEach } from 'vitest';
import { MetaMutatingClient } from '../services/meta/metaMutatingClient';

describe('Auditoria ao vivo da Meta (somente leitura)', () => {
  const prev = process.env.META_AD_ACCOUNT_ID;
  afterEach(() => {
    process.env.META_AD_ACCOUNT_ID = prev;
  });

  it('usa apenas GET e devolve objeto, vídeo, insights e conta', async () => {
    process.env.META_AD_ACCOUNT_ID = '2887010388338951';
    const post = vi.fn();
    const get = vi.fn(async (path: string) => {
      if (path.endsWith('/insights')) return { data: [{ spend: '0', impressions: '0' }] };
      if (path === '/111') return { id: '111', status: 'PAUSED', creative: { object_story_spec: { video_data: { video_id: '999' } } } };
      if (path === '/999') return { id: '999', title: 'TR-EXP02_TR_V1_EMO' };
      if (path === '/act_2887010388338951') return { account_status: 1, spend_cap: '227869' };
      if (path === '/222') throw new Error('[META GRAPH API ERROR]: nope');
      return { id: path.slice(1), status: 'PAUSED' };
    });
    const client = new MetaMutatingClient(post as any, undefined, get as any);
    const out = await client.auditLive({ campaigns: ['333'], adsets: ['222'], ads: ['111'] });
    expect(post).not.toHaveBeenCalled();
    expect(out.source).toBe('META_GRAPH_API_LIVE');
    expect(out.ads[0].video.title).toBe('TR-EXP02_TR_V1_EMO');
    expect(out.ads[0].insights.data[0].spend).toBe('0');
    expect(out.adsets[0].object.error).toContain('nope');
    expect(out.account.spend_cap).toBe('227869');
  });
});
