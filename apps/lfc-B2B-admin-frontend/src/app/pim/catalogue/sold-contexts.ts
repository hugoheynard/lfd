import type { PointOfSaleView, SalesContextView } from '@lfd/pim-contracts';

import { pointsOfSaleSelling } from '../data/channels';
import type { SalesChannels } from '../data/models';

/** Un contexte où la fiche se vend, et les lieux qui l'y offrent. */
export interface SoldContext {
  readonly key: string;
  /** Le libellé du REGISTRE — réglable à l'écran des contextes, jamais deviné. */
  readonly label: string;
  /** Les points de vente qui l'offrent, dans l'ordre du référentiel. */
  readonly locations: readonly string[];
}

/**
 * **Où cette fiche se vend**, tous contextes confondus.
 *
 * 🔴 « Tous », et c'est toute la raison d'être de cette fonction. La colonne
 * « Canaux » de la liste produits interrogeait **deux clés écrites en dur** —
 * `takeaway` et `eatIn` — et affichait « aucun » quand les deux étaient vides.
 * Un produit vendu **en B2B** s'y affichait donc « aucun » : sur une plateforme
 * dont le B2B est le canal principal, la colonne qui répond à « où ce produit
 * se vend-il » se trompait sur le cas le plus courant (audit 2026-09-01, §1 des
 * suites).
 *
 * Le registre des contextes est une DONNÉE — on en ajoute un depuis l'écran des
 * contextes, on le réordonne, on le renomme. Deux clés en dur dans un gabarit ne
 * pouvaient que vieillir, et vieillir en silence : rien ne casse quand un
 * contexte nouveau n'est affiché nulle part, il devient simplement invisible.
 *
 * Un contexte sans aucun point de vente n'entre pas dans la liste : le résultat
 * vide veut dire « vendue nulle part », sans avoir à le déduire de N listes
 * vides. L'ordre est celui du registre (`position`), donc réglable lui aussi.
 */
export function soldContexts(
  channels: SalesChannels,
  contexts: readonly SalesContextView[],
  pointsOfSale: readonly PointOfSaleView[],
): readonly SoldContext[] {
  return [...contexts]
    .sort((a, b) => a.position - b.position)
    .flatMap((context) => {
      const locations = pointsOfSaleSelling(channels, context.key, pointsOfSale);
      return locations.length === 0 ? [] : [{ key: context.key, label: context.label, locations }];
    });
}
