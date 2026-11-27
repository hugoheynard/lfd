import type {
  AdminBackorderParticularConvertPayload,
  AdminBackorderParticularQuotePayload,
  CounterParticularOrderEstimatePayload,
  CounterParticularOrderPayload,
  OfferedParticularOrderEstimatePayload,
  OfferedParticularOrderPayload,
} from "@lfd/contracts";

import { OfferedOrderWithoutOfferError } from "../../domain/errors/order-offer-errors.js";
import type { Backorder } from "../domain/entities/backorder.js";
import {
  BackorderNotFoundError,
  CompanyBackorderNeedsStaffEntryError,
} from "../domain/errors/backorder-errors.js";
import type { BackorderRepository } from "../domain/ports/backorder.repository.js";
import type { OriginOptionedLine } from "../domain/services/backorder-option-choices.js";
import { backorderLinesOf } from "./backorder-placement.js";

/**
 * Relit un reliquat de **particulier**, sans verrou ni jugement de son état :
 * un double clic après la transformation doit retrouver sa commande.
 *
 * @throws {BackorderNotFoundError} reliquat inconnu.
 * @throws {CompanyBackorderNeedsStaffEntryError} reliquat d'une société.
 */
export async function loadParticularBackorder(
  backorders: Pick<BackorderRepository, "load">,
  backorderId: string,
): Promise<Backorder> {
  const backorder = await backorders.load(backorderId);
  if (backorder === null) {
    throw new BackorderNotFoundError(backorderId);
  }
  if (backorder.companyId !== null) {
    throw new CompanyBackorderNeedsStaffEntryError();
  }
  return backorder;
}

/** Le panier d'un reliquat de particulier, garni pour l'estimation de la passation qu'il emprunte. */
export type ParticularBackorderQuoteEntry =
  | { readonly venue: "shop_till"; readonly payload: CounterParticularOrderEstimatePayload }
  | { readonly venue: "offered"; readonly payload: OfferedParticularOrderEstimatePayload };

/** Le même panier, garni pour la passation : le total vu, et le motif d'une offerte. */
export type ParticularBackorderConvertEntry =
  | { readonly venue: "shop_till"; readonly payload: CounterParticularOrderPayload }
  | { readonly venue: "offered"; readonly payload: OfferedParticularOrderPayload };

/**
 * **Le corps du particulier, garni par le reliquat** : ses lignes, à ses
 * quantités (des grammes au poids), dans son unité, avec les options de la
 * ligne d'origine plafonnées à ce qui reste ; l'acheteur choisi, ou
 * celui de l'origine. Le lieu de règlement choisit la passation — la saisie
 * du comptoir ou l'offerte —, et le motif ne part qu'avec l'offerte.
 */
export function particularBackorderQuoteEntryOf(
  backorder: Backorder,
  body: AdminBackorderParticularQuotePayload,
  origin: readonly OriginOptionedLine[],
): ParticularBackorderQuoteEntry {
  const { venue, offer, buyerUserId, ...content } = body;
  const payload = {
    ...content,
    buyerUserId: buyerUserId ?? backorder.buyerUserId,
    lines: [...backorderLinesOf(backorder, origin)],
  };
  if (venue === "shop_till") {
    return { venue, payload };
  }
  return { venue, payload: offer === undefined ? payload : { ...payload, offer } };
}

/**
 * Le panier de la transformation : celui de l'estimation, plus le total vu ;
 * une offerte porte son motif, que le contrat exige.
 *
 * @throws {OfferedOrderWithoutOfferError} une offerte sans motif (le contrat l'interdit).
 */
export function particularBackorderConvertEntryOf(
  backorder: Backorder,
  body: AdminBackorderParticularConvertPayload,
  origin: readonly OriginOptionedLine[],
): ParticularBackorderConvertEntry {
  const { expectedTotalCents, ...quoted } = body;
  const entry = particularBackorderQuoteEntryOf(backorder, quoted, origin);
  if (entry.venue === "shop_till") {
    return { venue: entry.venue, payload: { ...entry.payload, expectedTotalCents } };
  }
  const { offer } = entry.payload;
  if (offer === undefined) {
    throw new OfferedOrderWithoutOfferError();
  }
  return { venue: entry.venue, payload: { ...entry.payload, offer, expectedTotalCents } };
}
