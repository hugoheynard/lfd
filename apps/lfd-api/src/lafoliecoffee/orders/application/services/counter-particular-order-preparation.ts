import type { CounterParticularOrderEstimatePayload } from "@lfd/contracts";

import type { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import type { PricingCaller } from "../../../pricing/application/pricing-caller.js";
import { ensureShopTillPickup } from "../../domain/services/shop-till-rules.js";
import { REGISTERED_BUYER } from "../../domain/value-objects/order-buyer-kind.js";
import { COUNTER_ENTRY } from "../../domain/value-objects/order-supply.js";
import type { DraftedOrder, DraftPolicy, OrderDrafting } from "./order-drafting.service.js";
import { ensureParticular } from "./particular-buyer-wall.js";

/** Ce que la préparation lit, et rien d'autre. */
export interface CounterParticularOrderPreparationPorts {
  readonly particulars: ParticularStandingReader;
  readonly drafting: Pick<OrderDrafting, "draft">;
}

/**
 * **La commande d'un particulier notée au comptoir, composée et pas encore
 * écrite** — partagée par la passation (`PlaceParticularOrderAtCounterHandler`)
 * et son estimation, pour qu'elles ne divergent pas
 * (`commande-particulier-reglee-en-boutique.md`, § 5).
 *
 * Le particulier commande **comme dans son espace** : la composition est
 * {@link OrderDrafting}, celle de toutes les passations, sans société — la
 * clientèle publique se résout au serveur (`CustomerAudiences`), donc ni prix
 * ni promotion pro ne peuvent l'atteindre. Ce qui vient de la saisie de
 * l'équipe : l'auteur, l'origine `counter`, et les règles de journée que la
 * composition réserve à l'équipe (plan arrêté reçu « hors plan », porte du
 * jour même `counter`). Aucune dérogation d'heure limite : elles sont tenues
 * par société, et il n'y en a pas.
 *
 * Dans l'ordre : le retrait seul ; la fiche, un particulier ; la boutique
 * ouverte à la clientèle publique et son premier jour commandable ; puis la
 * composition. Rien n'est écrit.
 *
 * @throws {ShopTillOrderNotPickupError} une livraison.
 * @throws {CounterParticularNotFoundError} aucune fiche sous cet identifiant.
 * @throws {CounterBuyerIsCompanyMemberError} la fiche est rattachée à une société.
 * @throws {CounterParticularDisabledError} la fiche est désactivée.
 */
export async function prepareCounterParticularOrder(
  ports: CounterParticularOrderPreparationPorts,
  staffUserId: string,
  payload: CounterParticularOrderEstimatePayload,
  caller: PricingCaller,
  // `PLACEMENT_POLICY` pour la saisie ; celle du reliquat pour sa transformation.
  policy: DraftPolicy,
): Promise<DraftedOrder> {
  ensureShopTillPickup(payload.fulfillmentMethod);
  await ensureParticular(ports.particulars, payload.buyerUserId);
  // Ni fermeture de la boutique aux particuliers, ni premier jour commandable :
  // l'équipe n'y est pas tenue (décidé par Hugo le 2026-11-23).
  return ports.drafting.draft(
    {
      companyId: null,
      placedByUserId: payload.buyerUserId,
      placedByStaffId: staffUserId,
      // Saisie de l'équipe : jamais `guest` (CHECK `orders_buyer_kind_guest_shape`).
      buyerKind: REGISTERED_BUYER,
      // Le particulier ne passe pas outre la limite d'un produit dans son espace.
      exceedItemLimits: false,
      // L'équipe commande ce qu'il faut : pas de minimum d'achat (Hugo, 2026-11-23).
      minimumsWaived: true,
    },
    payload,
    // Aucun bon de fidélité dépensé par l'équipe (§ 5).
    null,
    // La langue de l'écran du back-office ne dit rien du client.
    null,
    caller,
    // La marchandise se décide comme pour toute saisie de l'équipe sans marque : fabriquée.
    undefined,
    undefined,
    COUNTER_ENTRY,
    policy,
  );
}
