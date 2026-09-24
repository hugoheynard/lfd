import type { SyncOperation } from "@lfd/catalog-sync";

import type { CatalogOperationFacts, OperationText } from "../domain/entities/catalog-operation.js";
import { catalogOperationAudience } from "../domain/operation-audience.js";

/**
 * Une opération du fil vers les faits du miroir — les instants relus en
 * `Date`, les jours gardés tels quels (aucun fuseau n'y entre ici).
 *
 * La clientèle repasse par le domaine : le schéma du fil l'a déjà bornée, mais
 * le domaine ne suppose pas qu'on lui tend toujours un envoi validé.
 */
export function operationFactsOf(
  operation: SyncOperation,
  receivedAt: Date,
): CatalogOperationFacts {
  return {
    key: operation.key,
    name: textOf(operation.name),
    lede: operation.lede === null ? null : textOf(operation.lede),
    image: operation.image === null ? null : { url: operation.image.url, alt: operation.image.alt },
    announceFrom: new Date(operation.announceFrom),
    orderFrom: operation.orderFrom === null ? null : new Date(operation.orderFrom),
    orderUntil: new Date(operation.orderUntil),
    pickupFrom: operation.pickupFrom,
    pickupUntil: operation.pickupUntil,
    audience: catalogOperationAudience(operation.audience),
    skus: [...operation.skus],
    receivedAt,
  };
}

/** Les langues présentes seulement : `en: undefined` se compterait comme une traduction. */
function textOf(text: SyncOperation["name"]): OperationText {
  return {
    fr: text.fr,
    ...(text.en === undefined ? {} : { en: text.en }),
    ...(text.it === undefined ? {} : { it: text.it }),
  };
}
