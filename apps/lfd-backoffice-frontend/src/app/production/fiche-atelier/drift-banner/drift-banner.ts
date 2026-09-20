import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import type { WorkshopDrift } from '@lfd/contracts';

/**
 * **Le bandeau de version périmée** — ce qui est arrivé depuis le tirage.
 *
 * Il ne dit jamais « attention » : un chiffre et une action, comme tout bandeau
 * de ce back-office. Les pièces en plus, sur combien de lignes, combien de
 * commandes — et surtout **les lignes nommées**, parce qu'une d'entre elles peut
 * être déjà cochée.
 *
 * 🔴 **Le cas dangereux est écrit en clair, pas résumé en compteur.** Quelqu'un
 * a déclaré avoir sorti 30 pièces d'un article qui en demande 42 ; personne ne
 * le saura au colisage. C'est la seule raison pour laquelle ce bandeau nomme ses
 * lignes au lieu d'afficher « 2 lignes modifiées ».
 *
 * ⚠️ **Ce qu'il ne dit PAS, faute de donnée** : « version de 6 h 20 ». La
 * maquette oppose l'heure de la version disponible à celle du tirage lu ;
 * `WorkshopDrift` ne porte aucun instant, et le seul qu'on ait est celui du
 * tirage. Fabriquer l'autre donnerait une heure que quelqu'un finirait par citer
 * au téléphone (relevé le 2026-09-13, cf. le rapport de lot).
 */
@Component({
  selector: 'app-drift-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './drift-banner.html',
  styleUrl: './drift-banner.scss',
})
export class DriftBanner {
  readonly drift = input.required<WorkshopDrift>();
  /** « 4 h 05 » — le tirage qu'on est en train de lire. */
  readonly generatedLabel = input.required<string>();
  /** Le bandeau condensé du téléphone : un chiffre, une action, rien de plus. */
  readonly compact = input(false);

  /** Absorber ce qui est arrivé. Le parent tient l'appel et son échec. */
  readonly retake = output<void>();

  /** L'écart est-il déplié ? Replié à l'ouverture : la phrase suffit d'abord. */
  protected readonly open = signal(false);

  protected readonly changedCount = computed(() => this.drift().lines.length);

  /**
   * Combien des lignes qui changent sont **déjà cochées**. Zéro reste une
   * information : elle dit qu'aucune fournée n'est partie sur un mauvais nombre.
   */
  protected readonly doneCount = computed(
    () => this.drift().lines.filter((line) => line.done).length,
  );

  protected toggle(): void {
    this.open.update((open) => !open);
  }
}
