import type { ProductComplianceFinding } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import {
  complianceBadge,
  complianceStateOf,
  findingText,
  findingsText,
  gapLabel,
  isPrecautionary,
  worstSeverity,
} from './product-compliance';

const BLOCKING: ProductComplianceFinding = {
  code: 'variant_incomplete',
  severity: 'blocking',
  variantId: 'v1',
  sku: 'PAIN-1',
  missing: ['pro_price'],
};
const PRECAUTIONARY: ProductComplianceFinding = {
  code: 'allergens_precautionary',
  severity: 'warning',
  variantId: 'v3',
  sku: 'PAIN-3',
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
    expect(worstSeverity([INCOMPLETE, BLOCKING])).toBe('blocking');
    expect(worstSeverity([INCOMPLETE])).toBe('warning');
    expect(worstSeverity([])).toBeNull();
    expect(worstSeverity(undefined)).toBeNull();
  });

  it('peint « Bloquant » en alerte et « À vérifier » en avertissement', () => {
    expect(complianceBadge('non_compliant_live')).toEqual({
      label: 'Non conforme',
      variant: 'alert',
    });
    expect(complianceBadge('blocking')).toEqual({ label: 'Bloquant', variant: 'alert' });
    expect(complianceBadge('warning')).toEqual({ label: 'À vérifier', variant: 'warning' });
  });

  it('nomme les manques en français, contexte de TVA compris', () => {
    expect(gapLabel('price')).toBe('prix');
    expect(gapLabel('vat:takeaway')).toBe('taux de TVA à emporter');
    expect(gapLabel('vat:b2b')).toBe('taux de TVA B2B');
    expect(gapLabel('vat:inconnu')).toBe('taux de TVA « inconnu »');
    // Plus calculé depuis le 2026-10-27, relu dans des manques d'avant.
    expect(gapLabel('allergens')).toBe('allergènes');
    expect(gapLabel('autre')).toBe('autre');
  });

  it('dit la précaution et le manque, avec le SKU', () => {
    expect(findingText(PRECAUTIONARY)).toBe(
      'Déclinaison PAIN-3 — publiée sans information précise : traces de tous les allergènes ' +
        'du catalogue — déclarez ses allergènes pour lever ce constat.',
    );
    expect(findingText(INCOMPLETE)).toBe(
      'Déclinaison PAIN-2 — manque : prix, taux de TVA à emporter, taux de TVA « inconnu ».',
    );
  });

  it('la précaution n’est qu’un avertissement, et se repère', () => {
    expect(worstSeverity([PRECAUTIONARY])).toBe('warning');
    expect(isPrecautionary([INCOMPLETE, PRECAUTIONARY])).toBe(true);
    expect(isPrecautionary([INCOMPLETE])).toBe(false);
    expect(isPrecautionary(undefined)).toBe(false);
  });

  it('range les bloquants d’abord', () => {
    expect(findingsText([INCOMPLETE, BLOCKING]).startsWith('Déclinaison PAIN-1')).toBe(true);
  });

  /** Régression : une fiche publiée bloquante se disait « Bloquant » (2026-10-27). */
  it('une fiche publiée bloquante ne dit pas Bloquant : elle est non conforme en vente', () => {
    expect(complianceStateOf('published', [BLOCKING])).toBe('non_compliant_live');
    expect(complianceStateOf('draft', [BLOCKING])).toBe('blocking');
    expect(complianceStateOf('published', [INCOMPLETE])).toBe('warning');
    expect(complianceStateOf('published', undefined)).toBeNull();
  });

  it('le détail d’une fiche en vente commence par « En vente — à corriger : »', () => {
    expect(findingsText([BLOCKING], 'non_compliant_live')).toMatch(
      /^En vente — à corriger : Déclinaison PAIN-1/u,
    );
    expect(findingsText([BLOCKING], 'blocking')).toMatch(/^Déclinaison PAIN-1/u);
  });

  // `plan-prix-manquant-non-bloquant.md` (2026-10-27) : la table le dit.
  it('dit le prix manquant d’une fiche « les deux », et à qui elle se vend', () => {
    const noPro: ProductComplianceFinding = {
      code: 'price_missing_for_audience',
      severity: 'warning',
      variantId: 'v4',
      sku: 'PAIN-4',
      audience: 'pro',
    };
    const noPublic: ProductComplianceFinding = { ...noPro, audience: 'public' };

    expect(findingText(noPro)).toBe(
      'Déclinaison PAIN-4 — Prix pro manquant — vendu au public seul. ' +
        'Saisissez-le dans la section « Tarif ».',
    );
    expect(findingText(noPublic)).toBe(
      'Déclinaison PAIN-4 — Prix public manquant — vendu aux pros seuls. ' +
        'Saisissez-le dans la section « Tarif ».',
    );
    // Un avertissement : le filtre « À vérifier » le retrouve, rien ne bloque.
    expect(complianceStateOf('published', [noPro])).toBe('warning');
  });
});
