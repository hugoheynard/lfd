import { computed, signal } from '@angular/core';

import type { ImageDescription } from '../rules/image-description';
import { isDescribed, type ReplaceCandidate } from '../rules/replace-rules';

/**
 * **Le remplacement en préparation** — la nouvelle image désignée, la reprise
 * de description, la confirmation et le refus du serveur.
 *
 * Une instance par panneau. Elle ne sait rien du transport : le panneau lui
 * dit ce qui a été désigné, et ce que le serveur a répondu.
 */
export class ReplaceDraft {
  readonly candidate = signal<ReplaceCandidate | null>(null);
  readonly takeOver = signal(false);
  readonly confirming = signal(false);
  readonly running = signal(false);
  readonly failure = signal<string | null>(null);

  /** La nouvelle est l'ancienne : le serveur refuserait, l'écran le dit avant. */
  readonly sameImage = computed(() => this.candidate()?.image.url === this.from().url);

  /** Prêt à remplacer : une nouvelle désignée, et des porteurs connus à repointer. */
  readonly canReplace = computed(
    () => this.candidate() !== null && !this.sameImage() && this.carriersReady() && !this.running(),
  );

  constructor(
    private readonly from: () => ImageDescription,
    private readonly carriersReady: () => boolean,
  ) {}

  designate(candidate: ReplaceCandidate): void {
    this.candidate.set(candidate);
    // Cochée d'office seulement si la nouvelle n'a rien : dans le doute
    // (`null`), on n'écrase pas une description qu'on n'a pas lue.
    this.takeOver.set(candidate.described === false && isDescribed(this.from()));
    this.confirming.set(false);
    this.failure.set(null);
  }

  /** Défait la désignation : on revient au choix. */
  undesignate(): void {
    this.candidate.set(null);
    this.takeOver.set(false);
    this.confirming.set(false);
    this.failure.set(null);
  }

  ask(): void {
    if (this.canReplace()) {
      this.failure.set(null);
      this.confirming.set(true);
    }
  }

  /** Le serveur a refusé : tout reste à l'écran, nouvelle image désignée. */
  refused(refusal: string): void {
    this.failure.set(refusal);
    this.confirming.set(false);
  }
}
