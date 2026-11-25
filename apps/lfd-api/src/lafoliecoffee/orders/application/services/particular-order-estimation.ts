import type { AdminOrderEstimateNotice, AdminOrderEstimateView } from "@lfd/contracts";

import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import {
  CounterBuyerIsCompanyMemberError,
  CounterParticularDisabledError,
  CounterParticularNotFoundError,
} from "../../domain/errors/shop-till-order-errors.js";
import { PLANNED_SUPPLY } from "../../domain/value-objects/order-supply.js";
import { amountsViewOf } from "../queries/estimate-amounts-view.js";
import type { OrderCutoffNotice } from "./order-cutoff-notice.service.js";
import type { DraftedOrder } from "./order-drafting.service.js";

/** Ce que l'estimation lit du panier : ses articles et son jour. */
export interface EstimatedParticularContent {
  readonly lines: readonly { readonly sku: string }[];
  readonly requestedDeliveryDate: string;
}

/**
 * **L'estimation d'une commande de particulier saisie par l'équipe** — la
 * réglée en boutique, l'offerte, et la transformation d'un reliquat de
 * particulier, qui les composent par les mêmes préparations : la commande
 * composée par `draft`, lue sans être écrite, dans la vue de l'estimation de
 * la saisie pro (`AdminOrderEstimateView`).
 *
 * Un refus de la composition revient comme `refusal`, avec les mots de la
 * passation ; la fiche choisie qui n'est pas un particulier reste une erreur,
 * comme à la passation. Aucun avertissement : ni vitrine (la commande est
 * fabriquée), ni crédit (rien ne se règle chez nous). Le particulier ne passe
 * outre aucune limite de produit : `false`, comme la passation.
 */
export async function estimateParticularOrder(
  draft: () => Promise<DraftedOrder>,
  cutoffNotice: OrderCutoffNotice,
  content: EstimatedParticularContent,
): Promise<AdminOrderEstimateView> {
  const drafted = await draftOrRefusal(draft);
  const cutoff = await cutoffNotice.forDay(
    content.lines.map((line) => line.sku),
    content.requestedDeliveryDate,
    PLANNED_SUPPLY.supply,
    false,
  );
  if (!("order" in drafted)) {
    return { amounts: null, cutoff, refusal: drafted, warnings: [] };
  }
  return {
    amounts: amountsViewOf(drafted.order.amounts(), drafted.order.offer),
    cutoff,
    refusal: null,
    warnings: [],
  };
}

async function draftOrRefusal(
  draft: () => Promise<DraftedOrder>,
): Promise<DraftedOrder | AdminOrderEstimateNotice> {
  try {
    return await draft();
  } catch (error) {
    if (isParticularCompositionRefusal(error)) {
      return { code: error.code, message: error.message };
    }
    throw error;
  }
}

/** Un refus de composition — pas la fiche choisie, qui reste l'erreur de la passation. */
export function isParticularCompositionRefusal(
  error: unknown,
): error is DomainError | BusinessError {
  if (
    error instanceof CounterParticularNotFoundError ||
    error instanceof CounterBuyerIsCompanyMemberError ||
    error instanceof CounterParticularDisabledError
  ) {
    return false;
  }
  return error instanceof DomainError || error instanceof BusinessError;
}
