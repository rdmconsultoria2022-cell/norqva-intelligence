/**
 * NORQVA — Creative Multi-Placement Engine & Safe-Area Validator V1
 *
 * Provides reusable placement specifications for Meta advertising channels,
 * deterministic pre-flight safe area validation, and placement-adapted layout generation.
 */

export type MetaPlacementType = 'META_FEED_SQUARE' | 'META_FEED_PORTRAIT' | 'META_STORY_REEL';

export interface PlacementSafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
  label: 'NORQVA_CONSERVATIVE_SAFE_AREA';
}

export interface PlacementBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PlacementConfig {
  key: MetaPlacementType;
  name: string;
  width: number;
  height: number;
  aspectRatio: string;
  safeArea: PlacementSafeArea;
  contentBounds: PlacementBounds;
  description: string;
}

export const META_PLACEMENT_SPECS: Record<MetaPlacementType, PlacementConfig> = {
  META_FEED_SQUARE: {
    key: 'META_FEED_SQUARE',
    name: 'Meta Feed Square (1:1)',
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    safeArea: {
      top: 60,
      bottom: 60,
      left: 60,
      right: 60,
      label: 'NORQVA_CONSERVATIVE_SAFE_AREA'
    },
    contentBounds: {
      minX: 60,
      minY: 60,
      maxX: 1020,
      maxY: 1020
    },
    description: 'Universal 1:1 format for Instagram & Facebook feeds.'
  },
  META_FEED_PORTRAIT: {
    key: 'META_FEED_PORTRAIT',
    name: 'Meta Feed Portrait (4:5)',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    safeArea: {
      top: 70,
      bottom: 70,
      left: 70,
      right: 70,
      label: 'NORQVA_CONSERVATIVE_SAFE_AREA'
    },
    contentBounds: {
      minX: 70,
      minY: 70,
      maxX: 1010,
      maxY: 1280
    },
    description: 'Vertical 4:5 format for mobile feed optimization.'
  },
  META_STORY_REEL: {
    key: 'META_STORY_REEL',
    name: 'Meta Story & Reel (9:16)',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    safeArea: {
      top: 250,   // Top buffer for profile icon, account handle, and close button
      bottom: 280, // Bottom buffer for swipe-up, CTA sticker, reply bar
      left: 70,
      right: 70,
      label: 'NORQVA_CONSERVATIVE_SAFE_AREA'
    },
    contentBounds: {
      minX: 70,
      minY: 250,
      maxX: 1010,
      maxY: 1640
    },
    description: 'Full-screen 9:16 format with generous top and bottom UI safe-margins.'
  }
};

export type CriticalElementType = 
  | 'HEADLINE' 
  | 'SUBHEADLINE' 
  | 'CTA' 
  | 'PRICE' 
  | 'BRAND_IDENTIFIER';

export interface CreativeElementBox {
  type: CriticalElementType;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ValidationViolation {
  elementType: CriticalElementType;
  elementText?: string;
  reason: string;
  details: {
    elementBox: { x: number; y: number; width: number; height: number };
    violatedBoundary: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'CANVAS_OUT_OF_BOUNDS';
    allowedRange: { min: number; max: number };
    actualValue: number;
  };
}

export interface SafeAreaValidationResult {
  isValid: boolean;
  placement: MetaPlacementType;
  placementDimensions: { width: number; height: number };
  safeArea: PlacementSafeArea;
  elementsChecked: number;
  violations: ValidationViolation[];
}

/**
 * Validates whether all critical creative elements fall completely within
 * the configured safe area of the target placement.
 */
export function validateCreativeSafeArea(
  placementKey: MetaPlacementType,
  elements: CreativeElementBox[]
): SafeAreaValidationResult {
  const spec = META_PLACEMENT_SPECS[placementKey];
  if (!spec) {
    throw new Error('Unknown placement key: ' + placementKey);
  }

  const violations: ValidationViolation[] = [];
  const { width: canvasWidth, height: canvasHeight, contentBounds } = spec;

  for (const el of elements) {
    const elMinX = el.x;
    const elMaxX = el.x + el.width;
    const elMinY = el.y;
    const elMaxY = el.y + el.height;

    // 1. Check canvas bounds (canvas out-of-bounds)
    if (elMinX < 0 || elMaxX > canvasWidth || elMinY < 0 || elMaxY > canvasHeight) {
      violations.push({
        elementType: el.type,
        elementText: el.text,
        reason: 'Element ' + el.type + ' extends outside the canvas dimensions (' + canvasWidth + 'x' + canvasHeight + ').',
        details: {
          elementBox: { x: el.x, y: el.y, width: el.width, height: el.height },
          violatedBoundary: 'CANVAS_OUT_OF_BOUNDS',
          allowedRange: { min: 0, max: canvasWidth },
          actualValue: elMinX < 0 ? elMinX : elMaxX
        }
      });
      continue;
    }

    // 2. Check top safe area
    if (elMinY < contentBounds.minY) {
      violations.push({
        elementType: el.type,
        elementText: el.text,
        reason: 'Element ' + el.type + ' breaches TOP safe area (Y: ' + elMinY + ' < MinY: ' + contentBounds.minY + ').',
        details: {
          elementBox: { x: el.x, y: el.y, width: el.width, height: el.height },
          violatedBoundary: 'TOP',
          allowedRange: { min: contentBounds.minY, max: contentBounds.maxY },
          actualValue: elMinY
        }
      });
    }

    // 3. Check bottom safe area
    if (elMaxY > contentBounds.maxY) {
      violations.push({
        elementType: el.type,
        elementText: el.text,
        reason: 'Element ' + el.type + ' breaches BOTTOM safe area (Y+H: ' + elMaxY + ' > MaxY: ' + contentBounds.maxY + ').',
        details: {
          elementBox: { x: el.x, y: el.y, width: el.width, height: el.height },
          violatedBoundary: 'BOTTOM',
          allowedRange: { min: contentBounds.minY, max: contentBounds.maxY },
          actualValue: elMaxY
        }
      });
    }

    // 4. Check left safe area
    if (elMinX < contentBounds.minX) {
      violations.push({
        elementType: el.type,
        elementText: el.text,
        reason: 'Element ' + el.type + ' breaches LEFT safe area (X: ' + elMinX + ' < MinX: ' + contentBounds.minX + ').',
        details: {
          elementBox: { x: el.x, y: el.y, width: el.width, height: el.height },
          violatedBoundary: 'LEFT',
          allowedRange: { min: contentBounds.minX, max: contentBounds.maxX },
          actualValue: elMinX
        }
      });
    }

    // 5. Check right safe area
    if (elMaxX > contentBounds.maxX) {
      violations.push({
        elementType: el.type,
        elementText: el.text,
        reason: 'Element ' + el.type + ' breaches RIGHT safe area (X+W: ' + elMaxX + ' > MaxX: ' + contentBounds.maxX + ').',
        details: {
          elementBox: { x: el.x, y: el.y, width: el.width, height: el.height },
          violatedBoundary: 'RIGHT',
          allowedRange: { min: contentBounds.minX, max: contentBounds.maxX },
          actualValue: elMaxX
        }
      });
    }
  }

  return {
    isValid: violations.length === 0,
    placement: placementKey,
    placementDimensions: { width: canvasWidth, height: canvasHeight },
    safeArea: spec.safeArea,
    elementsChecked: elements.length,
    violations
  };
}

export interface CreativeConceptData {
  id: string;
  name: string;
  backgroundImageDataUrl: string;
  badge: string;
  headline: string;
  subtitle: string;
  ctaText: string;
  priceTag: string;
}

/**
 * Generates placement-adapted HTML/CSS layout for a creative concept.
 * Tailors typography, padding, gradients, and element positioning specifically
 * for 1:1 Square, 4:5 Portrait, and 9:16 Story/Reel.
 */
export function generatePlacementHTML(concept: CreativeConceptData, placement: MetaPlacementType): string {
  const spec = META_PLACEMENT_SPECS[placement];
  const { width, height } = spec;

  let headerTop = '80px';
  let footerBottom = '80px';
  let sidePadding = '80px';
  let headlineFontSize = '54px';
  let headlineLineHeight = '1.12';
  let subtitleFontSize = '22px';
  let ctaFontSize = '22px';
  let ctaPadding = '22px 42px';
  let badgePadding = '9px 20px';
  let badgeFontSize = '14px';
  let topGradientHeight = '560px';
  let bottomGradientHeight = '420px';

  if (placement === 'META_FEED_SQUARE') {
    headerTop = '70px';
    footerBottom = '70px';
    sidePadding = '70px';
    headlineFontSize = '48px';
    headlineLineHeight = '1.14';
    subtitleFontSize = '20px';
    ctaFontSize = '20px';
    ctaPadding = '18px 36px';
    badgePadding = '8px 18px';
    badgeFontSize = '13px';
    topGradientHeight = '480px';
    bottomGradientHeight = '380px';
  } else if (placement === 'META_STORY_REEL') {
    headerTop = '265px';   // Respect Story header safe area (>250px)
    footerBottom = '295px'; // Respect Story footer safe area (>280px from bottom, maxY <= 1625px)
    sidePadding = '80px';
    headlineFontSize = '62px';
    headlineLineHeight = '1.12';
    subtitleFontSize = '24px';
    ctaFontSize = '24px';
    ctaPadding = '24px 48px';
    badgePadding = '10px 22px';
    badgeFontSize = '15px';
    topGradientHeight = '800px';
    bottomGradientHeight = '680px';
  }

  return '<!DOCTYPE html>\n' +
'<html lang="pt-BR">\n' +
'<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <style>\n' +
'    * { margin: 0; padding: 0; box-sizing: border-box; }\n' +
'    body {\n' +
'      width: ' + width + 'px;\n' +
'      height: ' + height + 'px;\n' +
'      position: relative;\n' +
'      overflow: hidden;\n' +
'      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\n' +
'      background-color: #0b0f19;\n' +
'    }\n' +
'    .bg-image {\n' +
'      position: absolute;\n' +
'      top: 0;\n' +
'      left: 0;\n' +
'      width: 100%;\n' +
'      height: 100%;\n' +
'      object-fit: cover;\n' +
'    }\n' +
'    .gradient-top {\n' +
'      position: absolute;\n' +
'      top: 0;\n' +
'      left: 0;\n' +
'      width: 100%;\n' +
'      height: ' + topGradientHeight + ';\n' +
'      background: linear-gradient(180deg, rgba(7, 10, 18, 0.95) 0%, rgba(7, 10, 18, 0.75) 60%, rgba(7, 10, 18, 0) 100%);\n' +
'    }\n' +
'    .gradient-bottom {\n' +
'      position: absolute;\n' +
'      bottom: 0;\n' +
'      left: 0;\n' +
'      width: 100%;\n' +
'      height: ' + bottomGradientHeight + ';\n' +
'      background: linear-gradient(0deg, rgba(7, 10, 18, 0.96) 0%, rgba(7, 10, 18, 0.8) 55%, rgba(7, 10, 18, 0) 100%);\n' +
'    }\n' +
'    .header-zone {\n' +
'      position: absolute;\n' +
'      top: ' + headerTop + ';\n' +
'      left: ' + sidePadding + ';\n' +
'      right: ' + sidePadding + ';\n' +
'      z-index: 10;\n' +
'      display: flex;\n' +
'      flex-direction: column;\n' +
'      gap: 16px;\n' +
'    }\n' +
'    .badge-pill {\n' +
'      align-self: flex-start;\n' +
'      padding: ' + badgePadding + ';\n' +
'      background: rgba(217, 119, 6, 0.3);\n' +
'      border: 1.5px solid rgba(245, 158, 11, 0.7);\n' +
'      border-radius: 30px;\n' +
'      color: #fbbf24;\n' +
'      font-size: ' + badgeFontSize + ';\n' +
'      font-weight: 800;\n' +
'      letter-spacing: 2px;\n' +
'      text-transform: uppercase;\n' +
'    }\n' +
'    .headline-title {\n' +
'      font-family: "Georgia", "Times New Roman", serif;\n' +
'      font-size: ' + headlineFontSize + ';\n' +
'      line-height: ' + headlineLineHeight + ';\n' +
'      font-weight: 900;\n' +
'      color: #ffffff;\n' +
'      text-shadow: 0 4px 18px rgba(0, 0, 0, 0.9);\n' +
'      max-width: 920px;\n' +
'    }\n' +
'    .subtitle-desc {\n' +
'      font-size: ' + subtitleFontSize + ';\n' +
'      line-height: 1.45;\n' +
'      font-weight: 600;\n' +
'      color: #e2e8f0;\n' +
'      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.85);\n' +
'      max-width: 860px;\n' +
'    }\n' +
'    .footer-zone {\n' +
'      position: absolute;\n' +
'      bottom: ' + footerBottom + ';\n' +
'      left: ' + sidePadding + ';\n' +
'      right: ' + sidePadding + ';\n' +
'      z-index: 10;\n' +
'      display: flex;\n' +
'      align-items: center;\n' +
'      justify-content: space-between;\n' +
'      gap: 20px;\n' +
'    }\n' +
'    .cta-btn {\n' +
'      padding: ' + ctaPadding + ';\n' +
'      background: linear-gradient(135deg, #d97706 0%, #b45309 100%);\n' +
'      border: 2px solid #fde68a;\n' +
'      border-radius: 14px;\n' +
'      color: #ffffff;\n' +
'      font-size: ' + ctaFontSize + ';\n' +
'      font-weight: 800;\n' +
'      letter-spacing: 0.5px;\n' +
'      white-space: nowrap;\n' +
'    }\n' +
'    .price-badge {\n' +
'      padding: 16px 24px;\n' +
'      background: rgba(15, 23, 42, 0.92);\n' +
'      border: 1px solid rgba(255, 255, 255, 0.25);\n' +
'      border-radius: 12px;\n' +
'      color: #f8fafc;\n' +
'      font-size: 18px;\n' +
'      font-weight: 700;\n' +
'      white-space: nowrap;\n' +
'    }\n' +
'  </style>\n' +
'</head>\n' +
'<body>\n' +
'  <img src="' + concept.backgroundImageDataUrl + '" class="bg-image" />\n' +
'  <div class="gradient-top"></div>\n' +
'  <div class="gradient-bottom"></div>\n' +
'  <div class="header-zone">\n' +
'    <div class="badge-pill">' + concept.badge + '</div>\n' +
'    <h1 class="headline-title">' + concept.headline + '</h1>\n' +
'    <p class="subtitle-desc">' + concept.subtitle + '</p>\n' +
'  </div>\n' +
'  <div class="footer-zone">\n' +
'    <div class="cta-btn">' + concept.ctaText + '</div>\n' +
'    <div class="price-badge">' + concept.priceTag + '</div>\n' +
'  </div>\n' +
'</body>\n' +
'</html>';
}
