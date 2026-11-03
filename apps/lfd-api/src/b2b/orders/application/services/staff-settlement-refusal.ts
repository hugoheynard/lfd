import type { StaffSettlement } from "@lfd/contracts";

import type { Order } from "../../domain/entities/order.js";
import { AccountSettlementNotGrantedError } from "../../domain/errors/order-errors.js";
import { ShelfWithoutCreditRefusedError } from "../../domain/errors/shelf-circuit-errors.js";
import { accountStanding, type SettlementPorts } from "./order-settlement.js";
import type { ShelfCircuit } from "./shelf-circuit.service.js";

/** Les deux lectures dont le jugement du crédit a besoin, et elles seules. */
export interface StaffSettlementPorts {
  readonly guard: SettlementPorts["guard"];
  readonly shelf: Pick<ShelfCircuit, "refusesWithoutCredit">;
}

/**
 * **Le règlement choisi par l'équipe passe-t-il ?** — le refus, sans le lever,
 * ou `null`.
 *
 * Extrait de `PlaceOrderForCustomerHandler.settle` (plan
 * `documentation/pricing/saisie/plan-prix-de-la-saisie.md`, lot P2) : la
 * passation le lève avant de décider le règlement ; l'estimation de la saisie
 * le dit en avertissement, avec les mêmes mots. Un seul prédicat pour les
 * deux, pour que le panier n'annonce pas un crédit que la validation refuse.
 *
 * - `account` exige un crédit réellement accordé, celui du PAYEUR (T44) ;
 * - `link` sur la vitrine suit le réglage du pro sans crédit (Q7).
 */
export async function staffSettlementRefusal(
  ports: StaffSettlementPorts,
  order: Order,
  settlement: StaffSettlement,
  companyId: string,
): Promise<AccountSettlementNotGrantedError | ShelfWithoutCreditRefusedError | null> {
  const parties = { companyId, payerId: order.billedCompanyId };
  if (settlement === "account") {
    const standing = await accountStanding(ports.guard, parties);
    return standing === "granted"
      ? null
      : new AccountSettlementNotGrantedError(standing === "blocked");
  }
  if (!order.isFromShelf) {
    return null;
  }
  const standing = await accountStanding(ports.guard, parties);
  if (standing !== "granted" && (await ports.shelf.refusesWithoutCredit())) {
    return new ShelfWithoutCreditRefusedError(companyId);
  }
  return null;
}
