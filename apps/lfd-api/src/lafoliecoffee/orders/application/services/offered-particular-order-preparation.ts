import type { OfferedParticularOrderEstimatePayload } from "@lfd/contracts";

import type { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import type { PricingCaller } from "../../../pricing/application/pricing-caller.js";
import { staffEntryOriginOf } from "../../domain/services/order-supply-rules.js";
import { REGISTERED_BUYER } from "../../domain/value-objects/order-buyer-kind.js";
import type { DraftedOrder, DraftPolicy, OrderDrafting } from "./order-drafting.service.js";
import { offerPartyOf } from "./order-offering.js";
import { ensureParticular } from "./particular-buyer-wall.js";

/** Ce que la préparation lit, et rien d'autre. */
export interface OfferedParticularOrderPreparationPorts {
  readonly particulars: ParticularStandingReader;
  readonly drafting: Pick<OrderDrafting, "draft">;
}

/**
 * **La commande offerte à un particulier, composée et pas encore écrite**
 * (`la-commande-offerte.md`, § 2.5).
 *
 * Le mur est celui du comptoir ({@link ensureParticular}) ; la composition est
 * {@link OrderDrafting}, sans société : la clientèle publique se résout au
 * serveur, donc les prix, la TVA et les CGV sont ceux d'un particulier, et la
 * livraison est jugée pour cette clientèle (`CartAdjustments.deliveryRoute`
 * refuse une livraison fermée aux particuliers ou un code postal non
 * desservi). Le motif entre dans les parties : l'agrégat pose la ligne
 * d'offre après la composition complète, et le total tombe à zéro.
 *
 * Ni fermeture de la boutique, ni premier jour commandable, ni minimum
 * d'achat : l'équipe n'y est pas tenue (décidé par Hugo le 2026-11-23).
 * Aucune dérogation d'heure limite : elles sont tenues par société. Rien
 * n'est écrit. Sans motif (l'estimation, avant qu'il soit écrit), la
 * commande se compose à sa valeur pleine.
 *
 * @throws {CounterParticularNotFoundError} aucune fiche sous cet identifiant.
 * @throws {CounterBuyerIsCompanyMemberError} la fiche est rattachée à une société.
 * @throws {CounterParticularDisabledError} la fiche est désactivée.
 * @throws {InvalidOrderOfferError} le motif est mal formé.
 */
export async function prepareOfferedParticularOrder(
  ports: OfferedParticularOrderPreparationPorts,
  staffUserId: string,
  // La forme de l'estimation, plus large : la passation y entre, motif exigé.
  payload: OfferedParticularOrderEstimatePayload,
  caller: PricingCaller,
  // `PLACEMENT_POLICY` pour la saisie ; celle du reliquat pour sa transformation.
  policy: DraftPolicy,
): Promise<DraftedOrder> {
  await ensureParticular(ports.particulars, payload.buyerUserId);
  return ports.drafting.draft(
    {
      companyId: null,
      placedByUserId: payload.buyerUserId,
      placedByStaffId: staffUserId,
      // Saisie de l'équipe : jamais `guest` (CHECK `orders_buyer_kind_guest_shape`).
      buyerKind: REGISTERED_BUYER,
      exceedItemLimits: false,
      minimumsWaived: true,
      ...offerPartyOf(payload.offer),
    },
    payload,
    // Aucun bon de fidélité dépensé par l'équipe, ni langue de l'écran.
    null,
    null,
    caller,
    // Fabriquée, comme toute saisie de l'équipe sans marque.
    undefined,
    undefined,
    // Une offre se saisit hors du comptoir : l'origine du commercial.
    staffEntryOriginOf(undefined, undefined),
    policy,
  );
}
