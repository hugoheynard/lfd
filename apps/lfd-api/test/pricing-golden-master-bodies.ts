/**
 * **Les corps des requêtes du golden master** : le contenu d'une passation,
 * le devis de la boutique, la saisie de l'équipe — et les appels d'un panier,
 * sous son adresse cliente. Séparés des chemins (`pricing-golden-master-paths.ts`)
 * pour que les deux se relisent chacun d'un bloc.
 */
import { WORKSPACE_HEADER } from "@lfd/contracts";
import type request from "supertest";

import type { E2eContext } from "./e2e-harness.js";
import type { GoldenBasket, GoldenLine } from "./pricing-golden-master-corpus.js";
import {
  anchoredDay,
  COURIER_ADDRESS,
  PERCENT_ADDRESS,
  type GoldenScene,
  type ScenePro,
} from "./pricing-golden-master-scene.js";

/** Le jour de service du corpus : le mercredi suivant l'ancre. */
export const GOLDEN_DAY = anchoredDay(7);

/**
 * Les appels d'un panier, tous sous SON adresse cliente : le limiteur de
 * débit (300/min par adresse, 5/min pour la passation invitée) compte par
 * adresse, et le corpus en ferait sinon une panne sans rapport avec le prix.
 */
export interface Agents {
  readonly anonymous: () => request.Agent;
  readonly as: (sub: string, workspace?: string) => request.Agent;
}

export function agentsFor(ctx: E2eContext, ip: string): Agents {
  return {
    anonymous: () => ctx.http().set("x-lfc-client-ip", ip),
    as: (sub, workspace) => {
      const agent = ctx.asSub(sub).set("x-lfc-client-ip", ip);
      return workspace === undefined ? agent : agent.set(WORKSPACE_HEADER, workspace);
    },
  };
}

/** Qui passe : le pro (son carnet d'adresses) ou un particulier (adresse dictée). */
export type Who = "pro" | "individual";

function windowOf(basket: GoldenBasket): { start: string | null; end: string } {
  if (basket.fulfillment === "pickup") return { start: "07:00", end: "08:00" };
  // Une échéance (« avant 10:00 »), pas une tranche : le coursier ne s'engage que sur la fin.
  return { start: null, end: "10:00" };
}

/** Le contenu d'une passation : acheminement, jour, créneau, lignes. */
export function contentOf(
  scene: GoldenScene,
  basket: GoldenBasket,
  who: Who,
  lines: readonly GoldenLine[] = basket.lines,
  pro: ScenePro = scene.pro,
): Record<string, unknown> {
  const pickup = basket.fulfillment === "pickup";
  const flat = basket.fulfillment === "courier_flat";
  return {
    requestedDeliveryDate: GOLDEN_DAY,
    fulfillmentMethod: pickup ? "pickup" : "delivery",
    pickupAddressId: pickup ? scene.siteId : null,
    deliveryAddress: pickup ? null : flat ? COURIER_ADDRESS : PERCENT_ADDRESS,
    deliveryAddressId: pickup || who !== "pro" ? null : flat ? pro.addressId : pro.percentAddressId,
    requestedWindow: windowOf(basket),
    note: "",
    lines: [...lines],
  };
}

/** Le corps d'un devis de la boutique : le code postal seul pour le coursier. */
export function shopQuoteBody(scene: GoldenScene, basket: GoldenBasket): Record<string, unknown> {
  const codePostal =
    basket.fulfillment === "courier_flat" ? COURIER_ADDRESS.codePostal : PERCENT_ADDRESS.codePostal;
  return {
    lines: [...basket.lines],
    fulfillment:
      basket.fulfillment === "pickup"
        ? { method: "pickup", pickupAddressId: scene.siteId }
        : { method: "delivery", codePostal },
    requestedDeliveryDate: GOLDEN_DAY,
    requestedWindow: windowOf(basket),
  };
}

export function staffBody(
  scene: GoldenScene,
  basket: GoldenBasket,
  settlement: "account" | "link",
): Record<string, unknown> {
  return {
    companyId: scene.pro.companyId,
    buyerUserId: scene.pro.buyerUserId,
    settlement,
    ...contentOf(scene, basket, "pro"),
  };
}
