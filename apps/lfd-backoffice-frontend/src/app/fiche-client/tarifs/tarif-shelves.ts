import type { CompanyPricingCategoryView, ItemElasticityView } from '@lfd/contracts';

import {
  mercurialeRow,
  type MercurialeRow,
} from '../../commercial/tarification/grille/mercuriale-row';
import { eurosIn, millicentsIn, type DraftPrices } from './draft-prices';
import { liveEffort } from './live-effort';
import { openRoomMillicents } from './negotiation-room';

/**
 * Une ligne de la table de composition : ce que la grille dérive, **plus** ce
 * que seul le serveur sait — l'effort de vente, mesuré sur les commandes de ce
 * client.
 */
export interface TarifRow extends MercurialeRow {
  readonly elasticity: ItemElasticityView | null;
  /**
   * La latitude **avant** toute décision — tarif catalogue moins limite.
   * `null` sans limite posée. Cf. `negotiation-room.ts` pour pourquoi les deux
   * marges cohabitent dans la même colonne, et comment l'écran les distingue.
   */
  readonly openRoomMillicents: number | null;
  /** Le prix accordé **en euros**, tel que le champ le porte. `null` = non tarifé. */
  readonly priceEuros: number | null;
}

/** Un rayon, prêt pour sa table. */
export interface TarifShelf {
  readonly id: string;
  readonly name: string;
  readonly rows: readonly TarifRow[];
}

/** Les rayons de la composition, dérivés du catalogue et du brouillon. */
export function tarifShelves(
  categories: readonly CompanyPricingCategoryView[],
  draft: DraftPrices,
): readonly TarifShelf[] {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    rows: category.items.map((item) => {
      const row = mercurialeRow(item, millicentsIn(draft, item.sku));
      return {
        ...row,
        // L'effort suit le prix qu'on TAPE, pas celui qui est posé — et il
        // vise le prix FINAL, celui que la limite a relevé s'il le fallait :
        // c'est ce qui sera facturé, donc le seul dont l'effort soit réel.
        elasticity: liveEffort(item.elasticity, row.catalogMillicents, row.finalMillicents),
        openRoomMillicents: openRoomMillicents(row.catalogMillicents, row.floorMillicents),
        priceEuros: eurosIn(draft, item.sku),
      };
    }),
  }));
}
