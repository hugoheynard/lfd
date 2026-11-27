import type {
  PlannedBasketCheckItem,
  PlannedLineBlocking,
  PlannedLineCheck,
} from "../../../../recurring/channels/commerce/index.js";
import type { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import type { LineVerdict, OrderDeadlineVerdict } from "../../../order-cutoffs/index.js";
import { OrderCutoffGraceError, PastOrderCutoffError } from "../../domain/errors/order-errors.js";
import {
  ensureMinimumQuantity,
  ensureSaleQuantity,
} from "../../domain/services/sale-quantity-rules.js";
import type { PlannedSaleTerms } from "./planned-ordering-gates.js";
import { recurringRefusalOf } from "./recurring-refusal.js";

/** Tout ce que la vérification sait d'une grille, lu une fois. */
export interface PlannedGridFacts {
  readonly company: PlannedLineBlocking | null;
  readonly settlement: PlannedLineBlocking | null;
  readonly days: ReadonlyMap<string, PlannedLineBlocking>;
  readonly articleRefusals: ReadonlyMap<string, BusinessError>;
  readonly terms: ReadonlyMap<string, PlannedSaleTerms>;
  readonly verdicts: ReadonlyMap<string, OrderDeadlineVerdict>;
}

/**
 * **La réponse d'un article**, dans l'ordre de la passation : la société
 * (acheteur, boutique), le jour, l'article fermé à la société, son unité,
 * l'heure limite, le minimum d'achat — le seul juge qui tienne à la
 * quantité —, puis le règlement au compte. Un blocage de la société, du
 * règlement ou du minimum ne grise pas un jour (`quantityIndependent:
 * false`) : déplacer l'article n'y changerait rien.
 */
export function judgeLine(item: PlannedBasketCheckItem, facts: PlannedGridFacts): PlannedLineCheck {
  const verdict = facts.verdicts.get(item.day);
  const line = verdict?.lines.get(item.sku);
  const terms = facts.terms.get(item.sku);
  const articleBlocking =
    facts.days.get(item.day) ??
    blockingOf(facts.articleRefusals.get(item.sku) ?? null) ??
    unitBlocking(item.sku, terms) ??
    (line === undefined || verdict === undefined
      ? null
      : deadlineBlocking(item.day, line, verdict));
  const minimum =
    articleBlocking === null && facts.company === null ? minimumBlocking(item, terms) : null;
  const blocking = facts.company ?? articleBlocking ?? minimum ?? facts.settlement;
  return {
    sku: item.sku,
    day: item.day,
    columnId: item.columnId,
    closesAt: line?.limit ?? verdict?.limit ?? null,
    blocking,
    // Seul ce qui tient à l'article et au jour grise une colonne pendant un glisser.
    quantityIndependent: blocking === null || blocking === articleBlocking,
  };
}

/** L'erreur que `admitWithinDeadline` lèverait pour cette ligne, sans dérogation. */
function deadlineBlocking(
  day: string,
  line: LineVerdict,
  verdict: OrderDeadlineVerdict,
): PlannedLineBlocking | null {
  if (line.status === "open") {
    return null;
  }
  if (line.status === "grace" && verdict.graceEnd !== null) {
    return blockingOf(new OrderCutoffGraceError(day, verdict.graceEnd));
  }
  return blockingOf(new PastOrderCutoffError(day));
}

/** Une ligne planifiée se compte en pièces : un article au poids la refuse. */
function unitBlocking(
  sku: string,
  terms: PlannedSaleTerms | undefined,
): PlannedLineBlocking | null {
  if (terms === undefined) {
    return null;
  }
  return judged(() =>
    ensureSaleQuantity(
      { sku, saleUnit: terms.saleUnit, weightMinGrams: null, weightStepGrams: null },
      { quantity: 0, saleUnit: "piece" },
    ),
  );
}

function minimumBlocking(
  item: PlannedBasketCheckItem,
  terms: PlannedSaleTerms | undefined,
): PlannedLineBlocking | null {
  const quantity = item.quantity;
  if (terms === undefined || quantity === null) {
    return null;
  }
  return judged(() => ensureMinimumQuantity({ sku: item.sku, ...terms }, quantity));
}

function judged(rule: () => void): PlannedLineBlocking | null {
  try {
    rule();
    return null;
  } catch (error) {
    const blocking = blockingOf(error);
    if (blocking === null) {
      throw error;
    }
    return blocking;
  }
}

function blockingOf(error: unknown): PlannedLineBlocking | null {
  if (error === null) {
    return null;
  }
  const refusal = recurringRefusalOf(error);
  return refusal === null ? null : { cause: refusal.cause, reason: refusal.reason };
}
