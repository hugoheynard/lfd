import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { PublicPickupClosurePayload, PublicPickupClosureView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldDateComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTimeComponent,
} from 'fold-ng';

/** Ce qu'on ouvre : une fermeture à modifier, ou `null` pour en poser une neuve. */
export interface ClosurePanelData {
  readonly closure: PublicPickupClosureView | null;
}

/**
 * **Une fermeture datée** du retrait public (plan
 * `documentation/order/plan-creneaux-de-retrait.md`, D4).
 *
 * 🔴 Un **intervalle**, et non un jour : une semaine de congés est une ligne,
 * pas sept. C'est la différence assumée avec `AvailabilityException`, qui ne
 * porte qu'une journée et obligerait à saisir les vacances jour par jour.
 *
 * Les bornes horaires vont **par deux ou pas du tout** — le contrat le refuse
 * autrement. Une seule borne ne dit rien : « fermé à partir de 14 h » et « fermé
 * jusqu'à 14 h » s'écriraient pareil. D'où la case « journée entière » plutôt
 * que deux champs qu'on pourrait remplir à moitié.
 */
@Component({
  selector: 'app-closure-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldDateComponent,
    FoldInputComponent,
    FoldPanelHeaderComponent,
    FoldTimeComponent,
  ],
  templateUrl: './closure-panel.html',
  styleUrl: './closure-panel.scss',
})
export class ClosurePanel {
  private readonly ref = inject(FoldPanelRef<PublicPickupClosurePayload>);

  readonly data = input<ClosurePanelData | undefined>(undefined);

  protected readonly fromDay = signal('');
  protected readonly toDay = signal('');
  /** Le cas courant : on ferme des journées entières, pas des tranches. */
  protected readonly wholeDay = signal(true);
  protected readonly startTime = signal('09:00');
  protected readonly endTime = signal('12:00');
  protected readonly reason = signal('');

  protected readonly isCreate = computed(() => (this.data()?.closure ?? null) === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvelle fermeture' : 'Modifier la fermeture',
  );

  /** Les bornes tiennent debout : deux jours, dans l'ordre, et des heures cohérentes. */
  protected readonly canSubmit = computed(() => {
    if (this.fromDay() === '' || this.toDay() === '' || this.fromDay() > this.toDay()) {
      return false;
    }
    return this.wholeDay() || (this.startTime() !== '' && this.startTime() < this.endTime());
  });

  /** La fermeture en une phrase, relue avant d'être posée. */
  protected readonly recap = computed(() => {
    if (!this.canSubmit()) {
      return 'Choisissez un premier et un dernier jour ; le dernier ne peut pas précéder le premier.';
    }
    const span =
      this.fromDay() === this.toDay()
        ? `Le ${this.fromDay()}`
        : `Du ${this.fromDay()} au ${this.toDay()}`;
    const hours = this.wholeDay()
      ? 'aucun créneau de la journée'
      : `aucun créneau entre ${this.startTime()} et ${this.endTime()}`;
    return `${span} : ${hours}. Une fermeture prime sur toutes les plages.`;
  });

  constructor() {
    effect(() => {
      const closure = this.data()?.closure ?? null;
      if (closure === null) {
        return;
      }
      this.fromDay.set(closure.fromDay);
      this.toDay.set(closure.toDay);
      this.wholeDay.set(closure.startTime === null);
      this.startTime.set(closure.startTime ?? '09:00');
      this.endTime.set(closure.endTime ?? '12:00');
      this.reason.set(closure.reason);
    });
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    const whole = this.wholeDay();
    this.ref.close({
      fromDay: this.fromDay(),
      toDay: this.toDay(),
      startTime: whole ? null : this.startTime(),
      endTime: whole ? null : this.endTime(),
      reason: this.reason().trim(),
    });
  }

  protected cancel(): void {
    this.ref.close();
  }
}
