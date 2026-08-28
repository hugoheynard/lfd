import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { ClientCopyService, fill } from '../../../../client/copy/client-copy.service';
import {
  type DayPart,
  isSlotOpen,
  type OrderSlot,
  ORDER_SLOTS,
} from '../../../../client/mock-station';

/** Les deux chemins de service posent la même question d'heure, autrement. */
export type SlotMode = 'pickup' | 'delivery';

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
 */
@Component({
  selector: 'app-slot-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './slot-step.html',
  styleUrl: './slot-step.scss',
})
export class SlotStep {
  readonly mode = input.required<SlotMode>();

  /** Le point de retrait ou l'adresse — le volet le rappelle en tête. */
  readonly place = input.required<string>();

  readonly pickedChange = output<OrderSlot | null>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly pickedId = signal<string | null>(null);

  protected readonly intro = computed(() => {
    const c = this.t().slotStep;
    const sentence = this.mode() === 'pickup' ? c.pickupIntro : c.deliveryIntro;
    return fill(sentence, { place: this.place() });
  });

  protected readonly groups = computed(() => {
    const c = this.t().slotStep;
    const label: Record<OrderSlot['state'], string> = {
      'first-batch': c.firstBatch,
      free: c.free,
      full: c.full,
      'second-batch': c.secondBatch,
      'labo-only': c.laboOnly,
    };
    const of = (part: DayPart): readonly (OrderSlot & { sub: string; open: boolean })[] =>
      ORDER_SLOTS.filter((slot) => slot.part === part).map((slot) => ({
        ...slot,
        sub: label[slot.state],
        open: isSlotOpen(slot),
      }));
    return [
      { id: 'am', title: c.amGroup, slots: of('am') },
      { id: 'pm', title: c.pmGroup, slots: of('pm') },
    ];
  });

  protected pick(slot: OrderSlot): void {
    if (isSlotOpen(slot)) {
      this.pickedId.set(slot.id);
      this.pickedChange.emit(slot);
    }
  }
}
