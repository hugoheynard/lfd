import type { JournalFact } from "../../../../platform/journal/journal-fact.js";
import type { Backorder } from "../domain/entities/backorder.js";

/** Le sujet du journal : la commande d'origine, un reliquat par origine. */
const ORIGIN_ORDER_SUBJECT = "order";

/**
 * **Les faits du reliquat** (`documentation/commandes/reliquat/reliquat.md`, § 6.1) :
 * écrits par `Journal.append`, dans la transaction de l'écriture du
 * reliquat. Le sujet est la commande d'origine, sous son numéro
 * (`originReference`) ; qui et quand viennent du contexte de requête.
 */
export const BackorderJournalFacts = {
  /** `backorder.opened` : ce qui reste, par article, à la naissance. */
  opened(backorder: Backorder, originReference: string): JournalFact {
    return {
      type: "backorder.opened",
      subjectType: ORIGIN_ORDER_SUBJECT,
      subjectId: backorder.originOrderId,
      payload: {
        subjectLabel: originReference,
        lines: backorder.toSnapshot().lines.map((line) => ({
          sku: line.sku,
          quantity: line.quantity,
          saleUnit: line.saleUnit,
        })),
      },
    };
  },

  /** `backorder.converted` : la commande qui en est issue. */
  converted(
    backorder: Backorder,
    originReference: string,
    order: { readonly id: string; readonly number: string },
  ): JournalFact {
    return {
      type: "backorder.converted",
      subjectType: ORIGIN_ORDER_SUBJECT,
      subjectId: backorder.originOrderId,
      payload: { subjectLabel: originReference, orderId: order.id, orderNumber: order.number },
    };
  },

  /** `backorder.abandoned` : le client ne veut pas du reste. */
  abandoned(backorder: Backorder, originReference: string): JournalFact {
    return {
      type: "backorder.abandoned",
      subjectType: ORIGIN_ORDER_SUBJECT,
      subjectId: backorder.originOrderId,
      payload: { subjectLabel: originReference },
    };
  },
} as const;
