import type { CatalogItemView } from '@lfd/contracts';

import { formatMillicents } from '../order/order-format';
import type { CatalogProduct } from './catalog-product.model';

/**
 * Un article du **catalogue serveur** en produit affichable.
 *
 * La seule couture entre le contrat de fil et la présentation, et elle tient en
 * un endroit : c'est ici qu'on décide que le prix affiché est celui du serveur,
 * formaté une fois. Deux écrans qui feraient chacun leur conversion finiraient
 * par afficher deux prix — l'un formaté depuis les centimes, l'autre depuis un
 * seed.
 *
 * Ce que la conversion **n'invente pas** : ni visuel, ni colisage, ni rupture.
 * Le catalogue serveur ne les porte pas encore ; les fabriquer ici les rendrait
 * indiscernables de vraies données. L'appelant qui en dispose (le front client
 * et ses illustrations) enrichit le produit après coup.
 */
export function toCatalogProduct(item: CatalogItemView): CatalogProduct {
  return {
    id: item.sku,
    name: item.name,
    price: formatMillicents(item.unitPriceMillicents),
  };
}
