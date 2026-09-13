import { describe, expect, it } from 'vitest';

import { variantTabLabel } from '../variant-label';
import type { Variant } from '../../../data/models';

/** Une déclinaison réduite à ce que le libellé regarde. */
function variant(overrides: Partial<Variant>): Variant {
  return {
    id: 'var_1',
    sku: 'CHO-001-2',
    name: { fr: 'Boîte de 220 g' },
    isDefault: false,
    isDiscontinued: false,
    position: 1,
    priceCents: null,
    weightGrams: null,
    regulatoryFollowsDefault: true,
    pricingFollowsDefault: true,
    allergens: null,
    nutrition: null,
    ...overrides,
  } as Variant;
}

describe('le libellé d’un onglet de déclinaison', () => {
  /**
   * 🔴 Régression : l'onglet rendait « Déclinaison 2 » — le rang — alors que le
   * nom était saisi à la création, gardé en base et poussé aux canaux. Un champ
   * obligatoire qui n'apparaît nulle part ensuite se lit comme une saisie perdue.
   */
  it('montre le nom saisi', () => {
    expect(variantTabLabel(variant({}))).toBe('Boîte de 220 g');
  });

  /**
   * Le défaut n'est plus une exception : son nom part aux canaux comme les
   * autres, et le masquer derrière son rôle rendait invisible la seule
   * déclinaison qu'on ne pouvait déjà pas corriger. Le rôle se dit à côté.
   */
  it('montre aussi celui de la déclinaison par défaut', () => {
    expect(variantTabLabel(variant({ isDefault: true, name: { fr: 'Gros florentin lait' } }))).toBe(
      'Gros florentin lait',
    );
  });

  /**
   * Une fiche semée ou importée peut porter un nom vide, et un onglet muet
   * serait pire qu'un libellé générique. Le rang redevient alors le repli —
   * affiché à partir de 1, comme la référence le suffixe.
   */
  it('retombe sur le rang quand le nom est vide', () => {
    expect(variantTabLabel(variant({ name: { fr: '   ' }, position: 1 }))).toBe('Déclinaison 2');
  });

  it('retombe sur « Défaut » quand le défaut n’a pas de nom', () => {
    expect(variantTabLabel(variant({ isDefault: true, name: { fr: '' } }))).toBe('Défaut');
  });
});
