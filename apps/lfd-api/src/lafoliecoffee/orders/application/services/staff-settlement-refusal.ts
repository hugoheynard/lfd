import type { StaffSettlement } from "@lfd/contracts";

import type { Order } from "../../domain/entities/order.js";
import type { OrderCompanyStatus } from "../../domain/ports/company-status.reader.js";
import {
  AccountSettlementNotGrantedError,
  SuspendedCompanyAccountSettlementError,
} from "../../domain/errors/order-errors.js";
import { CounterAccountSettlementNotGrantedError } from "../../domain/errors/shelf-order-errors.js";
import { ShelfWithoutCreditRefusedError } from "../../domain/errors/shelf-circuit-errors.js";
import { accountStanding, settlingStatusOf, type SettlementPorts } from "./order-settlement.js";
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
 * `documentation/commandes/passation/commande-passee-par-l-equipe.md`, § 8) : la
 * passation le lève avant de décider le règlement ; l'estimation de la saisie
 * le dit en avertissement, avec les mêmes mots. Un seul prédicat pour les
 * deux, pour que le panier n'annonce pas un crédit que la validation refuse.
 *
 * - `account` est refusé à une société suspendue (É18) — elle, ou son PAYEUR
 *   (décision 2 de `plan-suspendue-au-prix-pro.md`, 2026-11-03) — puis exige
 *   un crédit réellement accordé, celui du payeur (T44) ;
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
  | SuspendedCompanyAccountSettlementError
  | CounterAccountSettlementNotGrantedError
  | ShelfWithoutCreditRefusedError
  | null
> {
  const parties = { companyId, payerId: order.billedCompanyId };
  if (settlement === "account" && atCounter) {
    return counterAccountRefusal(ports.guard, parties);
  }
  if (settlement === "account") {
    // É18 : la suspendue est servie comme dans son espace (lot P0), jamais au
    // compte — et un payeur suspendu ferme le compte de ses sites (décision 2).
    const status = await ports.guard.companyStatusOf(companyId);
    const settling = await settlingStatusOf(ports.guard, companyId, order.billedCompanyId, status);
    if (settling === "suspended") {
      return new SuspendedCompanyAccountSettlementError();
    }
    // Les statuts se lisent UNE fois : les relire pour le crédit doublait la lecture.
    const standing =
      settling === "active"
        ? await ports.guard.settlesOnAccount(order.billedCompanyId ?? companyId)
        : "none";
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
  const status = await guard.companyStatusOf(parties.companyId);
  const statusRefusal = counterStatusRefusalOf(
    await settlingStatusOf(guard, parties.companyId, parties.payerId, status),
  );
  if (statusRefusal) {
    return statusRefusal;
  }
  const standing = await guard.settlesOnAccount(parties.payerId ?? parties.companyId);
  if (standing === "none") {
    return new CounterAccountSettlementNotGrantedError("terms_not_granted");
  }
  return standing === "blocked"
    ? new CounterAccountSettlementNotGrantedError("direct_debit_blocked")
    : null;
}

/**
 * **La part « statut » du refus du comptoir** — la société qui commande est
 * suspendue ou inactive — ou `null`.
 *
 * Exportée pour le refus du lien au comptoir (`prepareStaffOrder`) : à ce
 * rang, le payeur n'est pas encore connu, mais le statut de la société, lui,
 * suffit à savoir que « Au compte » serait refusé aussi. Le refus du lien dit
 * alors la cause réelle au lieu d'envoyer le vendeur vers un second refus
 * (Hugo, 2026-11-03, option a).
 */
export async function counterCompanyStatusRefusal(
  guard: Pick<StaffSettlementPorts["guard"], "companyStatusOf">,
  companyId: string,
): Promise<CounterAccountSettlementNotGrantedError | null> {
  return counterStatusRefusalOf(await guard.companyStatusOf(companyId));
}

/** La règle, sur un statut déjà lu — de la société, ou de son payeur. */
function counterStatusRefusalOf(
  status: OrderCompanyStatus | null,
): CounterAccountSettlementNotGrantedError | null {
  if (status === "suspended") {
    return new CounterAccountSettlementNotGrantedError("company_suspended");
  }
  if (status !== "active") {
    return new CounterAccountSettlementNotGrantedError("company_inactive");
  }
  return null;
}
