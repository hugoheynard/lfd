import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldMultiselectComponent,
  FoldNumberInputComponent,
  type FoldSelectOption,
} from 'fold-ng';
import type { AppointmentChannel, AvailabilityConfigView } from '@lfd/contracts';

import { AvailabilityService } from '../../../../commercial/availability/availability.service';
import { MetricInfo } from '../../../../shared/metric-info/metric-info';

import { withPolicy, type AvailabilityDraft } from '../availability-draft';

/** Les canaux proposables, au format attendu par `fold-multiselect`. */
const CHANNELS: readonly FoldSelectOption<AppointmentChannel>[] = [
  { value: 'phone', label: 'Téléphone' },
  { value: 'visio', label: 'Visio' },
  { value: 'onsite', label: 'Sur place' },
];

/**
 * Carte **Règles de réservation** : durée d'un rendez-vous, délai de prévenance,
 * horizon, et les canaux proposés au client.
 *
 * Ces quatre réglages bornent ce que `slotsFor` rend réservable — ce sont eux,
 * pas la grille, qui décident qu'un créneau ouvert reste hors d'atteinte.
 *
 * Chaque libellé porte son **unité** entre parenthèses, et une bulle d'aide en
 * fin de ligne dit ce que le réglage change réellement. Ces explications ne
 * tiennent pas en un `hint` d'une ligne : « 30 minutes » ne dit pas que c'est
 * aussi le pas de découpe des plages, ni que la prévenance borne l'annulation.
 *
 * **Elle enregistre elle-même**, sur une route qui n'écrit que la politique.
 * Régler une durée ne renvoie donc pas la grille — et ne peut pas l'écraser avec
 * un état chargé il y a dix minutes, ni emporter au passage des plages que le
 * commercial était en train d'éditer sans avoir décidé de les enregistrer.
 * Le brouillon reste partagé (les créneaux dépendent des deux) ; c'est
 * l'**écriture** qui est isolée.
 */
@Component({
  selector: 'app-booking-policy-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldNumberInputComponent,
    FoldMultiselectComponent,
    FoldButtonComponent,
    MetricInfo,
  ],
  templateUrl: './booking-policy-card.html',
  styleUrl: './booking-policy-card.scss',
})
export class BookingPolicyCard {
  private readonly service = inject(AvailabilityService);

  readonly draft = input.required<AvailabilityDraft>();
  readonly changed = output<AvailabilityDraft>();
  /** Enregistré : le parent rafraîchit l'aperçu, que la politique vient de changer. */
  readonly persisted = output<AvailabilityConfigView>();

  protected readonly channels = CHANNELS;
  protected readonly policy = computed(() => this.draft().policy);

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly failed = signal(false);

  async save(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    this.failed.set(false);
    try {
      const config = await this.service.savePolicy(this.policy());
      this.saved.set(true);
      // On remonte ce que le SERVEUR a enregistré : le parent réaligne le
      // brouillon et recharge l'aperçu, qui dépend de ces bornes.
      this.persisted.emit(config);
    } catch {
      this.failed.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  protected setSlotMinutes(value: number | null): void {
    this.edit(withPolicy(this.draft(), { slotMinutes: atLeast(value, 5) }));
  }

  protected setLeadTime(value: number | null): void {
    this.edit(withPolicy(this.draft(), { leadTimeHours: atLeast(value, 0) }));
  }

  protected setHorizon(value: number | null): void {
    this.edit(withPolicy(this.draft(), { horizonDays: atLeast(value, 1) }));
  }

  /**
   * Applique la sélection de canaux. Une sélection **vide** est refusée : sans
   * aucun canal, plus rien n'est réservable — on garde donc l'état précédent
   * plutôt que d'enregistrer une configuration qui ferme l'agenda en silence.
   */
  protected setChannels(channels: readonly AppointmentChannel[]): void {
    if (channels.length === 0) {
      return;
    }
    this.edit(withPolicy(this.draft(), { channels: [...channels] }));
  }

  /** Applique une édition et retire l'indicateur « enregistré », devenu faux. */
  private edit(draft: AvailabilityDraft): void {
    this.saved.set(false);
    this.changed.emit(draft);
  }
}

/** Un entier ≥ `min` — `fold-number-input` rend `null` quand le champ est vidé. */
function atLeast(value: number | null, min: number): number {
  return value !== null && Number.isFinite(value) ? Math.max(min, Math.trunc(value)) : min;
}
