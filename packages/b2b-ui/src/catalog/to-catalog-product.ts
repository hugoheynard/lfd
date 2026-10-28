import type { CatalogItemView } from '@lfd/contracts';

import { formatMillicents } from '../order/order-format';
import type { CatalogProduct } from './catalog-product.model';
import { firstSaleQuantityOf, saleStepOf, saleUnitOf } from './sale-terms';

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
  const base = {
    id: item.sku,
    name: item.name,
    price: formatMillicents(item.unitPriceMillicents),
  };
  if (saleUnitOf(item) === 'piece') {
    return base;
  }
  // Au poids (P5) : le prix est au kilo, la quantité en grammes, au pas et au
  // minimum de l'article. Sans pas, le serveur refuse toute quantité : la
  // rangée ne propose pas l'ajout plutôt que d'inventer un pas.
  const step = saleStepOf(item);
  const minimum = firstSaleQuantityOf(item);
  return step === null || minimum === null
    ? { ...base, unit: '/ kg', saleUnit: 'weight', outOfStock: true }
    : { ...base, unit: '/ kg', saleUnit: 'weight', step, minimum };
}
