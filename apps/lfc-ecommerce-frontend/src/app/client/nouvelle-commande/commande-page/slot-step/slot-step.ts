import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { PickupSlot } from '@lfd/contracts';
import { FoldEmptyStateComponent } from 'fold-ng';

import { ClientCopyService, fill } from '../../../../client/copy/client-copy.service';
import { formatWindow } from '../../../../client/format-hour';

/** Les deux chemins de service posent la même question d'heure, autrement. */
export type SlotMode = 'pickup' | 'delivery';

/** Le moment de la journée — le fournil travaille en deux temps. */
type DayPart = 'am' | 'pm';

/** Midi, en `HH:MM` : la frontière entre les deux groupes. */
const NOON = '12:00';

/**
 * Le choix du créneau — SECOND VOLET du dialogue de service, pas un écran à
 * part.
 *
 * C'est délibéré : où et quand sont deux temps d'une même question. Les séparer
 * en deux surfaces obligeait à fermer la première pour ouvrir la seconde, et on
 * perdait de vue le lieu qu'on venait de choisir. Ici il reste au sous-titre.
 *
 * Le volet ne décide de rien : il remonte le créneau, et c'est le dialogue qui
 * porte le bouton — lui seul sait ce que valider veut dire à cette étape.
 *
 * ## 🔴 Il ne fabrique plus sa grille
 *
 * Il lisait `ORDER_SLOTS` : huit heures écrites en dur, identiques pour tous les
 * points, avec des états inventés — « complet », « sortie du four ». Aucun
 * n'avait de source ; le système ne connaît ni la capacité d'un créneau ni
 * l'heure d'enfournement. Un client lisait « complet » sur une heure libre.
 *
 * Les créneaux **entrent** désormais, déduits des heures déclarées du point de
 * retrait (`pickupSlots`). Une liste vide n'est pas un bug : c'est un point qui
 * n'a pas déclaré ses heures, et l'écran le dit.
 */
@Component({
  selector: 'app-slot-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldEmptyStateComponent],
  templateUrl: './slot-step.html',
  styleUrl: './slot-step.scss',
})
export class SlotStep {
  readonly mode = input.required<SlotMode>();

  /** Le point de retrait ou l'adresse — le volet le rappelle en tête. */
  readonly place = input.required<string>();

  /** Les créneaux ouverts ici. Vide = aucune heure déclarée. */
  readonly slots = input.required<readonly PickupSlot[]>();

  readonly pickedChange = output<PickupSlot | null>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly pickedId = signal<string | null>(null);

  protected readonly intro = computed(() => {
    const c = this.t().slotStep;
    const sentence = this.mode() === 'pickup' ? c.pickupIntro : c.deliveryIntro;
    return fill(sentence, { place: this.place() });
  });

  protected readonly groups = computed(() => {
    const c = this.t().slotStep;
    // Le libellé et le groupe se lisent sur l'heure elle-même : un créneau sans
    // borne basse (« avant 8 h ») tombe le matin, ce qu'il est.
    const shown = this.slots().map((slot) => ({
      ...slot,
      label: formatWindow(slot.start, slot.end, c.before),
      sub: slot.access === 'pro' ? c.proOnly : c.free,
      part: ((slot.start ?? '00:00') < NOON ? 'am' : 'pm') as DayPart,
    }));
    return [
      { id: 'am', title: c.amGroup, slots: shown.filter((slot) => slot.part === 'am') },
      { id: 'pm', title: c.pmGroup, slots: shown.filter((slot) => slot.part === 'pm') },
    ].filter((group) => group.slots.length > 0);
  });

  protected pick(slot: PickupSlot): void {
    this.pickedId.set(slot.id);
    this.pickedChange.emit(slot);
  }
}
