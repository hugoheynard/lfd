import type { OrderQuoteExceededLimitView } from "@lfd/contracts";

import type { ExceededItemLimit } from "../../../order-cutoffs/index.js";

/**
 * Une limite de produit passée, dite à l'écran de l'équipe — l'avis de la
 * saisie et le devis d'une modification la disent de la même façon.
 */
export function exceededViewOf(passed: ExceededItemLimit): OrderQuoteExceededLimitView {
  return {
    sku: passed.sku,
    daysBefore: passed.rule.daysBefore,
    time: passed.rule.time,
    limitAt: passed.limit.toISOString(),
  };
}
