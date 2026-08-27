import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { CALL_SLOTS, type CallSlot, isClosed } from '../call-slots';

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
  /** Le numéro du compte. Vide quand on ne le connaît pas — on n'en invente pas. */
  readonly phone = input.required<string>();
  readonly booked = output<string>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly asap = ASAP;
  protected readonly picked = signal<string | null>(null);

  /** Chaque créneau porte déjà son heure ; la langue n'habille que son état. */
  protected readonly slots = computed(() =>
    CALL_SLOTS.map((slot) => ({
      ...slot,
      closed: isClosed(slot),
      sub: this.t().rappel[
        slot.state === 'free' ? 'slotFree' : slot.state === 'full' ? 'slotFull' : 'slotOven'
      ],
    })),
  );

  protected readonly ctaLabel = computed(() =>
    this.picked() ? this.t().rappel.ctaReady : this.t().rappel.ctaIdle,
  );

  protected readonly phoneLine = computed(() => {
    const phone = this.phone();
    return phone === '' ? this.t().rappel.phoneUnknown : fill(this.t().rappel.phone, { phone });
  });

  protected pick(slot: CallSlot): void {
    if (!isClosed(slot)) {
      this.picked.set(slot.id);
    }
  }

  protected confirm(): void {
    const id = this.picked();
    if (id === null) {
      return;
    }
    const slot = CALL_SLOTS.find((s) => s.id === id);
    this.booked.emit(slot ? slot.label : this.t().rappel.asapTitle);
  }
}
