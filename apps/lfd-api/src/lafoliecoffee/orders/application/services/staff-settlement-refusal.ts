import type { StaffSettlement } from "@lfd/contracts";

import type { Order } from "../../domain/entities/order.js";
import type { OrderCompanyStatus } from "../../domain/ports/company-status.reader.js";
import {
  AccountSettlementNotGrantedError,
  SuspendedCompanyAccountSettlementError,
} from "../../domain/errors/order-errors.js";
import { InHouseBuyerLinkRefusedError } from "../../domain/errors/in-house-buyer-errors.js";
import { CounterAccountSettlementNotGrantedError } from "../../domain/errors/shelf-order-errors.js";
import { ShelfWithoutCreditRefusedError } from "../../domain/errors/shelf-circuit-errors.js";
import {
  PublicBuyerAccountUnavailableError,
  PublicBuyerCardRefusedError,
} from "../../domain/errors/public-buyer-errors.js";
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
 * - `link` sur la vitrine suit le réglage du pro sans crédit (Q7) ;
 * - `offered` n'a rien à encaisser : ni crédit, ni statut, ni payeur à juger.
 *   Le droit d'offrir se garde au handler.
 * - une commande interne (payeur maison) refuse le lien, et passe sinon sans
 *   lire ni crédit ni statut : il n'y a rien à encaisser.
 *
 * - un payeur public (sa forme juridique) ne règle jamais par lien, et un
 *   compte qui ne règle pas lui est refusé sans repli.
 *
 * Au comptoir (`atCounter`), le refus nomme sa cause et un geste qui existe
 * au comptoir — pas « réglez par lien » (Hugo, 2026-11-03). Mêmes lectures
 * que `accountStanding`, séparées pour distinguer la société inactive du
 * délai non accordé.
 *
 * Un compte ouvert au comptoir (`counter_opened`) règle au compte sur ce
 * chemin seulement, et seulement pour qui détient `b2b_counter_accounts:write`
 * (`chargesCounterAccounts`, lu en base par la porte staff) — plan
 * `documentation/comptes-client/plan-comptes-du-comptoir.md`, § 3.2.
 * `accountStanding`, le chemin de la boutique, continue de le refuser.
 */
export async function staffSettlementRefusal(
  ports: StaffSettlementPorts,
  order: Order,
  settlement: StaffSettlement,
  companyId: string,
  atCounter: boolean,
  chargesCounterAccounts = false,
): Promise<
  | AccountSettlementNotGrantedError
  | SuspendedCompanyAccountSettlementError
  | CounterAccountSettlementNotGrantedError
  | ShelfWithoutCreditRefusedError
  | PublicBuyerCardRefusedError
  | PublicBuyerAccountUnavailableError
  | InHouseBuyerLinkRefusedError
  | null
> {
  // Une commande interne d'un de nos restaurants n'encaisse rien : pas de
  // lien, et aucun crédit à juger pour le reste.
  if (order.isInHouse) {
    return settlement === "link" ? new InHouseBuyerLinkRefusedError() : null;
  }
  if (settlement === "offered") {
    return null;
  }
  const parties = { companyId, payerId: order.billedCompanyId };
  const payerId = order.billedCompanyId ?? companyId;
  // La forme du payeur ne se lit que quand elle change la réponse : sur un
  // lien, ou sur un compte refusé — un compte qui règle se passe d'elle.
  if (settlement === "link" && (await ports.guard.isPublicPayer(payerId))) {
    return new PublicBuyerCardRefusedError();
  }
  if (settlement === "account") {
    const counter = atCounter ? { chargesCounterAccounts } : null;
    const refusal = await accountRefusal(ports.guard, order, companyId, counter);
    if (refusal !== null && (await ports.guard.isPublicPayer(payerId))) {
      return new PublicBuyerAccountUnavailableError();
    }
    return refusal;
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

/** Le refus du règlement au compte, ou `null` quand le compte règle. */
async function accountRefusal(
  guard: StaffSettlementPorts["guard"],
  order: Order,
  companyId: string,
  counter: CounterGrants | null,
): Promise<
  | AccountSettlementNotGrantedError
  | SuspendedCompanyAccountSettlementError
  | CounterAccountSettlementNotGrantedError
  | null
> {
  if (counter !== null) {
    return counterAccountRefusal(
      guard,
      { companyId, payerId: order.billedCompanyId },
      counter.chargesCounterAccounts,
    );
  }
  // É18 : la suspendue est servie comme dans son espace (lot P0), jamais au
  // compte — et un payeur suspendu ferme le compte de ses sites (décision 2).
  const status = await guard.companyStatusOf(companyId);
  const settling = await settlingStatusOf(guard, companyId, order.billedCompanyId, status);
  if (settling === "suspended") {
    return new SuspendedCompanyAccountSettlementError();
  }
  // Les statuts se lisent UNE fois : les relire pour le crédit doublait la lecture.
  const standing =
    settling === "active"
      ? await guard.settlesOnAccount(order.billedCompanyId ?? companyId)
      : "none";
  return standing === "granted"
    ? null
    : new AccountSettlementNotGrantedError(standing === "blocked");
}

/** Ce que le droit de celui qui saisit ouvre au comptoir. */
interface CounterGrants {
  /** `b2b_counter_accounts:write` : régler au compte d'un compte du comptoir. */
  readonly chargesCounterAccounts: boolean;
}

/** Le refus du comptoir, par cause — ou `null` quand le compte règle. */
async function counterAccountRefusal(
  guard: StaffSettlementPorts["guard"],
  parties: { readonly companyId: string; readonly payerId: string | null },
  chargesCounterAccounts: boolean,
): Promise<CounterAccountSettlementNotGrantedError | null> {
  const status = await guard.companyStatusOf(parties.companyId);
  const statusRefusal = counterStatusRefusalOf(
    await settlingStatusOf(guard, parties.companyId, parties.payerId, status),
    chargesCounterAccounts,
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
 *
 * Un compte du comptoir n'y est pas dit « inactif » : il règle au compte pour
 * qui en a le droit, et le lien garde alors son propre refus. Ce rang ne
 * juge aucun crédit — la passation au compte le juge, droit compris.
 */
export async function counterCompanyStatusRefusal(
  guard: Pick<StaffSettlementPorts["guard"], "companyStatusOf">,
  companyId: string,
): Promise<CounterAccountSettlementNotGrantedError | null> {
  return counterStatusRefusalOf(await guard.companyStatusOf(companyId), true);
}

/**
 * La règle, sur un statut déjà lu — de la société, ou de son payeur. Un
 * compte du comptoir passe quand celui qui saisit en a le droit.
 */
function counterStatusRefusalOf(
  status: OrderCompanyStatus | null,
  admitsCounterOpened: boolean,
): CounterAccountSettlementNotGrantedError | null {
  if (status === "suspended") {
    return new CounterAccountSettlementNotGrantedError("company_suspended");
  }
  if (status === "counter_opened" && admitsCounterOpened) {
    return null;
  }
  if (status !== "active") {
    return new CounterAccountSettlementNotGrantedError("company_inactive");
  }
  return null;
}
