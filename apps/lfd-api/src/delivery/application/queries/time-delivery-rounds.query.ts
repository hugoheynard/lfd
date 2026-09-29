import type { TimeDeliveryRoundsPayload } from "@lfd/contracts";

/**
 * **Chronométrer** une composition éditée à la main (plan de tournée, lot 10
 * bis, L10b-C2) — une LECTURE : la composition glissée est chronométrée telle
 * quelle, rien n'est écrit. « Appliquer » reste le seul geste qui écrit.
 */
export class TimeDeliveryRoundsQuery {
  constructor(readonly composition: TimeDeliveryRoundsPayload) {}
}
