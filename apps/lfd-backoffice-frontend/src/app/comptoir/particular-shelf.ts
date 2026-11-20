import type { CatalogItemView, CustomerShelfPricesView } from '@lfd/contracts';

/**
 * **La liste d'un particulier au comptoir : son rayon, et rien d'autre**
 * (`plan-commande-particulier-reglee-en-boutique.md`, § 5 — ne pas mélanger
 * les prix des deux clientèles).
 *
 * Le rayon public décide CE QUI se propose et À QUEL PRIX ; le catalogue de
 * l'équipe ne prête que la description de la rangée (famille, unité de vente,
 * pas). Un article absent du rayon — réservé à une société, pas vendu aux
 * particuliers — n'est pas montré du tout, plutôt que montré « non proposé ».
 */
export function particularShelfOf(
  catalogue: readonly CatalogItemView[],
  prices: CustomerShelfPricesView,
): readonly CatalogItemView[] {
  const onShelf = new Set(
    prices.items.filter((item) => item.lockedReason === null).map((item) => item.sku),
  );
  return catalogue.filter((item) => onShelf.has(item.sku));
}
