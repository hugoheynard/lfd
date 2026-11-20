import type { CounterParticularOrderEstimatePayload } from "@lfd/contracts";

import type { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import type { PricingCaller } from "../../../pricing/application/pricing-caller.js";
import {
  CounterBuyerIsCompanyMemberError,
  CounterParticularDisabledError,
  CounterParticularNotFoundError,
} from "../../domain/errors/shop-till-order-errors.js";
import { ensureShopTillPickup } from "../../domain/services/shop-till-rules.js";
import { REGISTERED_BUYER } from "../../domain/value-objects/order-buyer-kind.js";
import { COUNTER_ENTRY } from "../../domain/value-objects/order-supply.js";
import type { DraftedOrder, OrderDrafting } from "./order-drafting.service.js";
import type { OrderIntake } from "./order-intake.service.js";

/** Ce que la préparation lit, et rien d'autre. */
export interface CounterParticularOrderPreparationPorts {
  readonly particulars: ParticularStandingReader;
  readonly intake: Pick<OrderIntake, "admitStaffEntry">;
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
 * @throws {OrdersClosedForAudienceError} la boutique est fermée aux particuliers.
 * @throws {ServiceDayBeforeFirstOrderableDayError} avant leur premier jour commandable.
 */
export async function prepareCounterParticularOrder(
  ports: CounterParticularOrderPreparationPorts,
  staffUserId: string,
  payload: CounterParticularOrderEstimatePayload,
  caller: PricingCaller,
): Promise<DraftedOrder> {
  ensureShopTillPickup(payload.fulfillmentMethod);
  await ensureParticular(ports.particulars, payload.buyerUserId);
  await ports.intake.admitStaffEntry(
    null,
    { userId: payload.buyerUserId },
    payload.requestedDeliveryDate,
  );
  return ports.drafting.draft(
    {
      companyId: null,
      placedByUserId: payload.buyerUserId,
      placedByStaffId: staffUserId,
      // Saisie de l'équipe : jamais `guest` (CHECK `orders_buyer_kind_guest_shape`).
      buyerKind: REGISTERED_BUYER,
      // Le particulier ne passe pas outre la limite d'un produit dans son espace.
      exceedItemLimits: false,
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
  );
}

/** La fiche choisie est un particulier, ou le refus qui nomme pourquoi elle n'en est pas un. */
async function ensureParticular(
  particulars: ParticularStandingReader,
  buyerUserId: string,
): Promise<void> {
  const standing = await particulars.standingOf(buyerUserId);
  switch (standing) {
    case "particular":
      return;
    case "company_member":
      throw new CounterBuyerIsCompanyMemberError();
    case "disabled":
      throw new CounterParticularDisabledError();
    case "unknown":
      throw new CounterParticularNotFoundError();
  }
}
