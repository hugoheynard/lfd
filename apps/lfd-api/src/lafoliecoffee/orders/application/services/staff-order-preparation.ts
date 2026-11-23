import type { AdminOrderEstimatePayload } from "@lfd/contracts";

import {
  orderOfferReasonOf,
  type OrderOfferReason,
} from "../../domain/value-objects/order-offer.js";
import type { PricingCaller } from "../../../pricing/application/pricing-caller.js";
import type { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import {
  ensureCounterSettlement,
  isCounterEntry,
  staffEntryOriginOf,
} from "../../domain/services/order-supply-rules.js";
import { REGISTERED_BUYER } from "../../domain/value-objects/order-buyer-kind.js";
import type { DraftedOrder, OrderDrafting } from "./order-drafting.service.js";
import { counterCompanyStatusRefusal } from "./staff-settlement-refusal.js";

/** Ce que la préparation lit, et rien d'autre. */
export interface StaffOrderPreparationPorts {
  readonly guard: Pick<OrderGuardReader, "staffEntryRoleOf" | "companyStatusOf">;
  readonly drafting: Pick<OrderDrafting, "draft">;
}

/**
 * **La saisie de l'équipe, composée et pas encore écrite** — partagée par la
 * passation (`PlaceOrderForCustomerHandler`) et son estimation
 * (`EstimateOrderForCustomerHandler`), pour qu'elles ne divergent pas (plan
 * `documentation/commandes/passation/commande-passee-par-l-equipe.md`, § 8) : une
 * estimation qui composerait autrement annoncerait un prix que la validation
 * contredit.
 *
 * Dans l'ordre : le mur sur l'ACHETEUR (un commercial n'est membre de rien) ;
 * le comptoir qui ne règle qu'au compte (E4) ; la porte de la boutique pour
 * la clientèle du client porté (E2) ; puis la composition, aux mêmes parties
 * que la passation du client (D4).
 *
 * Les limites de produit passées reviennent avec la commande composée
 * (`exceeded`) : la passation en exige le motif, l'estimation les annonce.
 *
 * Rien n'est écrit : ni la vitrine ou la journée tenues, ni la commande, ni
 * le règlement, ni la dérogation consommée — c'est à l'appelant.
 *
 * @throws {OrderCompanyNotFoundError} l'acheteur n'est pas membre de la société.
 * @throws {CounterLinkSettlementRefusedError} un lien de règlement au comptoir.
 * @throws {CounterAccountSettlementNotGrantedError} le même lien, quand la
 *   société est suspendue ou inactive : « Au compte » serait refusé aussi.
 * @throws {InvalidOrderOfferError} le motif d'une commande offerte est mal formé.
 */
export async function prepareStaffOrder(
  ports: StaffOrderPreparationPorts,
  staffUserId: string,
  payload: AdminOrderEstimatePayload,
  caller: PricingCaller,
  // Le droit de passer outre la limite d'un produit, lu au contrôleur.
  exceedItemLimits: boolean,
): Promise<DraftedOrder> {
  const { companyId, buyerUserId } = payload;
  // Un 404 non-divulguant, comme sur le chemin client : le back-office a la
  // fiche sous les yeux, il n'a pas besoin d'un message plus bavard.
  // L'équipe porte la commande à toute personne rattachée à la société, même
  // sans accès accepté : elle passe dans tous les cas (Hugo, 2026-11-23).
  ensureOrderMember(await ports.guard.staffEntryRoleOf(buyerUserId, companyId), companyId);
  await ensureCounterLinkCause(ports.guard, payload);
  // L'équipe n'est tenue ni par la fermeture de la boutique à une clientèle,
  // ni par son premier jour commandable : ces dates ouvrent la boutique aux
  // clients, la production tourne déjà et s'adapte (décidé par Hugo le
  // 2026-11-23). Le jour de production et l'heure limite, eux, tiennent.
  return ports.drafting.draft(
    // Le client porté est membre d'une société : un compte, pas un invité (§ 13.7).
    {
      companyId,
      placedByUserId: buyerUserId,
      placedByStaffId: staffUserId,
      buyerKind: REGISTERED_BUYER,
      exceedItemLimits,
      // L'équipe commande ce qu'il faut : pas de minimum d'achat (Hugo, 2026-11-23).
      minimumsWaived: true,
      ...offerOf(payload),
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
    // D'où vient la saisie, gardée sur la commande (Hugo, 2026-11-04).
    staffEntryOriginOf(payload.entryOrigin, payload.entryShortcut),
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

/**
 * Le motif de l'offre, revalidé par l'agrégat, ou rien. Le contrat garantit
 * qu'il est là si et seulement si le règlement est `offered`.
 *
 * @throws {InvalidOrderOfferError} un motif mal formé.
 */
function offerOf(payload: AdminOrderEstimatePayload): { readonly offer?: OrderOfferReason } {
  return payload.offer === undefined ? {} : { offer: orderOfferReasonOf(payload.offer) };
}
