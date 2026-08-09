import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldMultiselectComponent,
  FoldNumberInputComponent,
  type FoldSelectOption,
} from 'fold-ng';
import type { AppointmentChannel } from '@lfd/contracts';

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
 */
@Component({
  selector: 'app-booking-policy-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldNumberInputComponent,
    FoldMultiselectComponent,
    MetricInfo,
  ],
  templateUrl: './booking-policy-card.html',
  styleUrl: './booking-policy-card.scss',
})
export class BookingPolicyCard {
  readonly draft = input.required<AvailabilityDraft>();
  readonly changed = output<AvailabilityDraft>();

  protected readonly channels = CHANNELS;
  protected readonly policy = computed(() => this.draft().policy);

  protected setSlotMinutes(value: number | null): void {
    this.changed.emit(withPolicy(this.draft(), { slotMinutes: atLeast(value, 5) }));
  }

  protected setLeadTime(value: number | null): void {
    this.changed.emit(withPolicy(this.draft(), { leadTimeHours: atLeast(value, 0) }));
  }

  protected setHorizon(value: number | null): void {
    this.changed.emit(withPolicy(this.draft(), { horizonDays: atLeast(value, 1) }));
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
    this.changed.emit(withPolicy(this.draft(), { channels: [...channels] }));
  }
}

/** Un entier ≥ `min` — `fold-number-input` rend `null` quand le champ est vidé. */
function atLeast(value: number | null, min: number): number {
  return value !== null && Number.isFinite(value) ? Math.max(min, Math.trunc(value)) : min;
}
