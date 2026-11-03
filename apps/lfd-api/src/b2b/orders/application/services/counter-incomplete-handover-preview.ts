import type {
  CounterIncompleteHandoverLine,
  CounterIncompleteHandoverRefusal,
  CounterIncompleteHandoverView,
} from "@lfd/contracts";

import type { CounterHandoverPreview } from "../../../../handover/channels/commerce/index.js";
import type { PackingShortfallPreview } from "../../../../packing/channels/commerce/index.js";
import type { ShortfallDecisionSubject } from "../../domain/entities/shortfall-decision.js";
import {
  decidabilityRefusalOf,
  departingOf,
  type ShortfallDecisionRefusal,
} from "../../domain/services/shortfall-decidability.js";

/** Ce que les trois blocs disent de la commande — le bac `null` s'il n'a pas été lu. */
export interface CounterIncompleteHandoverFacts {
  readonly subject: ShortfallDecisionSubject;
  readonly counter: CounterHandoverPreview;
  readonly bin: PackingShortfallPreview | null;
}

/**
 * Les refus de la décision, dans le vocabulaire de l'aperçu. Un reliquat
 * pas prévu ne se présente pas au comptoir (rang 1 seulement) : il se dit
 * comme une commande plus à coliser.
 */
const DECISION_REFUSALS: Readonly<
  Record<ShortfallDecisionRefusal, CounterIncompleteHandoverRefusal>
> = {
  already_decided: "already_decided",
  not_confirmed: "not_confirmed",
  remainder_not_planned: "not_confirmed",
  card: "card",
  voucher: "voucher",
  too_old: "too_old",
};

/**
 * **L'aperçu, dans l'ordre du geste** (`HandOverPackedAtCounterHandler`) :
 * le retrait juge (portée du comptoir, puis remise), la décision juge ce qui
 * ne dépend pas du bac, le colisage juge le bac, puis « rien au bac ». Le
 * PREMIER refus rencontré est rendu ; les règles sont celles des gestes,
 * jamais recopiées (C1b, Hugo, 2026-11-03).
 */
export function counterIncompleteHandoverPreviewOf(
  orderId: string,
  facts: CounterIncompleteHandoverFacts,
): CounterIncompleteHandoverView {
  const lines = facts.bin?.kind === "short" ? facts.bin.lines.map(lineOf) : [];
  const { counter } = facts;
  if (counter.kind === "out_of_reach") {
    return { orderId, refusal: counter.refusal, handoverRefusalReason: null, lines: [] };
  }
  if (counter.kind === "refused") {
    return { orderId, refusal: "handover_refused", handoverRefusalReason: counter.reason, lines };
  }
  return { orderId, refusal: binRefusalOf(facts), handoverRefusalReason: null, lines };
}

function binRefusalOf(
  facts: CounterIncompleteHandoverFacts,
): CounterIncompleteHandoverRefusal | null {
  const decision = decidabilityRefusalOf(facts.subject);
  if (decision !== null) {
    return DECISION_REFUSALS[decision];
  }
  if (facts.bin === null) {
    return "not_drawn";
  }
  if (facts.bin.kind === "refused") {
    return facts.bin.refusal;
  }
  return departingOf(facts.bin.lines) === null ? "nothing_departs" : null;
}

function lineOf(line: {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: CounterIncompleteHandoverLine["saleUnit"];
  readonly due: number;
  readonly packed: number;
}): CounterIncompleteHandoverLine {
  return {
    sku: line.sku,
    productName: line.productName,
    saleUnit: line.saleUnit,
    due: line.due,
    departing: line.packed,
    notDeparting: line.due - line.packed,
  };
}
