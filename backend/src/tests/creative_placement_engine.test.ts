import { describe, it, expect } from 'vitest';
import {
  META_PLACEMENT_SPECS,
  validateCreativeSafeArea,
  generatePlacementHTML,
  CreativeElementBox,
  CreativeConceptData
} from '../services/creative/placementEngine';

describe('NORQVA — Meta Creative Multi-Placement Engine & Safe-Area Validator V1', () => {

  // 1. Placement Specifications Verification
  describe('Placement Specifications (1:1, 4:5, 9:16)', () => {
    it('defines META_FEED_SQUARE (1:1) accurately', () => {
      const square = META_PLACEMENT_SPECS.META_FEED_SQUARE;
      expect(square.width).toBe(1080);
      expect(square.height).toBe(1080);
      expect(square.aspectRatio).toBe('1:1');
      expect(square.safeArea.label).toBe('NORQVA_CONSERVATIVE_SAFE_AREA');
      expect(square.contentBounds.minX).toBe(60);
      expect(square.contentBounds.maxX).toBe(1020);
      expect(square.contentBounds.minY).toBe(60);
      expect(square.contentBounds.maxY).toBe(1020);
    });

    it('defines META_FEED_PORTRAIT (4:5) accurately', () => {
      const portrait = META_PLACEMENT_SPECS.META_FEED_PORTRAIT;
      expect(portrait.width).toBe(1080);
      expect(portrait.height).toBe(1350);
      expect(portrait.aspectRatio).toBe('4:5');
      expect(portrait.safeArea.label).toBe('NORQVA_CONSERVATIVE_SAFE_AREA');
      expect(portrait.contentBounds.minX).toBe(70);
      expect(portrait.contentBounds.maxX).toBe(1010);
      expect(portrait.contentBounds.minY).toBe(70);
      expect(portrait.contentBounds.maxY).toBe(1280);
    });

    it('defines META_STORY_REEL (9:16) with required UI top/bottom buffers', () => {
      const story = META_PLACEMENT_SPECS.META_STORY_REEL;
      expect(story.width).toBe(1080);
      expect(story.height).toBe(1920);
      expect(story.aspectRatio).toBe('9:16');
      expect(story.safeArea.label).toBe('NORQVA_CONSERVATIVE_SAFE_AREA');
      expect(story.safeArea.top).toBe(250);
      expect(story.safeArea.bottom).toBe(280);
      expect(story.contentBounds.minY).toBe(250);
      expect(story.contentBounds.maxY).toBe(1640);
    });
  });

  // 2. Safe Area Validation Engine
  describe('Safe Area Pre-flight Validation', () => {
    it('passes when all critical elements are strictly inside safe content bounds', () => {
      const validElements: CreativeElementBox[] = [
        { type: 'BRAND_IDENTIFIER', text: 'MÉTODO ARTESANAL', x: 80, y: 80, width: 300, height: 40 },
        { type: 'HEADLINE', text: 'O Segredo da Massa Perfeita', x: 80, y: 140, width: 800, height: 100 },
        { type: 'SUBHEADLINE', text: 'Proporções exatas das trattorias', x: 80, y: 260, width: 750, height: 60 },
        { type: 'CTA', text: 'Acessar Guia', x: 80, y: 1100, width: 300, height: 70 },
        { type: 'PRICE', text: 'R$ 47', x: 750, y: 1100, width: 200, height: 70 }
      ];

      const result = validateCreativeSafeArea('META_FEED_PORTRAIT', validElements);
      expect(result.isValid).toBe(true);
      expect(result.violations.length).toBe(0);
      expect(result.elementsChecked).toBe(5);
    });

    // Required Negative Tests: Intentionally invalid fixtures
    it('fails when CTA breaches the bottom safe boundary', () => {
      // In 4:5, canvas height is 1350, contentBounds.maxY is 1280.
      // y=1250, height=70 -> y+h=1320 (within canvas 1350, but breaches safe bottom 1280).
      const invalidCta: CreativeElementBox[] = [
        { type: 'CTA', text: 'Acessar Guia', x: 80, y: 1250, width: 300, height: 70 }
      ];

      const result = validateCreativeSafeArea('META_FEED_PORTRAIT', invalidCta);
      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0].elementType).toBe('CTA');
      expect(result.violations[0].details.violatedBoundary).toBe('BOTTOM');
    });

    it('fails when HEADLINE breaches the top safe boundary in Stories (9:16)', () => {
      // In 9:16, contentBounds.minY is 250.
      // y=120 < 250 -> breaches safe top.
      const invalidHeadline: CreativeElementBox[] = [
        { type: 'HEADLINE', text: 'Headline in story header danger zone', x: 80, y: 120, width: 700, height: 80 }
      ];

      const result = validateCreativeSafeArea('META_STORY_REEL', invalidHeadline);
      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0].elementType).toBe('HEADLINE');
      expect(result.violations[0].details.violatedBoundary).toBe('TOP');
    });

    it('fails when element extends completely outside canvas width', () => {
      const outOfBoundsEl: CreativeElementBox[] = [
        { type: 'PRICE', text: 'R$ 47', x: 950, y: 500, width: 250, height: 60 } // X+W = 1200 > 1080
      ];

      const result = validateCreativeSafeArea('META_FEED_SQUARE', outOfBoundsEl);
      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0].details.violatedBoundary).toBe('CANVAS_OUT_OF_BOUNDS');
    });
  });

  // 3. Placement-Adapted HTML Generator
  describe('Placement-Adapted Layout Rendering', () => {
    const concept: CreativeConceptData = {
      id: 'CONCEPT_A',
      name: 'Storytelling',
      backgroundImageDataUrl: 'data:image/jpeg;base64,mock',
      badge: 'MÉTODO ARTESANAL • 100% PRÁTICO',
      headline: 'O Segredo da Massa Perfeita Sem Máquinas Caras',
      subtitle: 'Aprenda as proporções exatas das trattorias italianas.',
      ctaText: 'Acessar Guia de Massas →',
      priceTag: 'Acesso Completo por R$ 47'
    };

    it('generates placement-specific canvas dimensions and styles for 1:1', () => {
      const html = generatePlacementHTML(concept, 'META_FEED_SQUARE');
      expect(html).toContain('width: 1080px');
      expect(html).toContain('height: 1080px');
      expect(html).toContain(concept.headline);
      expect(html).toContain(concept.ctaText);
      expect(html).toContain(concept.priceTag);
    });

    it('generates placement-specific canvas dimensions and styles for 4:5', () => {
      const html = generatePlacementHTML(concept, 'META_FEED_PORTRAIT');
      expect(html).toContain('width: 1080px');
      expect(html).toContain('height: 1350px');
      expect(html).toContain(concept.headline);
    });

    it('generates placement-specific canvas dimensions and safe top buffer for 9:16', () => {
      const html = generatePlacementHTML(concept, 'META_STORY_REEL');
      expect(html).toContain('width: 1080px');
      expect(html).toContain('height: 1920px');
      expect(html).toContain('top: 265px'); // story safe margin (>250px)
      expect(html).toContain('bottom: 295px'); // story bottom safe margin (>280px)
      expect(html).toContain(concept.headline);
    });
  });
});
