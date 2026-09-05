import { Request, Response } from 'express';
import { MarketDiscoveryService } from '../services/marketDiscoveryService';

export const getMarketDiscoveryProbe = async (req: Request, res: Response): Promise<void> => {
  try {
    const probe = MarketDiscoveryService.getCapabilityProbe();
    res.json(probe);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const resolveSourceUrlOrId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { source_input } = req.body;
    if (!source_input) {
      res.status(400).json({ error: "Campo source_input é obrigatório (URL ou ID da Meta Ad Library)." });
      return;
    }
    const resolution = MarketDiscoveryService.resolveSourceUrlOrId(source_input);
    res.json(resolution);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const probeLandingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { landing_page_url } = req.body;
    if (!landing_page_url) {
      res.status(400).json({ error: "Campo landing_page_url é obrigatório." });
      return;
    }
    const { LandingPageProbeService } = require('../services/landingPageProbeService');
    const probeResult = await LandingPageProbeService.probeUrl(landing_page_url);
    res.json(probeResult);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const searchMarketDiscoveryAds = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, country, status, media_type, min_longevity, sort } = req.query;
    const results = MarketDiscoveryService.searchAds({
      query: typeof query === 'string' ? query : undefined,
      country: typeof country === 'string' ? country : undefined,
      status: typeof status === 'string' ? status : undefined,
      media_type: typeof media_type === 'string' ? media_type : undefined,
      min_longevity: min_longevity ? Number(min_longevity) : undefined,
      sort: typeof sort === 'string' ? sort : undefined
    });
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const ingestOperatorLiveAd = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      source_url_or_id,
      page_name,
      start_date,
      platforms,
      media_type,
      headline,
      primary_text,
      cta_text,
      destination_url,
      explicit_price,
      operator_confirmed,
      inferred_category,
      inferred_angle,
      inferred_hook,
      inferred_promise
    } = req.body;

    const record = MarketDiscoveryService.ingestOperatorLiveAd({
      source_url_or_id,
      page_name,
      start_date,
      platforms: platforms || ['Facebook', 'Instagram'],
      media_type: media_type || 'VIDEO',
      headline,
      primary_text,
      cta_text,
      destination_url,
      explicit_price,
      operator_confirmed: !!operator_confirmed,
      inferred_category,
      inferred_angle,
      inferred_hook,
      inferred_promise
    });

    res.json({
      success: true,
      message: "Anúncio ingerido com sucesso como OBSERVED após confirmação do operador.",
      record
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const getLiveIngestedAds = async (req: Request, res: Response): Promise<void> => {
  try {
    const ads = MarketDiscoveryService.getLiveIngestedAds();
    res.json({ total_live_ads: ads.length, ads });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getMarketDiscoveryClusters = async (req: Request, res: Response): Promise<void> => {
  try {
    const clusters = MarketDiscoveryService.getClusters();
    res.json({ total_clusters: clusters.length, clusters });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getMarketDiscoveryAdById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ad = MarketDiscoveryService.getAdById(id);
    if (!ad) {
      res.status(404).json({ error: `Anúncio ${id} não encontrado.` });
      return;
    }
    res.json(ad);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getMarketDiscoveryTestQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const queue = MarketDiscoveryService.getTestQueue();
    res.json({ total_queued: queue.length, queue });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const addToMarketDiscoveryTestQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ad_id, notes } = req.body;
    if (!ad_id) {
      res.status(400).json({ error: "Campo ad_id é obrigatório." });
      return;
    }
    const item = MarketDiscoveryService.addToTestQueue({ ad_id, notes });
    res.json({ success: true, item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const removeFromMarketDiscoveryTestQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = MarketDiscoveryService.removeFromTestQueue(id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
