import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { BILLING_RHYTHM_KIND_LABELS, type LegalEntityBillingModeView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInlineConfirmComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import {
  closureLine,
  effectiveClosureSentence,
  LAST_CLOSING_DAY_OF_MONTH,
  ONE_CHANGE_AT_A_TIME,
  payersSentence,
  rhythmDraftProblem,
  rhythmSentence,
  sameRhythm,
  shortPeriodWarning,
  WEEKDAY_LABELS,
} from '../../../billing-rhythm-wording';
import { longDay } from '../../../collection-month-wording';
import { LegalEntitiesService } from '../../../legal-entities.service';

/** Les clôtures montrées : assez pour voir la bascule, pas un calendrier. */
const SHOWN_CLOSURES = 3;

/** Ce que le geste a fait, pour que la page relise et annonce. */
export interface BillingModeSaved {
  readonly action: () => Promise<unknown>;
  readonly said: string;
}

/**
 * **Un mode de facturation de l'entité** — ses dates, le programmé, le verrou
 * et ses prochaines clôtures (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`,
 * §16.9, M4b).
 *
 * ## L'avertissement précède le geste
 *
 * Un seul changement à la fois (§12) : la règle est écrite EN PERMANENCE, le
 * formulaire se ferme jusqu'à `changeLockedUntil`, et la confirmation nomme la
 * clôture de prise d'effet. Le 409 du serveur reste la garantie ; la page
 * l'affiche tel quel s'il arrive quand même.
 *
 * ## Aucune date n'est calculée ici
 *
 * Les clôtures, la prise d'effet et le verrou viennent du serveur. Seule la
 * FORME de la saisie est vérifiée ici, pour ne pas proposer un envoi voué au
 * refus.
 */
@Component({
  selector: 'app-billing-mode-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './billing-mode-row.html',
  styleUrl: './billing-mode-row.scss',
})
export class BillingModeRow {
  private readonly api = inject(LegalEntitiesService);

  readonly entityId = input.required<string>();
  readonly mode = input.required<LegalEntityBillingModeView>();
  readonly busy = input(false);

  readonly saved = output<BillingModeSaved>();

  protected readonly lastDay = LAST_CLOSING_DAY_OF_MONTH;
  protected readonly rule = ONE_CHANGE_AT_A_TIME;
  protected readonly weekdayChoices = Object.entries(WEEKDAY_LABELS).map(([value, label]) => ({
    value: Number(value),
    label: label.charAt(0).toUpperCase() + label.slice(1),
  }));

  protected readonly daysDraft = signal<readonly (number | null)[]>([]);

  protected readonly label = computed(() => BILLING_RHYTHM_KIND_LABELS[this.mode().mode]);

  protected readonly current = computed(() =>
    rhythmSentence({ kind: this.mode().mode, days: this.mode().current.days }),
  );

  protected readonly scheduled = computed(() => {
    const { mode, scheduled } = this.mode();
    return scheduled === null
      ? null
      : {
          sentence: rhythmSentence({ kind: mode, days: scheduled.days }),
          effectiveOn: longDay(scheduled.effectiveAt),
        };
  });

  /** « Modifiable à partir du … » ; `null` : libre. */
  protected readonly lockedUntil = computed(() => {
    const until = this.mode().changeLockedUntil;
    return until === null ? null : longDay(until);
  });

  protected readonly closures = computed(() =>
    this.mode().upcomingClosures.slice(0, SHOWN_CLOSURES).map(closureLine),
  );

  protected readonly payers = computed(() =>
    payersSentence(this.mode().mode, this.mode().payerCount),
  );

  protected readonly shortPeriod = computed(() => {
    const { scheduled, upcomingClosures } = this.mode();
    return scheduled === null ? null : shortPeriodWarning(scheduled.effectiveAt, upcomingClosures);
  });

  protected readonly problem = computed(() =>
    rhythmDraftProblem(this.mode().mode, this.daysDraft()),
  );

  /** Les dates qui feront foi si l'on ne fait rien : les programmées, sinon les courantes. */
  private readonly standing = computed(
    () => this.mode().scheduled?.days ?? this.mode().current.days,
  );

  protected readonly canSave = computed(() => {
    if (this.busy() || this.lockedUntil() !== null || this.problem() !== null) {
      return false;
    }
    const kind = this.mode().mode;
    return !sameRhythm({ kind, days: this.chosenDays() }, { kind, days: this.standing() });
  });

  protected readonly confirmMessage = computed(
    () =>
      `Les nouvelles dates prendront effet ${effectiveClosureSentence(this.mode().upcomingClosures)}, ` +
      'pour tous les clients de ce mode. Aucun autre changement ne sera possible avant.',
  );

  constructor() {
    effect(() => {
      this.daysDraft.set([...this.standing()]);
    });
  }

  protected setDay(index: number, value: number | null): void {
    this.daysDraft.update((days) => days.map((d, i) => (i === index ? value : d)));
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    const id = this.entityId();
    const mode = this.mode().mode;
    const days = this.chosenDays();
    this.saved.emit({
      action: () => this.api.setBillingModeDates(id, mode, { days }),
      said: `Nouvelles dates programmées pour le mode « ${this.label()} ».`,
    });
  }

  protected cancelScheduled(): void {
    const id = this.entityId();
    const mode = this.mode().mode;
    this.saved.emit({
      action: () => this.api.cancelScheduledBillingModeDates(id, mode),
      said: `Changement du mode « ${this.label()} » annulé.`,
    });
  }

  /** Deux fois par mois : les deux jours partent triés, comme le serveur les range. */
  private chosenDays(): number[] {
    const days = this.daysDraft().filter((d): d is number => d !== null);
    return this.mode().mode === 'semimonthly' ? [...days].sort((a, b) => a - b) : days;
  }
}
