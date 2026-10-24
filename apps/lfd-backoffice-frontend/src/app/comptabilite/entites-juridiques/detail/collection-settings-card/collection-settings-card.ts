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
  DEPOSIT_CUTOFF_MAX_BUSINESS_DAYS,
  DEPOSIT_CUTOFF_MIN_BUSINESS_DAYS,
  type LegalEntityView,
  PRE_NOTIFICATION_MAX_DAYS,
  PRE_NOTIFICATION_MIN_DAYS,
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
  delayExample,
  depositExample,
  tightDepositMarginSentence,
} from '../../../collection-schedule-wording';
import { LegalEntitiesService } from '../../../legal-entities.service';

/**
 * **Le prélèvement automatique de l'entité** : le calendrier du cycle en
 * cours, l'automatisme, et les réglages qui décident des dates (plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA1).
 *
 * ## Le calendrier vient du serveur
 *
 * Échéance reportée au jour ouvré TARGET2, date limite de dépôt : l'écran les
 * AFFICHE, il ne les recalcule pas. Un second calcul de Pâques côté front
 * finirait par dire une autre date que le fichier déposé.
 *
 * ## Un seul délai : la notification ET l'échéance (Hugo, 2026-10-24)
 *
 * « Délai de notification » est le seul nombre de jours de l'écran : il fixe
 * l'avis au client et l'échéance (clôture + N, reportée au jour ouvré
 * TARGET2). « Enregistrer » écrit N dans le délai de pré-notification et
 * remet l'échéance propre à `null` (= le délai). Une entité qui portait une
 * échéance distincte s'affiche à sa valeur EFFECTIVE, et s'aligne au premier
 * enregistrement.
 *
 * Deux routes existantes, dans CET ordre : le calendrier d'abord (échéance
 * `null`, qui ne contredit jamais aucun délai), puis le délai. L'ordre inverse
 * serait refusé (409) dès que N dépasse l'ancienne échéance. Si le second
 * appel échoue, l'état intermédiaire reste valide : échéance = ancien délai.
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
  protected readonly minDays = PRE_NOTIFICATION_MIN_DAYS;
  protected readonly maxDays = PRE_NOTIFICATION_MAX_DAYS;
  protected readonly minCutoff = DEPOSIT_CUTOFF_MIN_BUSINESS_DAYS;
  protected readonly maxCutoff = DEPOSIT_CUTOFF_MAX_BUSINESS_DAYS;
  protected readonly marginSentence = tightDepositMarginSentence;

  protected readonly delayDraft = signal<number | null>(null);
  /** Le délai de notification — à la fois l'avis et l'échéance. */
  protected readonly daysDraft = signal<number | null>(null);
  protected readonly cutoffDaysDraft = signal<number | null>(null);
  protected readonly cutoffTimeDraft = signal('');

  /** Les deux champs du cut-off vont ensemble : l'un sans l'autre n'est pas une date. */
  protected readonly cutoffIncomplete = computed(
    () => (this.cutoffDaysDraft() === null) !== (this.cutoffTimeDraft().trim() === ''),
  );

  protected readonly delayHint = computed(() => delayExample(this.delayDraft()));
  protected readonly daysHint = computed(() => daysExample(this.daysDraft()));
  /**
   * Hors bornes : une entité réglée à 1 ou 2 jours avant le minimum de 3 se
   * relit telle quelle, mais ne se réenregistre pas sans le relever.
   */
  protected readonly daysOutOfRange = computed(() => {
    const days = this.daysDraft();
    return days === null || days < this.minDays || days > this.maxDays;
  });
  protected readonly depositHint = computed(() =>
    depositExample(this.cutoffDaysDraft(), this.cutoffTimeDraft()),
  );

  constructor() {
    effect(() => {
      const current = this.entity();
      this.delayDraft.set(current.autoCollectionDelayHours);
      this.daysDraft.set(current.collectionDaysAfterClosure ?? current.preNotificationDays);
      this.cutoffDaysDraft.set(current.depositCutoff?.businessDaysBefore ?? null);
      this.cutoffTimeDraft.set(current.depositCutoff?.time ?? '');
    });
  }

  protected saveSchedule(): void {
    const delayHours = this.delayDraft();
    const days = this.daysDraft();
    if (delayHours === null || days === null || this.cutoffIncomplete() || this.daysOutOfRange()) {
      return;
    }
    const cutoffDays = this.cutoffDaysDraft();
    const payload: SetCollectionSchedulePayload = {
      delayHours,
      daysAfterClosure: null,
      depositCutoff:
        cutoffDays === null
          ? null
          : { businessDaysBefore: cutoffDays, time: this.cutoffTimeDraft().trim() },
    };
    const { id, preNotificationDays } = this.entity();
    this.saved.emit({
      action: async () => {
        await this.api.setCollectionSchedule(id, payload);
        // Un délai inchangé n'est pas un fait : on ne le réécrit pas.
        if (days !== preNotificationDays) {
          await this.api.setPreNotification(id, { days });
        }
      },
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
