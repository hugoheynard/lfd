import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

import { CALL_SLOTS, type CallSlot } from '../call-slots';

/** Le choix « dès que possible », distinct des créneaux nommés. */
const ASAP = 'asap';

/**
 * Le panneau de rappel : quand le fournil décroche.
 *
 * Le créneau 12 h – 14 h reste **visible et inerte** au lieu de disparaître —
 * un trou dans la grille se lit comme un bug, « au four » se lit comme une
 * boulangerie. L'encart d'information le dit en toutes lettres, pour que
 * l'indisponibilité soit une explication et pas une punition.
 */
@Component({
  selector: 'app-rappel-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './rappel-panel.html',
  styleUrl: './rappel-panel.scss',
})
export class RappelPanel {
  readonly phone = input.required<string>();
  readonly booked = output<string>();

  protected readonly slots = CALL_SLOTS;
  protected readonly asap = ASAP;
  protected readonly picked = signal<string | null>(null);

  protected readonly ctaLabel = computed(() =>
    this.picked() ? 'Demander le rappel' : 'Choisissez un moment',
  );

  protected pick(slot: CallSlot): void {
    if (!slot.closed) {
      this.picked.set(slot.id);
    }
  }

  protected confirm(): void {
    const id = this.picked();
    if (id === null) {
      return;
    }
    const slot = this.slots.find((s) => s.id === id);
    this.booked.emit(slot ? slot.label : 'dans les 15 minutes');
  }
}
