import type { ProductAudienceCounterView } from "@lfd/contracts";

/** Port de **lecture** des compteurs d'audience — distinct de l'écrivain (ISP). */
export abstract class AudienceCounterReader {
  /** Les compteurs de `from` à `to` (jours métier, bornes comprises), par jour puis SKU. */
  abstract between(from: string, to: string): Promise<readonly ProductAudienceCounterView[]>;
}
