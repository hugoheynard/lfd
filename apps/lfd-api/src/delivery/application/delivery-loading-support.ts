import type { LoadDeliveryBagPayload } from "@lfd/contracts";

import type { DeliveryOrdersReader } from "../channels/commerce/index.js";
import type { DeliveryBag } from "../domain/entities/delivery-bag.js";
import type { LoadVia } from "../domain/entities/stop-loading.js";
import {
  BagCodeExhaustedError,
  DeliveryBagNotFoundError,
} from "../domain/errors/delivery-loading-errors.js";
import { citeOrder, type CitedOrder } from "../domain/events/delivery-round.events.js";
import type { BagCodeDrawer } from "../domain/ports/bag-code-drawer.js";
import type { DeliveryBagRepository } from "../domain/ports/delivery-bag.repository.js";
import { bagCodeOf } from "../domain/value-objects/bag-code.js";
import { referencesOf } from "./delivery-round-support.js";

/**
 * Les gardes et tirages que plusieurs gestes du chargement partagent.
 */

/** Au-delà, un tirage qui ne trouve toujours pas de code libre est un défaut. */
const MAX_DRAWS = 5;

/**
 * Tire `count` codes libres (L4-C20) : distincts entre eux, et d'aucun sac
 * existant, annulé compris. Un code déjà pris est retiré.
 *
 * @throws {BagCodeExhaustedError}
 */
export async function drawBagCodes(
  drawer: BagCodeDrawer,
  bags: DeliveryBagRepository,
  count: number,
): Promise<readonly string[]> {
  const kept = new Set<string>();
  for (let attempt = 0; attempt < MAX_DRAWS && kept.size < count; attempt += 1) {
    // Un tirage par code manquant : un doublon ne relance pas la boucle, il
    // attend le tour suivant — une source d'aléa défaillante finit en refus,
    // jamais en boucle sans fin.
    const candidates = new Set<string>();
    const missing = count - kept.size;
    for (let draw = 0; draw < missing; draw += 1) {
      const code = drawer.draw();
      if (!kept.has(code)) {
        candidates.add(code);
      }
    }
    const taken = await bags.codesTaken([...candidates]);
    for (const code of candidates) {
      if (!taken.has(code)) {
        kept.add(code);
      }
    }
  }
  if (kept.size < count) {
    throw new BagCodeExhaustedError(MAX_DRAWS);
  }
  return [...kept];
}

/**
 * Le sac désigné par son QR ou par son code tapé, et le moyen du geste.
 * @throws {DeliveryBagNotFoundError} @throws {InvalidBagCodeError}
 */
export async function resolveBag(
  bags: DeliveryBagRepository,
  payload: LoadDeliveryBagPayload,
): Promise<{ readonly bag: DeliveryBag; readonly via: LoadVia }> {
  if ("bagId" in payload) {
    const bag = await bags.load(payload.bagId);
    if (bag === null) {
      throw new DeliveryBagNotFoundError(payload.bagId);
    }
    return { bag, via: "scan" };
  }
  const code = bagCodeOf(payload.code);
  const bag = await bags.findByCode(code);
  if (bag === null) {
    throw new DeliveryBagNotFoundError(code);
  }
  return { bag, via: "code" };
}

/** Le sac, ou 404. @throws {DeliveryBagNotFoundError} */
export async function loadBag(bags: DeliveryBagRepository, bagId: string): Promise<DeliveryBag> {
  const bag = await bags.load(bagId);
  if (bag === null) {
    throw new DeliveryBagNotFoundError(bagId);
  }
  return bag;
}

/** La commande d'un sac citée au journal : par son numéro, ou par son id nu. */
export async function citedOrderOf(
  orders: DeliveryOrdersReader,
  orderId: string,
): Promise<CitedOrder> {
  return citeOrder(orderId, await referencesOf(orders, [orderId]));
}
