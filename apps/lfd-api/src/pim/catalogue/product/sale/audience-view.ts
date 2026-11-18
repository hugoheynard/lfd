import { effectiveAudience, type Audience } from "../../shared/domain/value-objects/audience.js";
import type { Product } from "../domain/entities/product.js";

/** Ce que les lectures d'une fiche disent de son audience, en plus de la sienne. */
export interface AudienceView {
  readonly effectiveAudience: Audience;
  readonly audienceInherited: boolean;
}

/**
 * L'audience effective d'une fiche et sa provenance, partagée par la liste et
 * le détail : deux lectures qui la recalculeraient chacune finiraient par ne
 * plus dire la même chose.
 */
export function audienceView(product: Product, categoryAudience: Audience): AudienceView {
  return {
    effectiveAudience: effectiveAudience(product.audience, categoryAudience),
    audienceInherited: product.audience === null,
  };
}
