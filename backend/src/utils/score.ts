export interface ScoreComponentResult {
  component_key: string;
  name: string;
  score: number;
  weight: number;
  weighted_score: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  evidence_count: number;
  reasoning_summary: string;
}

export interface ScoreCalculationResult {
  score_model_id: string;
  score_model_version: string;
  initial_product_score: number;
  critical_adjustment: number;
  final_product_score: number;
  confidence_score: number;
  components: ScoreComponentResult[];
}

export function calculateConfidenceScore(
  components: { key: string; weight: number }[],
  evidences: any[],
  componentEvidencesMap: Record<string, { evidence_id: string; relevance: string }[]>
): number {
  const W_COVERAGE = 0.4;
  const W_RELIABILITY = 0.3;
  const W_DIVERSITY = 0.3;

  // Filter out AI_INFERENCE evidences for confidence calculations to prevent self-reference feedback loop
  const validEvidences = evidences.filter(e => e.provenance !== 'AI_INFERENCE');
  const validEvidenceIds = new Set(validEvidences.map(e => e.id));

  let coveredComponentsCount = 0;
  let totalReliabilitySum = 0;
  let totalReliabilityCount = 0;

  // Track unique source groups of valid non-inference evidences
  const uniqueSourceGroups = new Set<string>();

  for (const comp of components) {
    const compEvs = componentEvidencesMap[comp.key] || [];
    const compValidEvs = compEvs.filter(ce => validEvidenceIds.has(ce.evidence_id));

    if (compValidEvs.length > 0) {
      coveredComponentsCount++;

      // Average reliability of valid evidences for this component
      let compReliabilitySum = 0;
      let compReliabilityCount = 0;

      for (const ce of compValidEvs) {
        const ev = validEvidences.find(e => e.id === ce.evidence_id);
        if (ev) {
          const relVal = ev.reliability === 'HIGH' ? 1.0 : ev.reliability === 'MEDIUM' ? 0.7 : 0.3;
          compReliabilitySum += relVal;
          compReliabilityCount++;

          if (ev.source_group) {
            uniqueSourceGroups.add(ev.source_group.trim().toLowerCase());
          }
        }
      }

      if (compReliabilityCount > 0) {
        totalReliabilitySum += (compReliabilitySum / compReliabilityCount);
        totalReliabilityCount++;
      }
    }
  }

  const coverage = components.length > 0 ? (coveredComponentsCount / components.length) : 0;
  const avgReliability = totalReliabilityCount > 0 ? (totalReliabilitySum / totalReliabilityCount) : 0;
  
  // Diversity of source groups (benchmark target is 3 unique sources)
  const diversity = Math.min(3, uniqueSourceGroups.size) / 3;

  const score = 100 * (W_COVERAGE * coverage + W_RELIABILITY * avgReliability + W_DIVERSITY * diversity);
  return parseFloat(score.toFixed(2));
}

export function calculateScores(
  model: any,
  componentsList: any[],
  subscoresInput: Record<string, { score: number; confidence: 'LOW' | 'MEDIUM' | 'HIGH'; reasoning: string }>,
  findings: any[],
  evidences: any[],
  componentEvidencesMap: Record<string, { evidence_id: string; relevance: string }[]>
): ScoreCalculationResult {
  
  // 1. Calculate Initial Product Score
  let totalWeight = 0;
  let weightedSum = 0;
  const componentsResults: ScoreComponentResult[] = [];

  for (const c of componentsList) {
    const key = c.component_key;
    const input = subscoresInput[key] || { score: 5.0, confidence: 'MEDIUM', reasoning: 'No input provided.' };
    const scoreVal = Math.min(parseFloat(c.max_score), Math.max(parseFloat(c.min_score), input.score));
    const weight = parseFloat(c.weight);
    const weighted = (scoreVal * weight) / 10.0; // Scaled to max score 10

    totalWeight += weight;
    weightedSum += weighted;

    const compEvs = componentEvidencesMap[key] || [];
    componentsResults.push({
      component_key: key,
      name: c.name,
      score: scoreVal,
      weight,
      weighted_score: parseFloat(weighted.toFixed(2)),
      confidence: input.confidence,
      evidence_count: compEvs.length,
      reasoning_summary: input.reasoning
    });
  }

  const initialScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
  const roundedInitial = parseFloat(initialScore.toFixed(2));

  // 2. Deterministic Critical Adjustment with Double Counting Protection
  // Group findings by (affected_component_key, risk_type)
  const groupedFindings: Record<string, any[]> = {};
  for (const f of findings) {
    if (!f.affected_component_keys || !Array.isArray(f.affected_component_keys)) continue;
    for (const key of f.affected_component_keys) {
      const riskType = f.risk_type || 'OTHER';
      const groupKey = `${key}::${riskType}`;
      if (!groupedFindings[groupKey]) {
        groupedFindings[groupKey] = [];
      }
      groupedFindings[groupKey].push(f);
    }
  }

  // Calculate penalty per group (minimum penalty, i.e., max negative value)
  const componentPenalties: Record<string, number> = {};
  
  for (const groupKey of Object.keys(groupedFindings)) {
    const [compKey, ] = groupKey.split('::');
    const compConfig = componentsList.find(c => c.component_key === compKey);
    if (!compConfig) continue;

    const rules = compConfig.calculation_rule || {};
    const penaltiesConfig = rules.penalties || { CRITICAL: -5.00, HIGH: -3.00, MEDIUM: -1.50, LOW: -0.50 };

    let maxNegativePenalty = 0; // Negative values
    for (const f of groupedFindings[groupKey]) {
      const sev = f.severity || 'MEDIUM';
      const penaltyVal = parseFloat(penaltiesConfig[sev] || -1.50);
      if (penaltyVal < maxNegativePenalty) {
        maxNegativePenalty = penaltyVal;
      }
    }

    if (!componentPenalties[compKey]) {
      componentPenalties[compKey] = 0;
    }
    componentPenalties[compKey] += maxNegativePenalty;
  }

  // Cap component penalties
  let sumComponentPenalties = 0;
  for (const compKey of Object.keys(componentPenalties)) {
    const compConfig = componentsList.find(c => c.component_key === compKey);
    const maxPenaltyCap = compConfig ? parseFloat(compConfig.max_penalty_per_component || 10.00) : 10.00;
    
    // Absolute value check because penalties are negative
    const penaltySum = componentPenalties[compKey];
    const cappedPenalty = Math.max(-maxPenaltyCap, penaltySum);
    sumComponentPenalties += cappedPenalty;
  }

  // Cap total critical adjustment
  const maxTotalCritical = parseFloat(model.max_total_critical_penalty || 25.00);
  const finalCriticalAdjustment = parseFloat(Math.max(-maxTotalCritical, sumComponentPenalties).toFixed(2));

  // 3. Clamped Final Product Score
  const finalScore = Math.min(100.00, Math.max(0.00, roundedInitial + finalCriticalAdjustment));
  const roundedFinal = parseFloat(finalScore.toFixed(2));

  // 4. Calculate multi-dimensional confidence score
  const confidenceScore = calculateConfidenceScore(
    componentsList.map(c => ({ key: c.component_key, weight: parseFloat(c.weight) })),
    evidences,
    componentEvidencesMap
  );

  return {
    score_model_id: model.id,
    score_model_version: `V${model.version}`,
    initial_product_score: roundedInitial,
    critical_adjustment: finalCriticalAdjustment,
    final_product_score: roundedFinal,
    confidence_score: confidenceScore,
    components: componentsResults
  };
}
