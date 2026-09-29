import type { LoadDeliveryBinPayload } from "@lfd/contracts";

import type { DeliveryOrderFacts, DeliveryOrdersReader } from "../channels/commerce/index.js";
import type { BinType } from "../domain/entities/bin-type.js";
import type { DeliveryBin } from "../domain/entities/delivery-bin.js";
import type { LoadVia } from "../domain/entities/stop-loading.js";
import { BinTypeNotFoundError } from "../domain/errors/delivery-bin-errors.js";
import {
  BinCodeExhaustedError,
  BinsNotDeclarableError,
  DeliveryBinNotFoundError,
  type UndeclarableReason,
} from "../domain/errors/delivery-loading-errors.js";
import { citeOrder, type CitedOrder } from "../domain/events/delivery-round.events.js";
import type { BinCodeDrawer } from "../domain/ports/bin-code-drawer.js";
import type { BinTypeLookup } from "../domain/ports/bin-type-lookup.js";
import type { DeliveryBinRepository } from "../domain/ports/delivery-bin.repository.js";
import { binCodeOf } from "../domain/value-objects/bin-code.js";
import { referencesOf } from "./delivery-round-support.js";

/**
 * Les gardes et tirages que plusieurs gestes du chargement partagent.
 */

/** Au-delà, un tirage qui ne trouve toujours pas de code libre est un défaut. */
const MAX_DRAWS = 5;

/**
 * Tire `count` codes libres (L4-C20) : distincts entre eux, et d'aucun bac
 * existant, annulé compris. Un code déjà pris est retiré.
 *
 * @throws {BinCodeExhaustedError}
 */
export async function drawBinCodes(
  drawer: BinCodeDrawer,
  bins: DeliveryBinRepository,
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
    const taken = await bins.codesTaken([...candidates]);
    for (const code of candidates) {
      if (!taken.has(code)) {
        kept.add(code);
      }
    }
  }
  if (kept.size < count) {
    throw new BinCodeExhaustedError(MAX_DRAWS);
  }
  return [...kept];
}

/** Un seul code libre. @throws {BinCodeExhaustedError} */
export async function drawBinCode(
  drawer: BinCodeDrawer,
  bins: DeliveryBinRepository,
): Promise<string> {
  const [code] = await drawBinCodes(drawer, bins, 1);
  if (code === undefined) {
    throw new BinCodeExhaustedError(MAX_DRAWS);
  }
  return code;
}

/** Le type de bac à déclarer, ou 404. @throws {BinTypeNotFoundError} */
export async function lookUpBinType(types: BinTypeLookup, id: string): Promise<BinType> {
  const binType = await types.load(id);
  if (binType === null) {
    throw new BinTypeNotFoundError(id);
  }
  return binType;
}

/**
 * Le numéro d'une commande qui peut recevoir des bacs : connue du commerce,
 * en livraison, non annulée — lue au moment du geste.
 * @throws {BinsNotDeclarableError}
 */
export async function declarableReference(
  orders: DeliveryOrdersReader,
  orderId: string,
): Promise<string> {
  const [order] = await orders.byIds([orderId]);
  const reason = order === undefined ? "unknown" : undeclarableReason(order);
  if (order === undefined || reason !== null) {
    throw new BinsNotDeclarableError(order?.reference ?? orderId, reason ?? "unknown");
  }
  return order.reference;
}

function undeclarableReason(order: DeliveryOrderFacts): UndeclarableReason | null {
  if (order.status === "cancelled") {
    return "cancelled";
  }
  return order.delivery ? null : "not_delivery";
}

/**
 * Le bac désigné par son QR ou par son code tapé, et le moyen du geste.
 * @throws {DeliveryBinNotFoundError} @throws {InvalidBinCodeError}
 */
export async function resolveBin(
  bins: DeliveryBinRepository,
  payload: LoadDeliveryBinPayload,
): Promise<{ readonly bin: DeliveryBin; readonly via: LoadVia }> {
  if ("binId" in payload) {
    const bin = await bins.load(payload.binId);
    if (bin === null) {
      throw new DeliveryBinNotFoundError(payload.binId);
    }
    return { bin, via: "scan" };
  }
  const code = binCodeOf(payload.code);
  const bin = await bins.findByCode(code);
  if (bin === null) {
    throw new DeliveryBinNotFoundError(code);
  }
  return { bin, via: "code" };
}

/** Le bac, ou 404. @throws {DeliveryBinNotFoundError} */
export async function loadBin(bins: DeliveryBinRepository, binId: string): Promise<DeliveryBin> {
  const bin = await bins.load(binId);
  if (bin === null) {
    throw new DeliveryBinNotFoundError(binId);
  }
  return bin;
}

/** La commande d'un bac citée au journal : par son numéro, ou par son id nu. */
export async function citedOrderOf(
  orders: DeliveryOrdersReader,
  orderId: string,
): Promise<CitedOrder> {
  return citeOrder(orderId, await referencesOf(orders, [orderId]));
}
