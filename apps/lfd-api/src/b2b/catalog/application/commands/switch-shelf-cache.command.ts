import type { ShelfCacheState, ShelfSwitchAction } from "../../domain/ports/shop-shelf-switch.js";

/**
 * Ce qu'est devenue la purge de Workers Cache qu'un geste demande (C3) :
 * `not_needed` pour un geste qui allume, `failed` se dit à l'appelant — le
 * drapeau a basculé, mais une réponse publique déjà gardée peut vivre encore
 * jusqu'à 30 s.
 */
export type PublicPurgeReport = "done" | "failed" | "not_needed";

/** L'état relu par le magasin, et la purge publique du geste. */
export interface ShelfSwitchOutcome extends ShelfCacheState {
  readonly publicPurge: PublicPurgeReport;
}

/**
 * Éteindre, rallumer ou vider le cache des rayons en production, sans
 * redéployer (`le-rayon-en-cache.md`, « L'interrupteur ») — le rayon
 * public compris depuis C3.
 */
export class SwitchShelfCacheCommand {
  constructor(readonly action: ShelfSwitchAction) {}
}
