import { describe, expect, it } from 'vitest';
import type { PointOfSaleView, SalesContextView } from '@lfd/pim-contracts';

import { soldContexts } from '../sold-contexts';
import type { SalesChannels } from '../../data/models';

/** Le registre, dans le désordre : c'est `position` qui range, pas la liste. */
const CONTEXTS: readonly SalesContextView[] = [
  { key: 'b2b', label: 'B2B', position: 3 },
  { key: 'takeaway', label: 'À emporter', position: 1 },
  { key: 'eatIn', label: 'Sur place', position: 2 },
];

const POINTS = [
  { id: 'pos_labo', label: 'Labo' },
  { id: 'pos_village', label: 'Village' },
  { id: 'pos_b2b', label: 'Plateforme pro' },
] as unknown as readonly PointOfSaleView[];

const channels = (...pairs: readonly [string, string][]): SalesChannels =>
  pairs.map(([pointOfSaleId, context]) => ({ pointOfSaleId, context }));

describe('où une fiche se vend', () => {
  /**
   * 🔴 Le test de la panne. La colonne « Canaux » interrogeait deux clés écrites
   * en dur, `takeaway` et `eatIn`, et rendait « aucun » quand les deux étaient
   * vides. Une fiche vendue en B2B — le canal principal de la plateforme —
   * s'affichait donc « aucun » (audit 2026-09-01).
   */
  it('voit un contexte que personne n’avait codé en dur — le B2B', () => {
    const sold = soldContexts(channels(['pos_b2b', 'b2b']), CONTEXTS, POINTS);

    expect(sold).toEqual([{ key: 'b2b', label: 'B2B', locations: ['Plateforme pro'] }]);
  });

  it('ne rend vide QUE lorsque la fiche n’est vendue nulle part', () => {
    expect(soldContexts([], CONTEXTS, POINTS)).toEqual([]);
  });

  it('range par la position du registre, pas par l’ordre reçu', () => {
    const sold = soldContexts(
      channels(['pos_b2b', 'b2b'], ['pos_labo', 'takeaway'], ['pos_labo', 'eatIn']),
      CONTEXTS,
      POINTS,
    );

    expect(sold.map((context) => context.key)).toEqual(['takeaway', 'eatIn', 'b2b']);
  });

  it('groupe les lieux d’un même contexte, dans l’ordre du référentiel', () => {
    const sold = soldContexts(
      channels(['pos_village', 'takeaway'], ['pos_labo', 'takeaway']),
      CONTEXTS,
      POINTS,
    );

    expect(sold[0]?.locations).toEqual(['Labo', 'Village']);
  });

  it('omet un contexte que rien ne vend, au lieu de le rendre vide', () => {
    const sold = soldContexts(channels(['pos_labo', 'takeaway']), CONTEXTS, POINTS);

    expect(sold.map((context) => context.key)).toEqual(['takeaway']);
  });

  /**
   * Un contexte ajouté à l'écran des contextes doit apparaître **sans toucher au
   * code** — c'est exactement ce que deux clés en dur rendaient impossible.
   */
  it('affiche un contexte que le registre vient de gagner', () => {
    const withDrive = [...CONTEXTS, { key: 'drive', label: 'Drive', position: 4 }];

    const sold = soldContexts(channels(['pos_village', 'drive']), withDrive, POINTS);

    expect(sold).toEqual([{ key: 'drive', label: 'Drive', locations: ['Village'] }]);
  });

  /**
   * Le point de vente d'un canal peut avoir été retiré du référentiel. On ignore
   * la clé plutôt que d'inventer un nom — mais le contexte disparaît alors de la
   * liste, faute de lieu à nommer.
   */
  it('ignore un point de vente que le référentiel ne connaît plus', () => {
    const sold = soldContexts(channels(['pos_disparu', 'takeaway']), CONTEXTS, POINTS);

    expect(sold).toEqual([]);
  });
});
