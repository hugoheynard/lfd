import type { AdminOrderEstimatePayload } from "@lfd/contracts";

import type { PricingCaller } from "../../../pricing/application/pricing-caller.js";
import type { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import {
  ensureCounterSettlement,
  isCounterEntry,
} from "../../domain/services/order-supply-rules.js";
import { REGISTERED_BUYER } from "../../domain/value-objects/order-buyer-kind.js";
import type { DraftedOrder, OrderDrafting } from "./order-drafting.service.js";
import { counterCompanyStatusRefusal } from "./staff-settlement-refusal.js";
import type { OrderIntake } from "./order-intake.service.js";

/** Ce que la préparation lit, et rien d'autre. */
export interface StaffOrderPreparationPorts {
  readonly guard: Pick<OrderGuardReader, "roleOf" | "companyStatusOf">;
  readonly intake: Pick<OrderIntake, "admitStaffEntry">;
  readonly drafting: Pick<OrderDrafting, "draft">;
}

/**
 * **La saisie de l'équipe, composée et pas encore écrite** — partagée par la
 * passation (`PlaceOrderForCustomerHandler`) et son estimation
 * (`EstimateOrderForCustomerHandler`), pour qu'elles ne divergent pas (plan
 * `documentation/pricing/saisie/plan-prix-de-la-saisie.md`, lot P2) : une
 * estimation qui composerait autrement annoncerait un prix que la validation
 * contredit.
 *
 * Dans l'ordre : le mur sur l'ACHETEUR (un commercial n'est membre de rien) ;
 * le comptoir qui ne règle qu'au compte (E4) ; la porte de la boutique pour
 * la clientèle du client porté (E2) ; puis la composition, aux mêmes parties
 * que la passation du client (D4).
 *
 * Rien n'est écrit : ni la vitrine ou la journée tenues, ni la commande, ni
 * le règlement, ni la dérogation consommée — c'est à l'appelant.
 *
 * @throws {OrderCompanyNotFoundError} l'acheteur n'est pas membre de la société.
 * @throws {CounterLinkSettlementRefusedError} un lien de règlement au comptoir.
 * @throws {CounterAccountSettlementNotGrantedError} le même lien, quand la
 *   société est suspendue ou inactive : « Au compte » serait refusé aussi.
 * @throws {OrdersClosedForAudienceError} la boutique est fermée à sa clientèle.
 * @throws {ServiceDayBeforeFirstOrderableDayError} avant son premier jour commandable.
 */
export async function prepareStaffOrder(
  ports: StaffOrderPreparationPorts,
  staffUserId: string,
  payload: AdminOrderEstimatePayload,
  caller: PricingCaller,
): Promise<DraftedOrder> {
  const { companyId, buyerUserId } = payload;
  // Un 404 non-divulguant, comme sur le chemin client : le back-office a la
  // fiche sous les yeux, il n'a pas besoin d'un message plus bavard.
  ensureOrderMember(await ports.guard.roleOf(buyerUserId, companyId), companyId);
  await ensureCounterLinkCause(ports.guard, payload);
  await ports.intake.admitStaffEntry(
    companyId,
    { userId: buyerUserId },
    payload.requestedDeliveryDate,
  );
  return ports.drafting.draft(
    // Le client porté est membre d'une société : un compte, pas un invité (§ 13.7).
    {
      companyId,
      placedByUserId: buyerUserId,
      placedByStaffId: staffUserId,
      buyerKind: REGISTERED_BUYER,
    },
    payload,
    // L'équipe ne dépense pas le bon d'un client : son contrat n'en nomme
    // aucun (plan des points, C3). Gardé par Hugo le 2026-11-03 (E3) — sans
    // effet tant que la fidélité pro n'est pas ouverte.
    null,
    // Ni de langue : celle de l'écran du back-office ne dit rien du client (lot A3).
    null,
    caller,
    // La marque que l'écran envoie — `shelf` pour le « Retrait immédiat »
    // (plan du jour J, §11.1, lot L4) ; absente, fabriquée comme avant. La
    // porte `counter` sur stock ne juge pas les créneaux pro restants : gardé
    // par Hugo le 2026-11-03 (E5), le client est devant le comptoir.
    payload.supply,
    // Le « Retrait immédiat » du comptoir (lot L6) : une trace sur une `shelf`.
    payload.entryShortcut,
  );
}

/**
 * **Le lien refusé au comptoir dit la cause réelle** (rang 0 du §2.4,
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`) : si la
 * société est suspendue ou inactive, « Choisissez Au compte » enverrait le
 * vendeur vers un second refus — on lève directement celui-là. Le statut
 * n'est lu que sur ce chemin de refus ; le payeur n'étant pas connu à ce
 * rang, le délai et le prélèvement gardent le message du lien.
 */
async function ensureCounterLinkCause(
  guard: Pick<OrderGuardReader, "companyStatusOf">,
  payload: AdminOrderEstimatePayload,
): Promise<void> {
  const atCounter = isCounterEntry(payload.entryOrigin, payload.entryShortcut);
  if (atCounter && payload.settlement === "link") {
    const statusRefusal = await counterCompanyStatusRefusal(guard, payload.companyId);
    if (statusRefusal) {
      throw statusRefusal;
    }
  }
  ensureCounterSettlement(payload.settlement, atCounter);
}
