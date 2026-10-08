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
import {
  AUTO_COLLECTION_DELAY_MAX_HOURS,
  AUTO_COLLECTION_DELAY_MIN_HOURS,
  COLLECTION_DAYS_MAX,
  DEPOSIT_CUTOFF_MAX_BUSINESS_DAYS,
  DEPOSIT_CUTOFF_MIN_BUSINESS_DAYS,
  type LegalEntityView,
  type SetCollectionSchedulePayload,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { AutopilotLastRun } from '../../../autopilot-last-run/autopilot-last-run';
import { CollectionCalendar } from '../../../collection-calendar/collection-calendar';
import {
  daysExample,
  daysTooShort,
  delayExample,
  depositExample,
} from '../../../collection-schedule-wording';
import { LegalEntitiesService } from '../../../legal-entities.service';

/**
 * **Le prélèvement automatique de l'entité** : le calendrier du cycle en
 * cours, l'automatisme, et les réglages qui décident des dates (plan
 * `documentation/facturation/plan-prelevement-automatique.md`, PA1).
 *
 * ## Le calendrier vient du serveur
 *
 * Échéance reportée au jour ouvré TARGET2, date limite de dépôt : l'écran les
 * AFFICHE, il ne les recalcule pas. Un second calcul de Pâques côté front
 * finirait par dire une autre date que le fichier déposé.
 *
 * ## Le refus « N < délai » est celui du serveur
 *
 * La carte ne valide que la forme. La règle — l'échéance ne précède pas la
 * fin du préavis — est dans l'agrégat, dont le message nomme les deux
 * valeurs et la clause des CGV ; la page l'affiche tel quel.
 *
 * ## L'automatisme a son propre bouton
 *
 * Activer fera partir des lots et des avis sans clic (PA3) : c'est un fait
 * de journal à part, jamais un champ glissé sous « Enregistrer ».
 *
 * ## Sa dernière tentative se lit ici
 *
 * Quand, pour quel lot, avec quelle issue (PA3) — un échec ne se retente
 * pas, la carte le dit et nomme le geste de sortie.
 */
@Component({
  selector: 'app-collection-settings-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AutopilotLastRun,
    CollectionCalendar,
    FoldPageSectionComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    FoldNumberInputComponent,
    FoldInputComponent,
  ],
  templateUrl: './collection-settings-card.html',
  styleUrl: './collection-settings-card.scss',
})
export class CollectionSettingsCard {
  private readonly api = inject(LegalEntitiesService);

  readonly entity = input.required<LegalEntityView>();
  readonly busy = input(false);

  /** Ce que le geste a fait, pour que la page relise et annonce. */
  readonly saved = output<{ readonly action: () => Promise<unknown>; readonly said: string }>();

  protected readonly minDelay = AUTO_COLLECTION_DELAY_MIN_HOURS;
  protected readonly maxDelay = AUTO_COLLECTION_DELAY_MAX_HOURS;
  protected readonly maxDays = COLLECTION_DAYS_MAX;
  protected readonly minCutoff = DEPOSIT_CUTOFF_MIN_BUSINESS_DAYS;
  protected readonly maxCutoff = DEPOSIT_CUTOFF_MAX_BUSINESS_DAYS;

  protected readonly delayDraft = signal<number | null>(null);
  /** Vide = l'échéance suit le délai de pré-notification. */
  protected readonly daysDraft = signal<number | null>(null);
  protected readonly cutoffDaysDraft = signal<number | null>(null);
  protected readonly cutoffTimeDraft = signal('');

  /** Les deux champs du cut-off vont ensemble : l'un sans l'autre n'est pas une date. */
  protected readonly cutoffIncomplete = computed(
    () => (this.cutoffDaysDraft() === null) !== (this.cutoffTimeDraft().trim() === ''),
  );

  protected readonly delayHint = computed(() => delayExample(this.delayDraft()));
  protected readonly daysHint = computed(() =>
    daysExample(this.daysDraft(), this.entity().preNotificationDays),
  );
  protected readonly daysTooShort = computed(() =>
    daysTooShort(this.daysDraft(), this.entity().preNotificationDays),
  );
  protected readonly depositHint = computed(() =>
    depositExample(this.cutoffDaysDraft(), this.cutoffTimeDraft()),
  );

  constructor() {
    effect(() => {
      const current = this.entity();
      this.delayDraft.set(current.autoCollectionDelayHours);
      this.daysDraft.set(current.collectionDaysAfterClosure);
      this.cutoffDaysDraft.set(current.depositCutoff?.businessDaysBefore ?? null);
      this.cutoffTimeDraft.set(current.depositCutoff?.time ?? '');
    });
  }

  protected saveSchedule(): void {
    const delayHours = this.delayDraft();
    if (delayHours === null || this.cutoffIncomplete()) {
      return;
    }
    const cutoffDays = this.cutoffDaysDraft();
    const payload: SetCollectionSchedulePayload = {
      delayHours,
      daysAfterClosure: this.daysDraft(),
      depositCutoff:
        cutoffDays === null
          ? null
          : { businessDaysBefore: cutoffDays, time: this.cutoffTimeDraft().trim() },
    };
    const id = this.entity().id;
    this.saved.emit({
      action: () => this.api.setCollectionSchedule(id, payload),
      said: 'Calendrier de prélèvement enregistré.',
    });
  }

  protected toggleAuto(): void {
    const id = this.entity().id;
    const enabled = !this.entity().autoCollectionEnabled;
    this.saved.emit({
      action: () => this.api.setAutoCollection(id, { enabled }),
      said: enabled ? 'Prélèvement automatique activé.' : 'Prélèvement automatique désactivé.',
    });
  }
}
