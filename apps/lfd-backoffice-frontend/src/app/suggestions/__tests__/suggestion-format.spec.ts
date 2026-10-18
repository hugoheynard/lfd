import type { StaffSuggestionRuleView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { staffSuggestion } from '../staff-suggestion.testing';
import { countersWindow, placementOptions } from '../suggestion-format';

describe('ce que l’écran dit d’une suggestion', () => {
  it('ferme les emplacements que le « Quand » rend impossibles, en disant pourquoi', () => {
    const options = placementOptions('product_in_cart');
    expect(options.map((one) => one.value)).toEqual(['home', 'cart', 'product']);
    expect(options.find((one) => one.value === 'cart')?.disabled).toBeUndefined();
    const home = options.find((one) => one.value === 'home');
    expect(home?.disabled).toBe(true);
    expect(home?.label).toBe(
      'Sur l’accueil — impossible ici : l’accueil ne montre ni panier ni fiche',
    );
    expect(placementOptions('everywhere').every((one) => one.disabled !== true)).toBe(true);
  });

  it('compte depuis la plus ancienne règle commencée, et rien si aucune ne l’est', () => {
    const rules: StaffSuggestionRuleView[] = [
      staffSuggestion({ startsOn: '2026-10-10' }),
      staffSuggestion({ startsOn: '2026-10-05' }),
      staffSuggestion({ startsOn: '2026-11-01' }),
    ];
    expect(countersWindow(rules, '2026-10-18')).toEqual({ from: '2026-10-05', to: '2026-10-18' });
    expect(countersWindow([staffSuggestion({ startsOn: '2026-11-01' })], '2026-10-18')).toBeNull();
  });
});
