import type { CartSuggestionsPayload } from '@lfd/contracts';

import type { ServiceChoice } from '../order-context.store';

/** Le jour visé d'une demande de suggestion — `null` tant que le client n'a rien choisi. */
export function suggestionTarget(choice: ServiceChoice | null): CartSuggestionsPayload['target'] {
  return choice === null
    ? null
    : {
        date: choice.date,
        pickupAddressId: choice.mode === 'pickup' ? choice.pickupAddressId : null,
      };
}

/** Les SKU au panier, triés : la clé d'une demande ne dépend pas de l'ordre d'ajout. */
export function cartSkus(quantities: Readonly<Record<string, number>>): string[] {
  return Object.keys(quantities)
    .filter((sku) => (quantities[sku] ?? 0) > 0)
    .sort();
}
