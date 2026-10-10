import type { DeadLettersView } from "@lfd/contracts";

/** Combien de messages morts une lecture rend au plus — l'écran n'en montre pas plus. */
export const DEAD_LETTERS_LIMIT = 100;

/**
 * Port de **lecture** des messages morts (plan `plan-boite-d-envoi.md`, §8) :
 * les couples message × abonné non livrés qui ont épuisé leurs essais
 * (`isExhausted`). Distinct du dépôt du rejeu (ISP) : la carte de santé lit,
 * le rejeu écrit.
 */
export abstract class DeadLettersReader {
  abstract list(limit: number): Promise<DeadLettersView>;
}
