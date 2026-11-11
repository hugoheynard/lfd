import { HttpErrorResponse } from '@angular/common/http';

import type { CustomerShelfPricesView } from '@lfd/contracts';
import { formatCents, formatMillicents } from '@lfd/b2b-ui/order';

import { serverMessageOf } from '../../production/server-message';

/**
 * **Le prix du rayon du client, posé sur la liste de la saisie** — partagé par
 * la nouvelle commande et sa modification, qui ne doivent pas diverger (plan
 * `documentation/commandes/passation/plan-liste-au-prix-du-client.md`, L2 et L2b).
 *
 * Aucune arithmétique de prix : on choisit le nombre que le serveur a déjà
 * calculé (HT pour un pro, TTC pour un particulier) et on le formate.
 */

/** Ce que la liste dit d'un article une fois la table de ce client posée dessus. */
export type ShelfPricing =
  | {
      readonly kind: 'priced';
      /** Le prix du client, déjà formaté, dans l'unité de son audience. */
      readonly price: string;
      /** Le prix barré, formaté pareil ; `null` s'il n'y a rien à barrer. */
      readonly struckFrom: string | null;
      readonly suffix: 'HT' | 'TTC';
      /** Le prix HT du client, en millicentimes — ce que la ligne du panier garde en attendant l'estimation. */
      readonly unitPriceMillicents: number;
    }
  | { readonly kind: 'locked' }
  | { readonly kind: 'absent' };

/** Les mots d'une rangée qui ne s'ajoute pas, selon la raison. */
export const LOCKED_LABEL = 'Réservé à un autre compte';
export const ABSENT_LABEL = 'Pas proposé à ce client';

/** Le bandeau quand la table n'a pas pu être lue : la liste reste au prix d'étiquette. */
export const SHELF_PRICES_UNAVAILABLE = 'Prix de ce client indisponibles : le panier fait foi.';

/** La table indexée par SKU, ou `null` tant qu'elle n'est pas là (ou a échoué). */
export type ShelfPriceIndex = ReadonlyMap<string, ShelfPricing>;

/** Indexe la table du serveur par SKU, au prix de son audience. */
export function shelfPriceIndexOf(view: CustomerShelfPricesView | null): ShelfPriceIndex | null {
  if (view === null) {
    return null;
  }
  const pro = view.audience === 'pro';
  return new Map(
    view.items.map((item): [string, ShelfPricing] => {
      if (item.lockedReason !== null) {
        return [item.sku, { kind: 'locked' }];
      }
      const struck = pro ? item.struckFromMillicents : item.struckFromTtcCents;
      return [
        item.sku,
        {
          kind: 'priced',
          price: pro
            ? formatMillicents(item.unitPriceMillicents)
            : formatCents(item.unitPriceTtcCents),
          struckFrom: struck === null ? null : pro ? formatMillicents(struck) : formatCents(struck),
          suffix: pro ? 'HT' : 'TTC',
          unitPriceMillicents: item.unitPriceMillicents,
        },
      ];
    }),
  );
}

/**
 * Le sort d'un SKU : son prix, son verrou, ou son absence du rayon. `null` quand
 * il n'y a pas de table — la liste garde alors le prix d'étiquette.
 */
export function shelfPricingOf(index: ShelfPriceIndex | null, sku: string): ShelfPricing | null {
  if (index === null) {
    return null;
  }
  return index.get(sku) ?? { kind: 'absent' };
}

/**
 * L'issue de la lecture : la table, ce que le bandeau doit dire de son échec,
 * ou rien du tout quand il n'y a pas de rayon à lire (un particulier).
 */
export type ShelfPricesLoad =
  | { readonly prices: CustomerShelfPricesView; readonly failure: null }
  | { readonly prices: null; readonly failure: string | null };

/** Pas de rayon à lire : la liste reste au prix d'étiquette, sans bandeau. */
export const NO_SHELF_PRICES: ShelfPricesLoad = { prices: null, failure: null };

/**
 * Lit la table sans jamais rejeter : son échec ne doit pas faire tomber
 * l'écran, seulement le dire. Un 409 (compte résilié) porte le message du
 * serveur ; tout autre échec, le bandeau générique.
 */
export async function loadShelfPrices(
  read: () => Promise<CustomerShelfPricesView>,
): Promise<ShelfPricesLoad> {
  try {
    return { prices: await read(), failure: null };
  } catch (error) {
    const conflict = error instanceof HttpErrorResponse && error.status === 409;
    return {
      prices: null,
      failure: conflict
        ? `${SHELF_PRICES_UNAVAILABLE} ${serverMessageOf(error)}`
        : SHELF_PRICES_UNAVAILABLE,
    };
  }
}
