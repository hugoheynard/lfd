import type { StaffSettlement } from "@lfd/contracts";

import type { Order } from "../../domain/entities/order.js";
import { AccountSettlementNotGrantedError } from "../../domain/errors/order-errors.js";
import { CounterAccountSettlementNotGrantedError } from "../../domain/errors/shelf-order-errors.js";
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
 *
 * Au comptoir (`atCounter`), le refus nomme sa cause et un geste qui existe
 * au comptoir — pas « réglez par lien » (Hugo, 2026-11-03). Mêmes lectures
 * que `accountStanding`, séparées pour distinguer la société inactive du
 * délai non accordé.
 */
export async function staffSettlementRefusal(
  ports: StaffSettlementPorts,
  order: Order,
  settlement: StaffSettlement,
  companyId: string,
  atCounter: boolean,
): Promise<
  | AccountSettlementNotGrantedError
  | CounterAccountSettlementNotGrantedError
  | ShelfWithoutCreditRefusedError
  | null
> {
  const parties = { companyId, payerId: order.billedCompanyId };
  if (settlement === "account" && atCounter) {
    return counterAccountRefusal(ports.guard, parties);
  }
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

/** Le refus du comptoir, par cause — ou `null` quand le compte règle. */
async function counterAccountRefusal(
  guard: StaffSettlementPorts["guard"],
  parties: { readonly companyId: string; readonly payerId: string | null },
): Promise<CounterAccountSettlementNotGrantedError | null> {
  if ((await guard.companyStatusOf(parties.companyId)) !== "active") {
    return new CounterAccountSettlementNotGrantedError("company_inactive");
  }
  const standing = await guard.settlesOnAccount(parties.payerId ?? parties.companyId);
  if (standing === "none") {
    return new CounterAccountSettlementNotGrantedError("terms_not_granted");
  }
  return standing === "blocked"
    ? new CounterAccountSettlementNotGrantedError("direct_debit_blocked")
    : null;
}
