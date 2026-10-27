import type { ProductComplianceFinding } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import {
  complianceBadge,
  findingText,
  findingsText,
  gapLabel,
  worstSeverity,
} from './product-compliance';

const label = (code: string): string => ({ AW: 'Gluten', ML: 'Lait' })[code] ?? code;

const CONTRADICTION: ProductComplianceFinding = {
  code: 'allergens_contradict_none',
  severity: 'blocking',
  variantId: 'v1',
  sku: 'PAIN-1',
  allergenCodes: ['AW', 'XX'],
};
const INCOMPLETE: ProductComplianceFinding = {
  code: 'variant_incomplete',
  severity: 'warning',
  variantId: 'v2',
  sku: 'PAIN-2',
  missing: ['price', 'vat:takeaway', 'vat:inconnu'],
};

describe('product-compliance', () => {
  it('un seul bloquant suffit à bloquer ; sans constat, rien', () => {
    expect(worstSeverity([INCOMPLETE, CONTRADICTION])).toBe('blocking');
    expect(worstSeverity([INCOMPLETE])).toBe('warning');
    expect(worstSeverity([])).toBeNull();
    expect(worstSeverity(undefined)).toBeNull();
  });

  it('peint « Bloquant » en alerte et « À vérifier » en avertissement', () => {
    expect(complianceBadge('blocking')).toEqual({ label: 'Bloquant', variant: 'alert' });
    expect(complianceBadge('warning')).toEqual({ label: 'À vérifier', variant: 'warning' });
  });

  it('nomme les manques en français, contexte de TVA compris', () => {
    expect(gapLabel('price')).toBe('prix');
    expect(gapLabel('vat:takeaway')).toBe('taux de TVA à emporter');
    expect(gapLabel('vat:b2b')).toBe('taux de TVA B2B');
    expect(gapLabel('vat:inconnu')).toBe('taux de TVA « inconnu »');
    expect(gapLabel('allergen_contradiction')).toBe(
      'déclaration d’allergènes cohérente avec la composition',
    );
    expect(gapLabel('autre')).toBe('autre');
  });

  it('dit la contradiction, le SKU, les allergènes et les gestes de sortie', () => {
    expect(findingText(CONTRADICTION, label)).toBe(
      "La composition contredit la déclaration d'allergènes (SKU PAIN-1) : Gluten, XX — " +
        "reprenez-la dans la fiche réglementaire, ou retirez l'ingrédient en cause.",
    );
    expect(findingText(INCOMPLETE, label)).toBe(
      'Déclinaison PAIN-2 — manque : prix, taux de TVA à emporter, taux de TVA « inconnu ».',
    );
  });

  it('range les bloquants d’abord', () => {
    expect(findingsText([INCOMPLETE, CONTRADICTION], label).startsWith('La composition')).toBe(
      true,
    );
  });
});
