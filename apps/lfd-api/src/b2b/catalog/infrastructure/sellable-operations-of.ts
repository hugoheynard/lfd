import { operationAsHeld } from "../domain/effective-operation.js";
import type { SellableOperation } from "../domain/ports/catalog-operations.reader.js";
import { toOperationState, type OperationRow } from "./catalog-operation-rows.js";

/** Une ligne d'opération, avec ce que le commerce tient à côté de ses faits. */
export interface HeldOperationRow extends OperationRow {
  readonly hidden: boolean;
  readonly showsOrderUntilTime: boolean;
}

/**
 * **Ce que les vendeurs appliquent**, tiré des lignes d'opérations non
 * retirées : les opérations TENUES, sans celles qu'on ne tient pas — masquées,
 * ou dont la clientèle ne recouvre plus personne.
 *
 * Une seule règle pour deux sources : la lecture en base
 * (`PrismaCatalogOperationsReader`) et le morceau `operations` de
 * l'instantané (lot M2). Deux copies divergeraient. Le texte alternatif des
 * images n'est PAS ici : il vient de la médiathèque (`withLibraryAlts`).
 */
export function sellableOperationsOf(rows: readonly HeldOperationRow[]): SellableOperation[] {
  const sellable: SellableOperation[] = [];
  for (const row of rows) {
    const { facts } = toOperationState(row);
    const held = operationAsHeld(facts, row.hidden);
    if (held.isHidden || held.audience === "none") {
      continue;
    }
    sellable.push({
      key: facts.key,
      name: facts.name,
      lede: facts.lede,
      image: facts.image,
      announceFrom: facts.announceFrom,
      orderFrom: facts.orderFrom,
      orderUntil: held.orderUntil,
      pickupFrom: facts.pickupFrom,
      pickupUntil: facts.pickupUntil,
      audience: held.audience,
      skus: held.skus,
      showsOrderUntilTime: row.showsOrderUntilTime,
    });
  }
  return sellable;
}
