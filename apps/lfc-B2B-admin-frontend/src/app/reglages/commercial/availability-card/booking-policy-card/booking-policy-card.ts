import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldCardComponent, FoldElementTitleComponent, FoldNumberInputComponent } from 'fold-ng';
import type { AppointmentChannel } from '@lfd/contracts';

import { MetricInfo } from '../../../../shared/metric-info/metric-info';

import { withPolicy, type AvailabilityDraft } from '../availability-draft';

/** Les canaux proposables, avec leur libellé. */
const CHANNELS: readonly { key: AppointmentChannel; label: string }[] = [
  { key: 'phone', label: 'Téléphone' },
  { key: 'visio', label: 'Visio' },
  { key: 'onsite', label: 'Sur place' },
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
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldNumberInputComponent, MetricInfo],
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

  /** Bascule un canal — on refuse de tous les décocher, sinon plus rien n'est réservable. */
  protected toggleChannel(channel: AppointmentChannel): void {
    const current = this.policy().channels;
    const next = current.includes(channel)
      ? current.filter((c) => c !== channel)
      : [...current, channel];
    if (next.length === 0) {
      return;
    }
    this.changed.emit(withPolicy(this.draft(), { channels: next }));
  }

  protected isChannelOn(channel: AppointmentChannel): boolean {
    return this.policy().channels.includes(channel);
  }
}

/** Un entier ≥ `min` — `fold-number-input` rend `null` quand le champ est vidé. */
function atLeast(value: number | null, min: number): number {
  return value !== null && Number.isFinite(value) ? Math.max(min, Math.trunc(value)) : min;
}
