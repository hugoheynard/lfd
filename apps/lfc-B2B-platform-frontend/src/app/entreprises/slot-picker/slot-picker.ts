import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FoldChoiceRowComponent, type FoldChoiceOption } from 'fold-ng';
import type { Slot } from '@lfd/contracts';

import { groupSlots, periodOf, type SlotPeriod } from './slots-model';

/** Le filtre de demi-journée, proposé seulement s'il sert à quelque chose. */
const PERIODS: readonly FoldChoiceOption[] = [
  { key: 'all', label: 'Tout' },
  { key: 'morning', label: 'Matin' },
  { key: 'afternoon', label: 'Après-midi' },
];

/**
 * **Choix d'un créneau** — les jours en sections, les heures en pastilles.
 *
 * Deux partis pris :
 *
 * - **aucune date brute.** « Aujourd'hui », « Demain », puis « jeudi 14 août » :
 *   c'est ce qu'on lit sans effort. `2026-08-14` demande une traduction mentale
 *   pour un geste qui devrait en être exempt ;
 * - le **filtre matin / après-midi** n'apparaît que si les deux existent
 *   réellement. Proposer de filtrer une liste qui n'a que des matinées, c'est
 *   offrir un bouton qui ne peut que vider l'écran.
 *
 * Le composant ne charge rien et ne réserve rien : il reçoit des créneaux et
 * rend celui qu'on choisit. C'est le panneau qui parle au serveur.
 */
@Component({
  selector: 'app-slot-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldChoiceRowComponent],
  templateUrl: './slot-picker.html',
  styleUrl: './slot-picker.scss',
})
export class SlotPicker {
  readonly slots = input.required<readonly Slot[]>();
  /** Le jour local du jour, et celui d'après — passés pour rester testable. */
  readonly today = input.required<string>();
  readonly tomorrow = input.required<string>();
  /** Le créneau retenu (`startAt` ISO), vide tant qu'on n'a rien choisi. */
  readonly chosen = model<string>('');

  protected readonly periods = PERIODS;
  protected readonly period = model<SlotPeriod>('all');

  /** Le filtre n'a de sens que si les deux demi-journées sont représentées. */
  protected readonly showFilter = computed(() => {
    const kinds = new Set(this.slots().map((slot) => periodOf(slot.time)));
    return kinds.size > 1;
  });

  protected readonly days = computed(() =>
    groupSlots(this.slots(), this.period(), this.today(), this.tomorrow()),
  );

  /** Combien de créneaux le filtre courant laisse — dit avant de faire défiler. */
  protected readonly count = computed(() =>
    this.days().reduce((total, day) => total + day.slots.length, 0),
  );

  protected onPeriod(key: string): void {
    this.period.set(key === 'morning' || key === 'afternoon' ? key : 'all');
  }
}
