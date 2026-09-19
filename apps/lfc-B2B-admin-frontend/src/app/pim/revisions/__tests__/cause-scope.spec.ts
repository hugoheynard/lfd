import type { CatalogRevisionCauseView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { causeScope } from '../revision-diff/cause-scope';

/**
 * La portée d'une cause au-dessus du diff : chaque contexte sous le nom qu'il
 * portait le jour du fait, puis sous le mot du dictionnaire, puis sous sa clé.
 */
function cause(over: Partial<CatalogRevisionCauseView>): CatalogRevisionCauseView {
  return {
    type: 'vat_rate.rate_changed',
    label: 'Intermédiaire : 10 → 10.1',
    by: 'Colette Martin',
    at: '2026-09-01T09:00:00.000Z',
    explains: ['vatByContext'],
    blast: {},
    ...over,
  };
}

describe('la portée d’une cause', () => {
  /**
   * Régression : l'écran disait « brunch : 1 » — la clé du contexte, pas son
   * nom — alors que le fait porte le libellé du moment depuis le lot D.
   */
  it('nomme un contexte par le libellé figé dans le fait', () => {
    expect(
      causeScope(cause({ blast: { brunch: 1 }, contextLabels: { brunch: 'Le brunch' } })),
    ).toBe('Le brunch : 1');
  });

  it('préfère le libellé figé au dictionnaire, même pour un contexte qu’il connaît', () => {
    expect(
      causeScope(
        cause({ blast: { takeaway: 2 }, contextLabels: { takeaway: 'Vente à emporter' } }),
      ),
    ).toBe('Vente à emporter : 2');
  });

  it('retombe sur le dictionnaire quand la cause ne porte pas de libellés (ligne d’avant)', () => {
    expect(causeScope(cause({ blast: { takeaway: 2, eatIn: 1, b2b: 3 } }))).toBe(
      'À emporter : 2 · Sur place : 1 · B2B : 3',
    );
  });

  it('nomme la portée d’août, qui n’a pas de libellé figé', () => {
    expect(
      causeScope(cause({ blast: { familiesEmporter: 2, familiesSurPlace: 0, familiesB2b: 1 } })),
    ).toBe('Familles à emporter : 2 · Familles sur place : 0 · Familles B2B : 1');
  });

  it('dit la clé brute d’un contexte que personne ne nomme', () => {
    expect(causeScope(cause({ blast: { brunch: 1 }, contextLabels: {} }))).toBe('brunch : 1');
  });

  it('ne dit rien quand la portée n’a pas été enregistrée', () => {
    expect(causeScope(cause({ blast: {} }))).toBe('');
  });
});
