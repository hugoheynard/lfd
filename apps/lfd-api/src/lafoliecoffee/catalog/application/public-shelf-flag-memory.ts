import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";

/**
 * Combien de temps une instance de l'API se fie à l'état du drapeau public
 * qu'elle a lu dans l'objet des rayons (Hugo, 2026-11-04).
 */
export const PUBLIC_FLAG_MEMORY_MS = 5000;

/**
 * **L'état « allumé/éteint » du rayon public, gardé quelques secondes par
 * instance.** Drapeau éteint, chaque réponse publique coûtait un aller-retour
 * vers l'objet pour apprendre qu'elle ne se garderait pas ; cette mémoire
 * l'épargne pendant {@link PUBLIC_FLAG_MEMORY_MS}.
 *
 * Ce que ça coûte : **une bascule faite par une AUTRE instance met au plus
 * 5 s à être vue ici.** Allumé entre-temps : quelques réponses de plus restent
 * privées, sans dommage. Éteint entre-temps : sans effet, car la mémoire ne
 * sert qu'à sauter le relevé quand le drapeau est ÉTEINT — allumé, le relevé
 * a lieu de toute façon, puisque la VERSION se relit avant et après chaque
 * calcul et ne se garde jamais ici. Une bascule par l'interrupteur de CETTE
 * instance l'oublie tout de suite ({@link forget}).
 *
 * Seul un relevé réussi s'y range : un objet injoignable ne laisse rien, et
 * la réponse reste privée.
 */
@Injectable()
export class PublicShelfFlagMemory {
  private remembered: { readonly enabled: boolean; readonly until: number } | null = null;

  constructor(private readonly clock: Clock) {}

  remember(enabled: boolean): void {
    this.remembered = { enabled, until: this.clock.now().getTime() + PUBLIC_FLAG_MEMORY_MS };
  }

  /** Le drapeau est-il connu ÉTEINT, et la mémoire encore fraîche ? */
  knownDisabled(): boolean {
    const remembered = this.remembered;
    return (
      remembered !== null && !remembered.enabled && this.clock.now().getTime() < remembered.until
    );
  }

  forget(): void {
    this.remembered = null;
  }
}
