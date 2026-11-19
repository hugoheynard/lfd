import type { ItemLimitOverride } from "../services/item-limit-overrides.js";

/**
 * Port d'**écriture** des dépassements de limite de produit : une trace
 * ajoutée, jamais modifiée. Séparé de sa lecture
 * ({@link ItemLimitOverrideReader}) : la passation n'a rien à relire.
 */
export abstract class ItemLimitOverrideRecorder {
  /**
   * Consigne les dépassements d'une commande. Appelé DANS la transaction qui
   * l'écrit, après elle : la commande et sa trace partent ensemble, ou rien.
   */
  abstract record(overrides: readonly ItemLimitOverride[]): Promise<void>;
}
