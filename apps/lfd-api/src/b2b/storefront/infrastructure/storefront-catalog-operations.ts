import type {
  StorefrontCatalogOperation,
  StorefrontCatalogShelf,
  StorefrontOperationState,
} from "@lfd/contracts";

import { effectiveOperation } from "../../catalog/domain/effective-operation.js";
import { opensAt, operationStateAt } from "../../catalog/domain/operation-access.js";
import type { ReceivedOperation } from "../../catalog/domain/ports/received-operations.reader.js";
import { OPERATION_SHELF_PREFIX } from "../domain/operation-link.js";

/**
 * Les opérations qu'une annonce peut désigner, pour l'éditeur (D11) : les
 * opérations reçues **non retirées**, dans l'ordre du lecteur (l'annonce la
 * plus récente d'abord), avec leur état à `now` et leurs dates EFFECTIVES.
 *
 * L'état se lit par `operationStateAt` du catalogue — la fenêtre que la
 * boutique applique ; ce qu'elle rend `null` se dit « en préparation » avant
 * l'annonce, « terminée » après. Masquée à la réception, ou sans clientèle :
 * `hidden`, quelle que soit la date.
 */
export function storefrontOperationsOf(
  received: readonly ReceivedOperation[],
  now: Date,
): StorefrontCatalogOperation[] {
  return received
    .filter((operation) => operation.withdrawnAt === null)
    .map(({ received: facts, override }) => {
      const effective = effectiveOperation(facts, override?.restriction ?? null);
      const dated = { ...facts, orderUntil: effective.orderUntil };
      return {
        key: facts.key,
        name: facts.name,
        lede: facts.lede,
        image: facts.image,
        state: stateOf(dated, effective.isHidden || effective.audience === "none", now),
        announceFrom: facts.announceFrom.toISOString(),
        orderFrom: opensAt(dated).toISOString(),
        orderUntil: effective.orderUntil.toISOString(),
        pickupFrom: facts.pickupFrom,
        pickupUntil: facts.pickupUntil,
      };
    });
}

/** Le rayon `op:<key>` de chaque opération proposée, nommé en français. */
export function operationShelvesOf(
  operations: readonly StorefrontCatalogOperation[],
): StorefrontCatalogShelf[] {
  return operations.map((operation) => ({
    key: `${OPERATION_SHELF_PREFIX}${operation.key}`,
    name: operation.name.fr,
    operation: true,
  }));
}

function stateOf(
  operation: ReceivedOperation["received"],
  hidden: boolean,
  now: Date,
): StorefrontOperationState {
  if (hidden) {
    return "hidden";
  }
  const shown = operationStateAt(operation, now);
  if (shown !== null) {
    return shown;
  }
  return now.getTime() < operation.announceFrom.getTime() ? "preparing" : "ended";
}
