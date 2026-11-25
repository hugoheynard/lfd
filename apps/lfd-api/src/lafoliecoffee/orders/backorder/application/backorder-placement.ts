import type { AdminOrderEstimatePayload, AdminPlaceOrderPayload } from "@lfd/contracts";

import type { DraftPolicy } from "../../application/services/order-drafting.service.js";
import type { RevisedFrom } from "../../revision/application/services/revised-line-pricing.js";
import type { Backorder } from "../domain/entities/backorder.js";
import {
  BackorderNotFoundError,
  BackorderOriginNotFoundError,
  ParticularBackorderNotConvertibleError,
} from "../domain/errors/backorder-errors.js";
import type { BackorderRepository } from "../domain/ports/backorder.repository.js";
import type {
  BackorderOriginReplay,
  BackorderReplayReader,
} from "../domain/ports/backorder-replay.reader.js";
import { backorderReplayOf } from "../domain/services/backorder-replay.js";

/**
 * **La politique d'une commande issue d'un reliquat** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 4) : le
 * prix d'origine rejoué, le port offert (décision 7) et aucune surtaxe de
 * retard (décision 8). La dérogation d'heure limite se dépense (décision 10) :
 * c'est le seul couple « la dérogation se dépense, la surtaxe non ».
 */
export function backorderPolicyOf(replayed: RevisedFrom): DraftPolicy {
  return {
    deadlineWaiver: "consider",
    lateFee: "waive",
    offeredDelivery: true,
    replayed,
    windowRequester: null,
  };
}

/** Un reliquat de pro, relu sans verrou, et la société que sa saisie porte. */
export interface LoadedBackorder {
  readonly backorder: Backorder;
  /** La société du reliquat : celle de l'origine, que la saisie exige. */
  readonly companyId: string;
}

/**
 * Relit le reliquat, sans verrou ni jugement de son état : un double clic
 * après la transformation doit retrouver sa commande, pas un refus.
 *
 * @throws {BackorderNotFoundError} reliquat inconnu.
 * @throws {ParticularBackorderNotConvertibleError} reliquat sans société.
 */
export async function loadBackorder(
  backorders: Pick<BackorderRepository, "load">,
  backorderId: string,
): Promise<LoadedBackorder> {
  const backorder = await backorders.load(backorderId);
  if (backorder === null) {
    throw new BackorderNotFoundError(backorderId);
  }
  const { companyId } = backorder;
  if (companyId === null) {
    throw new ParticularBackorderNotConvertibleError();
  }
  return { backorder, companyId };
}

/** Le prix d'origine d'un reliquat ouvert, et la politique qui le rejoue. */
export interface BackorderPricing {
  readonly origin: BackorderOriginReplay;
  readonly policy: DraftPolicy;
}

/**
 * Refuse un reliquat fermé, puis relit le prix de son origine et construit
 * la politique qui le rejoue. Partagé par la transformation et son
 * estimation : elles composent la même commande.
 *
 * @throws {BackorderClosedError} déjà transformé ou abandonné.
 * @throws {BackorderOriginNotFoundError} commande d'origine introuvable.
 */
export async function backorderPricingOf(
  replays: BackorderReplayReader,
  backorder: Backorder,
): Promise<BackorderPricing> {
  backorder.ensureOpen();
  const origin = await replays.replayOf(backorder.originOrderId);
  if (origin === null) {
    throw new BackorderOriginNotFoundError(backorder.originOrderId);
  }
  return { origin, policy: backorderPolicyOf(backorderReplayOf(origin, backorder.lines)) };
}

/**
 * Le corps de la saisie de l'équipe, garni par le reliquat : sa société et
 * ses lignes, à ses quantités (des grammes au poids) et dans son unité.
 */
export function backorderEntryOf<T extends object>(
  backorder: Backorder,
  companyId: string,
  body: T,
): T & Pick<AdminPlaceOrderPayload & AdminOrderEstimatePayload, "companyId" | "lines"> {
  return {
    ...body,
    companyId,
    lines: backorder.lines.map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
      saleUnit: line.saleUnit,
    })),
  };
}
