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
import type { BillingRhythmKind, BillingRhythmView, LegalEntityView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInlineConfirmComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import {
  closureLine,
  defaultDays,
  LAST_CLOSING_DAY_OF_MONTH,
  RHYTHM_KIND_CHOICES,
  rhythmDraftProblem,
  rhythmSentence,
  sameRhythm,
  shortPeriodWarning,
  WEEKDAY_LABELS,
} from '../../../billing-rhythm-wording';
import { longDay } from '../../../collection-month-wording';
import { day } from '../../../invoice-dossier-format';
import { LegalEntitiesService } from '../../../legal-entities.service';

/** Les clôtures montrées : assez pour voir la bascule, pas un calendrier. */
const SHOWN_CLOSURES = 3;

/**
 * **Le rythme de facturation de l'entité** (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`,
 * §6 et §12) : le rythme en vigueur, le programmé, les prochaines clôtures,
 * et le choix d'un nouveau rythme.
 *
 * ## L'avertissement précède le geste
 *
 * Un seul changement à la fois (§12) : la règle est écrite en permanence, le
 * formulaire se ferme tant qu'un changement attend sa facture, et la
 * confirmation nomme la clôture de prise d'effet. Le 409 du serveur reste la
 * garantie ; la page l'affiche tel quel s'il arrive quand même.
 *
 * ## Annuler, c'est renvoyer le rythme en vigueur
 *
 * Il n'y a pas de route d'annulation : le serveur lit « le rythme courant »
 * comme le retrait du programmé, tant que la prise d'effet n'est pas atteinte
 * (`canCancel`).
 *
 * ## Aucune date n'est calculée ici
 *
 * Les clôtures, leurs périodes et le jour de leur facture viennent de
 * `upcomingClosures` — la même fonction que celle qui facture.
 */
@Component({
  selector: 'app-billing-rhythm-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    FoldInlineConfirmComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './billing-rhythm-card.html',
  styleUrl: './billing-rhythm-card.scss',
})
export class BillingRhythmCard {
  private readonly api = inject(LegalEntitiesService);

  readonly entity = input.required<LegalEntityView>();
  readonly busy = input(false);

  /** Ce que le geste a fait, pour que la page relise et annonce. */
  readonly saved = output<{ readonly action: () => Promise<unknown>; readonly said: string }>();

  protected readonly kindChoices = RHYTHM_KIND_CHOICES;
  protected readonly weekdayChoices = Object.entries(WEEKDAY_LABELS).map(([value, label]) => ({
    value: Number(value),
    label: label.charAt(0).toUpperCase() + label.slice(1),
  }));
  protected readonly lastDay = LAST_CLOSING_DAY_OF_MONTH;

  protected readonly kindDraft = signal<BillingRhythmKind>('monthly');
  protected readonly daysDraft = signal<readonly (number | null)[]>([1]);

  protected readonly current = computed(() => rhythmSentence(this.entity().billingRhythm));
  protected readonly scheduled = computed(() => {
    const next = this.entity().nextBillingRhythm;
    return next === null
      ? null
      : { sentence: rhythmSentence(next), effectiveOn: longDay(next.effectiveAt) };
  });
  protected readonly lock = computed(() => {
    const lock = this.entity().billingRhythmChangeLock;
    return lock === null ? null : { ...lock, unlocksOn: day(lock.unlocksAfterInvoiceOn) };
  });
  protected readonly locked = computed(() => this.lock() !== null);

  protected readonly closures = computed(() =>
    this.entity().upcomingClosures.slice(0, SHOWN_CLOSURES).map(closureLine),
  );

  protected readonly shortPeriod = computed(() => {
    const next = this.entity().nextBillingRhythm;
    return next === null
      ? null
      : shortPeriodWarning(next.effectiveAt, this.entity().upcomingClosures);
  });

  protected readonly problem = computed(() =>
    rhythmDraftProblem(this.kindDraft(), this.daysDraft()),
  );

  /** Le rythme qui fera foi si l'on ne fait rien : le programmé, sinon le courant. */
  private readonly standing = computed(
    (): BillingRhythmView => this.entity().nextBillingRhythm ?? this.entity().billingRhythm,
  );

  private readonly draft = computed((): BillingRhythmView | null =>
    this.problem() === null
      ? { kind: this.kindDraft(), days: this.daysDraft().filter((d): d is number => d !== null) }
      : null,
  );

  protected readonly canSave = computed(() => {
    const draft = this.draft();
    return !this.busy() && !this.locked() && draft !== null && !sameRhythm(draft, this.standing());
  });

  /** La confirmation nomme la prise d'effet : la prochaine clôture sous le rythme actuel. */
  protected readonly confirmMessage = computed(() => {
    const first = this.entity().upcomingClosures[0];
    const when =
      first === undefined ? 'à la prochaine clôture' : `à la clôture du ${longDay(first.closesAt)}`;
    return (
      `Le nouveau rythme prendra effet ${when}. Aucun autre changement ne sera possible ` +
      'avant la facture de cette clôture.'
    );
  });

  constructor() {
    effect(() => {
      const standing = this.standing();
      this.kindDraft.set(standing.kind);
      this.daysDraft.set([...standing.days]);
    });
  }

  protected chooseKind(kind: BillingRhythmKind | null): void {
    if (kind === null || kind === this.kindDraft()) {
      return;
    }
    this.kindDraft.set(kind);
    this.daysDraft.set([...defaultDays(kind)]);
  }

  protected setDay(index: number, value: number | null): void {
    this.daysDraft.update((days) => days.map((d, i) => (i === index ? value : d)));
  }

  protected save(): void {
    const draft = this.draft();
    if (draft === null || !this.canSave()) {
      return;
    }
    const id = this.entity().id;
    const days =
      draft.kind === 'semimonthly' ? [...draft.days].sort((a, b) => a - b) : [...draft.days];
    this.saved.emit({
      action: () => this.api.setBillingRhythm(id, { kind: draft.kind, days }),
      said: 'Nouveau rythme de facturation programmé.',
    });
  }

  protected cancelScheduled(): void {
    const { id, billingRhythm } = this.entity();
    this.saved.emit({
      action: () =>
        this.api.setBillingRhythm(id, { kind: billingRhythm.kind, days: [...billingRhythm.days] }),
      said: 'Changement de rythme annulé.',
    });
  }
}
